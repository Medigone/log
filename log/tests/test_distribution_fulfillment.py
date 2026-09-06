import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import frappe

from log.services import distribution_fulfillment as fulfillment


class _Row(frappe._dict):
	def as_dict(self, no_nulls=False):
		return dict(self)


class _ItemsDoc:
	def __init__(self, items):
		self.items = items
		self.totals_calculated = False

	def set(self, field, value):
		setattr(self, field, value)

	def append(self, field, values):
		getattr(self, field).append(_Row(values))

	def calculate_taxes_and_totals(self):
		self.totals_calculated = True


class TestDistributionFulfillment(unittest.TestCase):
	def test_route_stock_summary_serializes_empty_loading_lines(self):
		route = frappe._dict(
			{
				"statut_chargement": "À charger",
				"stock_entry_chargement": None,
				"stock_entry_retour": None,
				"date_declaration_retour": None,
				"date_confirmation_retour": None,
				"lignes_chargement": [],
			}
		)
		summary = fulfillment.route_stock_summary(route)
		self.assertEqual(summary["status"], "À charger")
		self.assertEqual(summary["lines"], [])
		self.assertEqual(summary["loadedQuantity"], 0)

	def test_save_distribution_doc_skips_validate_for_driver_item_permissions(self):
		doc = Mock()
		doc.flags = frappe._dict()
		with patch.object(fulfillment.frappe, "flags", frappe._dict()):
			fulfillment._save_distribution_doc(doc)
		self.assertTrue(doc.flags.ignore_validate)
		self.assertTrue(doc.flags.ignore_permissions)
		doc.save.assert_called_once_with(ignore_permissions=True)

	def test_route_register_never_uses_global_vehicle_stock(self):
		line = frappe._dict({"loaded_qty": 10, "delivered_qty": 4, "returned_qty": 1})
		self.assertEqual(fulfillment._line_remaining(line), 5)

	def test_bundle_is_split_by_batch_and_keeps_source_warehouse(self):
		item = frappe._dict(
			{
				"item_code": "ITEM-BATCH",
				"parent": "DN-1",
				"warehouse": "DEPOT-A",
				"conversion_factor": 1,
				"serial_and_batch_bundle": "BUNDLE-1",
			}
		)
		entries = [
			frappe._dict({"batch_no": "LOT-A", "serial_no": None, "qty": -2, "warehouse": "DEPOT-A"}),
			frappe._dict({"batch_no": "LOT-B", "serial_no": None, "qty": -1, "warehouse": "DEPOT-A"}),
		]
		fake_db = Mock()
		fake_db.get_value.return_value = (0, 1)
		with patch.object(fulfillment.frappe, "get_all", return_value=entries), patch.object(fulfillment.frappe, "db", fake_db):
			fragments = fulfillment._tracking_fragments(item, 3)

		self.assertEqual([(row["batch_no"], row["qty"]) for row in fragments], [("LOT-A", 2), ("LOT-B", 1)])
		self.assertTrue(all(row["warehouse"] == "DEPOT-A" for row in fragments))

	def test_missing_batch_is_allocated_from_warehouse_stock(self):
		item = frappe._dict(
			{
				"item_code": "Article 1",
				"parent": "DN-1",
				"warehouse": "Magasins - MP",
				"conversion_factor": 1,
				"batch_no": None,
			}
		)
		pool = {("Article 1", "Magasins - MP"): [{"batch_no": "92CCCF3", "qty": 108, "warehouse": "Magasins - MP"}]}
		fake_db = Mock()
		fake_db.get_value.return_value = (0, 1)
		with patch.object(fulfillment.frappe, "db", fake_db):
			fragments = fulfillment._tracking_fragments(item, 7, batch_pools=pool)

		self.assertEqual(
			[(row["batch_no"], row["qty"]) for row in fragments],
			[("92CCCF3", 7)],
		)
		self.assertEqual(pool[("Article 1", "Magasins - MP")][0]["qty"], 101)

	def test_batch_pool_is_consumed_across_delivery_lines(self):
		pool: dict = {}
		available = [{"batch_no": "LOT-A", "qty": 10, "warehouse": "DEPOT-A"}]
		fake_db = Mock()
		fake_db.get_value.return_value = (0, 1)
		with (
			patch.object(fulfillment.frappe, "db", fake_db),
			patch.object(fulfillment, "_available_batch_rows", return_value=available),
		):
			first = fulfillment._tracking_fragments(
				frappe._dict(
					{
						"item_code": "ITEM-BATCH",
						"parent": "DN-1",
						"warehouse": "DEPOT-A",
						"conversion_factor": 1,
						"batch_no": None,
					}
				),
				8,
				batch_pools=pool,
			)
			second = fulfillment._tracking_fragments(
				frappe._dict(
					{
						"item_code": "ITEM-BATCH",
						"parent": "DN-2",
						"warehouse": "DEPOT-A",
						"conversion_factor": 1,
						"batch_no": None,
					}
				),
				2,
				batch_pools=pool,
			)

		self.assertEqual(first[0]["batch_no"], "LOT-A")
		self.assertEqual(first[0]["qty"], 8)
		self.assertEqual(second[0]["qty"], 2)
		self.assertEqual(pool[("ITEM-BATCH", "DEPOT-A")][0]["qty"], 0)

	def test_insufficient_batch_stock_throws(self):
		item = frappe._dict(
			{
				"item_code": "ITEM-BATCH",
				"parent": "DN-1",
				"warehouse": "DEPOT-A",
				"conversion_factor": 1,
				"batch_no": None,
			}
		)
		fake_db = Mock()
		fake_db.get_value.return_value = (0, 1)
		with (
			patch.object(fulfillment.frappe, "db", fake_db),
			patch.object(fulfillment, "_available_batch_rows", return_value=[{"batch_no": "LOT-A", "qty": 1, "warehouse": "DEPOT-A"}]),
			patch.object(fulfillment, "_", side_effect=lambda message: message),
			patch.object(fulfillment.frappe, "throw", side_effect=frappe.ValidationError),
		):
			with self.assertRaises(frappe.ValidationError):
				fulfillment._tracking_fragments(item, 5, batch_pools={})

	def test_explicit_batch_is_kept(self):
		item = frappe._dict(
			{
				"item_code": "ITEM-BATCH",
				"parent": "DN-1",
				"warehouse": "DEPOT-A",
				"conversion_factor": 1,
				"batch_no": "LOT-EXPLICITE",
			}
		)
		fake_db = Mock()
		fake_db.get_value.return_value = (0, 1)
		with (
			patch.object(fulfillment.frappe, "db", fake_db),
			patch.object(fulfillment, "_available_batch_rows") as available,
		):
			fragments = fulfillment._tracking_fragments(item, 3)

		self.assertEqual(fragments[0]["batch_no"], "LOT-EXPLICITE")
		available.assert_not_called()

	def test_bundle_quantity_must_match_delivery_quantity(self):
		item = frappe._dict(
			{
				"item_code": "ITEM-SERIAL",
				"parent": "DN-2",
				"warehouse": "DEPOT-A",
				"conversion_factor": 1,
				"serial_and_batch_bundle": "BUNDLE-2",
			}
		)
		entries = [frappe._dict({"batch_no": None, "serial_no": "SER-1", "qty": -1, "warehouse": "DEPOT-A"})]
		with (
			patch.object(fulfillment.frappe, "get_all", return_value=entries),
			patch.object(fulfillment, "_", side_effect=lambda message: message),
			patch.object(fulfillment.frappe, "throw", side_effect=frappe.ValidationError),
		):
			with self.assertRaises(frappe.ValidationError):
				fulfillment._tracking_fragments(item, 2)

	def test_apply_delivered_quantities_reduces_qty_and_drops_zero_lines(self):
		doc = _ItemsDoc(
			[
				_Row(
					name="dni-1",
					qty=10,
					stock_qty=10,
					conversion_factor=1,
					custom_quantite_livree=6,
					custom_statut_article="En attente",
				),
				_Row(
					name="dni-2",
					qty=4,
					stock_qty=4,
					conversion_factor=1,
					custom_quantite_livree=0,
					custom_statut_article="En attente",
				),
			]
		)
		fulfillment._apply_delivered_quantities_for_submit(doc)
		self.assertEqual(len(doc.items), 1)
		self.assertEqual(doc.items[0].name, "dni-1")
		self.assertEqual(doc.items[0].qty, 6)
		self.assertEqual(doc.items[0].stock_qty, 6)
		self.assertEqual(doc.items[0].custom_quantite_livree, 6)
		self.assertEqual(doc.items[0].custom_statut_article, "Livré")
		self.assertTrue(doc.totals_calculated)

	def test_finalize_partial_does_not_insert_second_delivery_note(self):
		item = _Row(name="dni-1", qty=10, custom_quantite_livree=4)
		doc = Mock()
		doc.name = "DN-1"
		doc.items = [item]
		doc.meta.has_field.return_value = True
		doc.get.side_effect = lambda field, default=None: getattr(doc, field, default)
		doc.custom_date_livraison = None
		doc.custom_user_livraison = None
		line = frappe._dict(delivery_note="DN-1", delivery_note_item="dni-1", loaded_qty=10, delivered_qty=0)
		route = frappe._dict(lignes_chargement=[line])

		with (
			patch.object(fulfillment, "_apply_delivered_quantities_for_submit") as apply_qty,
			patch.object(fulfillment, "_submit_distribution_doc") as submit,
			patch.object(fulfillment, "create_and_submit_invoice", return_value=("INV-1", "created")),
			patch.object(fulfillment, "refresh_route_stock_totals"),
			patch.object(fulfillment, "today", return_value="2026-08-25"),
			patch.object(fulfillment, "nowtime", return_value="12:00:00"),
			patch.object(fulfillment, "now_datetime", return_value="2026-08-25 12:00:00"),
			patch.object(fulfillment.frappe, "session", SimpleNamespace(user="livreur@example.com")),
			patch.object(fulfillment.frappe, "copy_doc") as copy_doc,
		):
			result = fulfillment.finalize_delivery_document(route, doc, "partial")

		apply_qty.assert_called_once_with(doc)
		submit.assert_called_once_with(doc)
		copy_doc.assert_not_called()
		self.assertIsNone(result["residualDeliveryNote"])
		self.assertEqual(doc.custom_statut, "Partiellement Livré")
		self.assertEqual(doc.custom_date_livraison, "2026-08-25 12:00:00")
		self.assertEqual(doc.custom_user_livraison, "livreur@example.com")
		self.assertEqual(line.delivered_qty, 4)
		self.assertFalse(hasattr(fulfillment, "_create_residual_delivery_note"))

	def test_finalize_failed_keeps_draft_without_submit(self):
		doc = Mock()
		doc.name = "DN-FAIL"
		doc.items = [_Row(name="dni-1", qty=10, custom_quantite_livree=0)]
		doc.meta.has_field.return_value = True
		doc.get.side_effect = lambda field, default=None: getattr(doc, field, default)
		doc.custom_date_livraison = None
		doc.custom_user_livraison = None
		route = frappe._dict(lignes_chargement=[])

		with (
			patch.object(fulfillment, "_save_distribution_doc") as save,
			patch.object(fulfillment, "_submit_distribution_doc") as submit,
			patch.object(fulfillment, "_apply_delivered_quantities_for_submit") as apply_qty,
			patch.object(fulfillment, "now_datetime", return_value="2026-08-25 12:05:00"),
			patch.object(fulfillment.frappe, "session", SimpleNamespace(user="livreur@example.com")),
		):
			result = fulfillment.finalize_delivery_document(route, doc, "failed")

		save.assert_called_once_with(doc)
		submit.assert_not_called()
		apply_qty.assert_not_called()
		self.assertEqual(doc.custom_statut, "Non Livré")
		self.assertEqual(doc.custom_date_livraison, "2026-08-25 12:05:00")
		self.assertEqual(result["invoiceStatus"], "not_applicable")

	def test_sales_order_item_names_include_pick_list_rows_dropped_from_dn(self):
		dn = Mock()
		dn.name = "DN-1"
		dn.items = [_Row(so_detail="soi-delivered", against_pick_list="PL-1")]
		route = frappe._dict(
			lignes_chargement=[
				frappe._dict(delivery_note="DN-1", item_code="A"),
				frappe._dict(delivery_note="DN-1", item_code="B"),
			]
		)
		with patch.object(
			fulfillment.frappe,
			"get_all",
			return_value=[
				frappe._dict(sales_order_item="soi-delivered"),
				frappe._dict(sales_order_item="soi-undelivered"),
			],
		):
			names = fulfillment._sales_order_item_names_for_delivery(dn, route)
		self.assertEqual(names, ["soi-delivered", "soi-undelivered"])

	def test_realign_sets_picked_qty_to_delivered_stock_qty(self):
		dn = Mock()
		dn.name = "DN-1"
		dn.items = [_Row(so_detail="soi-1")]
		route = frappe._dict(lignes_chargement=[])
		so_item = Mock()
		so_item.name = "soi-1"
		so_item.delivered_qty = 6
		so_item.conversion_factor = 2
		so_item.picked_qty = 20
		so = Mock()
		so.items = [so_item]

		def get_all(doctype, filters=None, fields=None, **_kwargs):
			if doctype == "Sales Order Item":
				return [frappe._dict(name="soi-1", parent="SO-1")]
			return []

		with (
			patch.object(fulfillment.frappe, "get_all", side_effect=get_all),
			patch.object(fulfillment.frappe, "get_doc", return_value=so),
		):
			fulfillment._realign_sales_order_picked_qty(dn, route)

		self.assertEqual(so_item.picked_qty, 12)
		so_item.db_set.assert_called_once_with("picked_qty", 12, update_modified=False)
		so.update_picking_status.assert_called_once()

	def test_settle_cancels_failed_draft_and_realigns_picks(self):
		dn = Mock()
		dn.name = "DN-FAIL"
		dn.docstatus = 0
		dn.get.side_effect = lambda key, default=None: "Non Livré" if key == "custom_statut" else default
		route = frappe._dict(
			lignes_chargement=[frappe._dict(delivery_note="DN-FAIL")],
			bons_de_livraison=[],
		)
		fake_db = Mock()
		fake_db.exists.return_value = True
		with (
			patch.object(fulfillment.frappe, "db", fake_db),
			patch.object(fulfillment.frappe, "get_doc", return_value=dn),
			patch.object(fulfillment, "_realign_sales_order_picked_qty") as realign,
			patch.object(fulfillment, "_cancel_failed_draft_delivery_note") as cancel,
		):
			fulfillment._settle_delivery_notes_after_return(route)
		realign.assert_called_once_with(dn, route)
		cancel.assert_called_once_with(dn)

	def test_settle_keeps_submitted_partial_and_realigns_picks(self):
		dn = Mock()
		dn.name = "DN-PARTIAL"
		dn.docstatus = 1
		dn.get.side_effect = lambda key, default=None: "Partiellement Livré" if key == "custom_statut" else default
		route = frappe._dict(
			lignes_chargement=[frappe._dict(delivery_note="DN-PARTIAL")],
			bons_de_livraison=[],
		)
		fake_db = Mock()
		fake_db.exists.return_value = True
		with (
			patch.object(fulfillment.frappe, "db", fake_db),
			patch.object(fulfillment.frappe, "get_doc", return_value=dn),
			patch.object(fulfillment, "_realign_sales_order_picked_qty") as realign,
			patch.object(fulfillment, "_cancel_failed_draft_delivery_note") as cancel,
		):
			fulfillment._settle_delivery_notes_after_return(route)
		realign.assert_called_once_with(dn, route)
		cancel.assert_not_called()

	def test_complete_empty_route_return_skips_when_goods_remain(self):
		route = frappe._dict(
			statut_chargement="Retour requis",
			lignes_chargement=[frappe._dict(loaded_qty=3, delivered_qty=1, returned_qty=0)],
		)
		self.assertFalse(fulfillment.complete_empty_route_return(route, persist=False))
		self.assertEqual(route.statut_chargement, "Retour requis")
		self.assertEqual(route.total_quantite_restante, 2)

	def test_complete_empty_route_return_from_in_progress(self):
		route = frappe._dict(
			name="LIV-EN-COURS",
			statut_chargement="Chargé",
			etat_planification="En cours",
			lignes_chargement=[frappe._dict(loaded_qty=2, delivered_qty=2, returned_qty=0)],
			save=Mock(),
		)
		with (
			patch.object(fulfillment, "_settle_delivery_notes_after_return"),
			patch.object(fulfillment, "now_datetime", return_value="2026-08-28 23:58:00"),
			patch.object(fulfillment.frappe, "get_all", return_value=[]),
			patch.object(fulfillment.frappe, "session", SimpleNamespace(user="driver@example.com")),
		):
			self.assertTrue(fulfillment.complete_empty_route_return(route, persist=False))
		self.assertEqual(route.statut_chargement, "Retourné")
		self.assertEqual(route.etat_planification, "Contrôle caisse")
		self.assertEqual(route.statut_caisse, "Sans encaissement")
		route.save.assert_not_called()

	def test_declare_route_return_persist_false_does_not_save(self):
		route = frappe._dict(
			name="LIV-1",
			statut_chargement="Chargé",
			etat_planification="En cours",
			lignes_chargement=[frappe._dict(loaded_qty=3, delivered_qty=1, returned_qty=0)],
			save=Mock(),
		)
		with (
			patch.object(fulfillment, "now_datetime", return_value="2026-09-05 21:00:00"),
			patch.object(fulfillment.frappe, "session", SimpleNamespace(user="driver@example.com")),
		):
			summary = fulfillment.declare_route_return(route, persist=False)
		self.assertEqual(route.statut_chargement, "Retour déclaré")
		self.assertEqual(route.etat_planification, "Retour dépôt")
		self.assertEqual(route.date_declaration_retour, "2026-09-05 21:00:00")
		self.assertEqual(route.retour_declare_par, "driver@example.com")
		self.assertEqual(summary["status"], "Retour déclaré")
		self.assertEqual(summary["remainingQuantity"], 2)
		route.save.assert_not_called()

	def test_complete_empty_route_return_closes_when_nothing_left(self):
		route = frappe._dict(
			name="LIV-1",
			statut_chargement="Retour requis",
			etat_planification="Retour dépôt",
			lignes_chargement=[frappe._dict(loaded_qty=2, delivered_qty=2, returned_qty=0)],
			save=Mock(),
		)
		with (
			patch.object(fulfillment, "_settle_delivery_notes_after_return") as settle,
			patch.object(fulfillment, "now_datetime", return_value="2026-08-26 12:00:00"),
			patch.object(fulfillment.frappe, "get_all", return_value=[]),
			patch.object(fulfillment.frappe, "session", SimpleNamespace(user="prep@example.com")),
		):
			self.assertTrue(fulfillment.complete_empty_route_return(route))
		settle.assert_called_once_with(route)
		self.assertEqual(route.statut_chargement, "Retourné")
		self.assertEqual(route.etat_planification, "Contrôle caisse")
		self.assertEqual(route.statut_caisse, "Sans encaissement")
		route.save.assert_called_once_with(ignore_permissions=True)

	def test_complete_empty_route_return_keeps_validated_cash(self):
		route = frappe._dict(
			name="LIV-CASH",
			statut_chargement="Retour requis",
			etat_planification="Retour dépôt",
			statut_caisse="Validée",
			lignes_chargement=[frappe._dict(loaded_qty=1, delivered_qty=1, returned_qty=0)],
			save=Mock(),
		)
		with (
			patch.object(fulfillment, "_settle_delivery_notes_after_return"),
			patch.object(fulfillment, "now_datetime", return_value="2026-08-26 12:00:00"),
			patch.object(fulfillment.frappe, "get_all") as get_all,
			patch.object(fulfillment.frappe, "session", SimpleNamespace(user="prep@example.com")),
		):
			self.assertTrue(fulfillment.complete_empty_route_return(route))
		get_all.assert_not_called()
		self.assertEqual(route.statut_caisse, "Validée")

	def test_create_and_submit_invoice_bypasses_sales_invoice_create_permission(self):
		seen = {}
		invoice = Mock()
		invoice.name = "SINV-NEW"
		invoice.flags = frappe._dict()

		def fake_make(delivery_note):
			seen["allowed"] = frappe.has_permission("Sales Invoice", "create")
			return invoice

		with (
			patch.object(fulfillment.frappe.db, "get_value", return_value=None),
			patch.object(fulfillment.frappe.db, "set_value"),
			patch.object(fulfillment.frappe.db, "savepoint"),
			patch.object(fulfillment, "today", return_value="2026-08-28"),
			patch.object(fulfillment, "nowtime", return_value="12:00:00"),
			patch.object(fulfillment, "resolve_billing_exceptions"),
			patch(
				"erpnext.stock.doctype.delivery_note.delivery_note.make_sales_invoice",
				fake_make,
			),
			patch.object(fulfillment.frappe, "has_permission", return_value=False),
		):
			name, status = fulfillment.create_and_submit_invoice(frappe._dict(name="LIV-1"), "DN-1")

		self.assertTrue(seen["allowed"])
		self.assertEqual(name, "SINV-NEW")
		self.assertEqual(status, "created")
		invoice.insert.assert_called_once_with(ignore_permissions=True)
		invoice.submit.assert_called_once()

	def test_create_and_submit_invoice_closes_open_billing_exception(self):
		with (
			patch.object(fulfillment.frappe.db, "get_value", return_value="SINV-1"),
			patch.object(fulfillment.frappe.db, "set_value"),
			patch.object(fulfillment, "resolve_billing_exceptions") as resolve,
		):
			name, status = fulfillment.create_and_submit_invoice(frappe._dict(name="LIV-1"), "DN-1")
		self.assertEqual((name, status), ("SINV-1", "created"))
		resolve.assert_called_once_with("DN-1", "SINV-1")

	def test_resolve_billing_exceptions_marks_open_rows_resolved(self):
		def fake_get_all(doctype, *args, **kwargs):
			if doctype == "Exception Distribution":
				return ["EXC-1"]
			return []

		with (
			patch.object(fulfillment.frappe, "get_all", side_effect=fake_get_all),
			patch.object(fulfillment.frappe.db, "set_value") as set_value,
			patch.object(fulfillment, "now_datetime", return_value="2026-09-06 23:50:00"),
			patch.object(fulfillment.frappe, "session", SimpleNamespace(user="caissier@example.com")),
		):
			fulfillment.resolve_billing_exceptions("DN-1", "SINV-1")
		set_value.assert_called_once_with(
			"Exception Distribution",
			"EXC-1",
			{
				"statut": "Résolue",
				"resolution": "Facture créée : SINV-1",
				"resolue_par": "caissier@example.com",
				"date_resolution": "2026-09-06 23:50:00",
			},
		)


