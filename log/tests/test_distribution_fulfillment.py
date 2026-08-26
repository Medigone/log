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
		line = frappe._dict(delivery_note="DN-1", delivery_note_item="dni-1", loaded_qty=10, delivered_qty=0)
		route = frappe._dict(lignes_chargement=[line])

		with (
			patch.object(fulfillment, "_apply_delivered_quantities_for_submit") as apply_qty,
			patch.object(fulfillment, "_submit_distribution_doc") as submit,
			patch.object(fulfillment, "create_and_submit_invoice", return_value=("INV-1", "created")),
			patch.object(fulfillment, "refresh_route_stock_totals"),
			patch.object(fulfillment, "today", return_value="2026-08-25"),
			patch.object(fulfillment, "nowtime", return_value="12:00:00"),
			patch.object(fulfillment.frappe, "copy_doc") as copy_doc,
		):
			result = fulfillment.finalize_delivery_document(route, doc, "partial")

		apply_qty.assert_called_once_with(doc)
		submit.assert_called_once_with(doc)
		copy_doc.assert_not_called()
		self.assertIsNone(result["residualDeliveryNote"])
		self.assertEqual(doc.custom_statut, "Partiellement Livré")
		self.assertEqual(line.delivered_qty, 4)
		self.assertFalse(hasattr(fulfillment, "_create_residual_delivery_note"))

	def test_finalize_failed_keeps_draft_without_submit(self):
		doc = Mock()
		doc.name = "DN-FAIL"
		doc.items = [_Row(name="dni-1", qty=10, custom_quantite_livree=0)]
		doc.meta.has_field.return_value = True
		route = frappe._dict(lignes_chargement=[])

		with (
			patch.object(fulfillment, "_save_distribution_doc") as save,
			patch.object(fulfillment, "_submit_distribution_doc") as submit,
			patch.object(fulfillment, "_apply_delivered_quantities_for_submit") as apply_qty,
		):
			result = fulfillment.finalize_delivery_document(route, doc, "failed")

		save.assert_called_once_with(doc)
		submit.assert_not_called()
		apply_qty.assert_not_called()
		self.assertEqual(doc.custom_statut, "Non Livré")
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


if __name__ == "__main__":
	unittest.main()