class TestReturnControlMetrics(unittest.TestCase):
	def test_counts_declared_returns_and_average_delay(self):
		fake_db = Mock()
		fake_db.has_column.return_value = True
		fake_db.table_exists.return_value = True
		fake_db.count.return_value = 2
		rows = [
			frappe._dict(
				{
					"date_declaration_retour": "2026-09-05 10:00:00",
					"date_confirmation_retour": "2026-09-05 10:40:00",
				}
			),
			frappe._dict(
				{
					"date_declaration_retour": "2026-09-04 09:00:00",
					"date_confirmation_retour": None,
				}
			),
		]
		with (
			patch.object(fulfillment, "now_datetime", return_value="2026-09-05 12:00:00"),
			patch.object(fulfillment.frappe, "get_all", return_value=rows),
			patch.object(fulfillment.frappe, "db", fake_db),
		):
			stats = fulfillment.return_control_metrics(30)
		self.assertEqual(stats["declared"], 2)
		self.assertEqual(stats["discrepancies"], 2)
		self.assertEqual(stats["averageControlDelay"], 40)
		self.assertEqual(stats["days"], 30)
		fake_db.count.assert_called_once()

	def test_hides_delay_when_schema_or_confirmations_are_missing(self):
		fake_db = Mock()
		fake_db.has_column.return_value = False
		fake_db.table_exists.return_value = False
		with (
			patch.object(fulfillment, "now_datetime", return_value="2026-09-05 12:00:00"),
			patch.object(fulfillment.frappe, "get_all", return_value=[]),
			patch.object(fulfillment.frappe, "db", fake_db),
		):
			stats = fulfillment.return_control_metrics(30)
		self.assertEqual(stats["declared"], 0)
		self.assertEqual(stats["discrepancies"], 0)
		self.assertIsNone(stats["averageControlDelay"])


class TestListReturnHistory(unittest.TestCase):
	def test_includes_confirmed_returns_and_skips_empty_routes(self):
		routes = [
			frappe._dict(
				{
					"name": "LIV-DONE",
					"date_liv": "2026-09-04",
					"livreur": "DRV-1",
					"nom_livreur": "Karim",
					"vehicule": "VH-1",
					"statut_chargement": "Retourné",
					"revision": 1,
					"date_declaration_retour": "2026-09-04 18:00:00",
					"date_confirmation_retour": "2026-09-04 18:20:00",
					"stock_entry_retour": "STE-1",
					"total_quantite_chargee": 10,
					"total_quantite_livree": 6,
					"total_quantite_restante": 0,
					"total_quantite_retournee": 4,
				}
			),
			frappe._dict(
				{
					"name": "LIV-PENDING",
					"date_liv": "2026-09-05",
					"livreur": "DRV-2",
					"nom_livreur": "Samir",
					"vehicule": "VH-2",
					"statut_chargement": "Retour déclaré",
					"revision": 2,
					"date_declaration_retour": "2026-09-05 17:00:00",
					"date_confirmation_retour": None,
					"stock_entry_retour": None,
					"total_quantite_chargee": 3,
					"total_quantite_livree": 1,
					"total_quantite_restante": 2,
					"total_quantite_retournee": 0,
				}
			),
		]
		lines = [
			frappe._dict(
				{
					"name": "LINE-DONE",
					"parent": "LIV-DONE",
					"delivery_note": "DN-1",
					"delivery_note_item": "dni-1",
					"residual_delivery_note": None,
					"item_code": "ART-1",
					"item_name": "Article 1",
					"batch_no": "LOT-1",
					"source_warehouse": "WH-A",
					"vehicle_warehouse": "WH-V",
					"return_warehouse": "WH-R",
					"loaded_qty": 10,
					"delivered_qty": 6,
					"returned_qty": 4,
					"uom": "Unité",
				}
			),
			frappe._dict(
				{
					"name": "LINE-PEND",
					"parent": "LIV-PENDING",
					"delivery_note": "DN-2",
					"delivery_note_item": "dni-2",
					"residual_delivery_note": None,
					"item_code": "ART-2",
					"item_name": "Article 2",
					"batch_no": None,
					"source_warehouse": "WH-A",
					"vehicle_warehouse": "WH-V",
					"return_warehouse": None,
					"loaded_qty": 3,
					"delivered_qty": 1,
					"returned_qty": 0,
					"uom": "Unité",
				}
			),
		]
		notes = [
			frappe._dict({"name": "DN-1", "customer": "C-1", "customer_name": "Client Un"}),
			frappe._dict({"name": "DN-2", "customer": "C-2", "customer_name": "Client Deux"}),
		]
		vehicles = [
			frappe._dict({"name": "VH-1", "nom": "Camion A", "immatriculation": "AA-1"}),
			frappe._dict({"name": "VH-2", "nom": "Camion B", "immatriculation": "BB-2"}),
		]
		calls = []

		def fake_get_all(doctype, **kwargs):
			calls.append((doctype, kwargs))
			if doctype == "Livraison":
				return routes
			if doctype == "Ligne Chargement Tournee":
				return lines
			if doctype == "Delivery Note":
				return notes
			if doctype == "Vehicule":
				return vehicles
			return []

		with patch.object(fulfillment.frappe, "get_all", side_effect=fake_get_all):
			rows = fulfillment.list_return_history("2026-08-06", "2026-09-05")

		livraison_filters = next(kwargs for doctype, kwargs in calls if doctype == "Livraison")
		self.assertIn("Retourné", livraison_filters["filters"]["statut_chargement"][1])
		self.assertEqual(livraison_filters["or_filters"]["total_quantite_restante"], [">", 0])
		self.assertEqual(livraison_filters["or_filters"]["total_quantite_retournee"], [">", 0])
		self.assertEqual([row["name"] for row in rows], ["LIV-PENDING", "LIV-DONE"])
		self.assertEqual(rows[0]["customers"][0]["customerName"], "Client Deux")
		self.assertEqual(rows[0]["remainingQuantity"], 2)
		self.assertEqual(rows[1]["returnedQuantity"], 4)
		self.assertEqual(rows[1]["vehicleLabel"], "Camion A · AA-1")
		self.assertEqual(rows[1]["lines"][0]["customerName"], "Client Un")
		self.assertEqual(rows[1]["lines"][0]["returnedQuantity"], 4)

	def test_returns_empty_list_when_no_routes_match(self):
		with patch.object(fulfillment.frappe, "get_all", return_value=[]):
			self.assertEqual(fulfillment.list_return_history("2026-08-06", "2026-09-05"), [])


if __name__ == "__main__":
	unittest.main()

