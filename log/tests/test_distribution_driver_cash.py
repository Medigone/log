import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import frappe

from log.services import distribution_driver_cash as driver_cash
from log.services.distribution_vehicle_stock import build_vehicle_stocks


class TestDriverCash(unittest.TestCase):
	def test_signed_amount_keeps_return_cash_and_allows_negative_adjustment(self):
		self.assertEqual(driver_cash.signed_amount("Retour tournée", 1500), 1500)
		self.assertEqual(driver_cash.signed_amount("Encaissement", 33700), 33700)
		self.assertEqual(driver_cash.signed_amount("Remise", 800), -800)
		self.assertEqual(driver_cash.signed_amount("Remise", -800), -800)
		self.assertEqual(driver_cash.signed_amount("Avance", 200), 200)
		self.assertEqual(driver_cash.signed_amount("Ajustement", -75), -75)

	def test_route_return_is_skipped_until_cash_is_validated(self):
		self.assertFalse(driver_cash.should_post_route_return(frappe._dict({"statut_caisse": "Écart", "livreur": "DRV-1"}), 1200))
		self.assertFalse(driver_cash.should_post_route_return(frappe._dict({"statut_caisse": "Validée"}), 1200))
		self.assertTrue(driver_cash.should_post_route_return(frappe._dict({"statut_caisse": "Validée", "livreur": "DRV-1"}), 0))
		self.assertTrue(driver_cash.should_post_route_return(frappe._dict({"statut_caisse": "Validée", "livreur": "DRV-1"}), 1200))

	def test_post_route_return_skips_legacy_without_encaissement(self):
		route = frappe._dict({"name": "LIV-2", "statut_caisse": "Validée", "livreur": "DRV-1"})
		with (
			patch.object(driver_cash, "sync_route_declared_cash"),
			patch.object(driver_cash, "_encaissement_total", return_value=0),
			patch.object(driver_cash, "_has_encaissement", return_value=False),
			patch.object(driver_cash, "post_movement") as post,
		):
			self.assertIsNone(driver_cash.post_route_return_cash(route, 1500))
		post.assert_not_called()

	def test_post_route_return_posts_remise_when_counted_matches_declared(self):
		route = frappe._dict({"name": "LIV-3", "statut_caisse": "Validée", "livreur": "DRV-1"})
		with (
			patch.object(driver_cash, "sync_route_declared_cash"),
			patch.object(driver_cash, "_encaissement_total", return_value=33700),
			patch.object(driver_cash, "_has_encaissement", return_value=True),
			patch.object(driver_cash, "_has_route_handover", return_value=False),
			patch.object(driver_cash, "handover_reason", return_value="Remise caisse tournée LIV-3"),
			patch.object(driver_cash, "post_movement", return_value={"balance": 0}) as post,
		):
			result = driver_cash.post_route_return_cash(route, 33700)
		self.assertEqual(result["balance"], 0)
		post.assert_called_once()
		self.assertEqual(post.call_args.kwargs["movement_type"], "Remise")
		self.assertEqual(post.call_args.kwargs["amount"], 33700)
		self.assertEqual(post.call_args.kwargs["tournee"], "LIV-3")
		self.assertEqual(post.call_args.kwargs["motif"], "Remise caisse tournée LIV-3")

	def test_post_route_return_skips_remise_when_already_handed_over(self):
		route = frappe._dict({"name": "LIV-1", "statut_caisse": "Validée", "livreur": "DRV-1"})
		with (
			patch.object(driver_cash, "sync_route_declared_cash"),
			patch.object(driver_cash, "_encaissement_total", return_value=33700),
			patch.object(driver_cash, "_has_encaissement", return_value=True),
			patch.object(driver_cash, "_has_route_handover", return_value=True),
			patch.object(driver_cash, "post_movement") as post,
		):
			self.assertIsNone(driver_cash.post_route_return_cash(route, 33700))
		post.assert_not_called()

	def test_post_route_return_posts_count_difference_then_remise(self):
		route = frappe._dict({"name": "LIV-4", "statut_caisse": "Validée", "livreur": "DRV-1"})
		with (
			patch.object(driver_cash, "sync_route_declared_cash"),
			patch.object(driver_cash, "_encaissement_total", return_value=33700),
			patch.object(driver_cash, "_has_encaissement", return_value=True),
			patch.object(driver_cash, "_has_count_adjustment", return_value=False),
			patch.object(driver_cash, "_has_route_handover", return_value=False),
			patch.object(driver_cash, "count_difference_reason", return_value="Écart de comptage au retour LIV-4"),
			patch.object(driver_cash, "handover_reason", return_value="Remise caisse tournée LIV-4"),
			patch.object(driver_cash, "post_movement", side_effect=[{"balance": 34000}, {"balance": 0}]) as post,
		):
			result = driver_cash.post_route_return_cash(route, 34000)
		self.assertEqual(result["balance"], 0)
		self.assertEqual(post.call_count, 2)
		self.assertEqual(post.call_args_list[0].kwargs["movement_type"], "Ajustement")
		self.assertEqual(post.call_args_list[0].kwargs["amount"], 300)
		self.assertEqual(post.call_args_list[1].kwargs["movement_type"], "Remise")
		self.assertEqual(post.call_args_list[1].kwargs["amount"], 34000)

	def test_post_route_return_adjusts_zero_counted_without_remise(self):
		route = frappe._dict({"name": "LIV-0", "statut_caisse": "Validée", "livreur": "DRV-1"})
		with (
			patch.object(driver_cash, "sync_route_declared_cash"),
			patch.object(driver_cash, "_encaissement_total", return_value=33700),
			patch.object(driver_cash, "_has_encaissement", return_value=True),
			patch.object(driver_cash, "_has_count_adjustment", return_value=False),
			patch.object(driver_cash, "_has_route_handover", return_value=False),
			patch.object(driver_cash, "count_difference_reason", return_value="Écart de comptage au retour LIV-0"),
			patch.object(driver_cash, "post_movement", return_value={"balance": 0}) as post,
		):
			result = driver_cash.post_route_return_cash(route, 0)
		self.assertEqual(result["balance"], 0)
		post.assert_called_once()
		self.assertEqual(post.call_args.kwargs["movement_type"], "Ajustement")
		self.assertEqual(post.call_args.kwargs["amount"], -33700)

	def test_post_declared_cash_is_idempotent_and_skips_cheques(self):
		route = frappe._dict({"name": "LIV-5", "livreur": "DRV-1", "statut_caisse": "Sans encaissement"})
		cheque = frappe._dict({"name": "PAY-CHQ", "moyen_paiement": "Chèque", "montant": 1000, "statut_controle": "Déclaré"})
		self.assertIsNone(driver_cash.post_declared_cash(cheque, route))

		payment = frappe._dict({"name": "PAY-1", "moyen_paiement": "Espèce", "montant": 33700, "statut_controle": "Déclaré", "livraison": "LIV-5"})
		with patch.object(driver_cash.frappe.db, "exists", return_value="MVT-ENC"):
			self.assertIsNone(driver_cash.post_declared_cash(payment, route))

		with (
			patch.object(driver_cash.frappe.db, "exists", return_value=None),
			patch.object(driver_cash, "post_movement", return_value={"balance": 33700}) as post,
		):
			result = driver_cash.post_declared_cash(payment, route)
		self.assertEqual(result["balance"], 33700)
		post.assert_called_once()
		self.assertEqual(post.call_args.kwargs["movement_type"], "Encaissement")
		self.assertEqual(post.call_args.kwargs["amount"], 33700)
		self.assertEqual(post.call_args.kwargs["paiement"], "PAY-1")

	def test_mark_route_pending_cash_control_only_from_empty_status(self):
		pending = frappe._dict({"name": "LIV-6", "statut_caisse": "Sans encaissement"})
		validated = frappe._dict({"name": "LIV-7", "statut_caisse": "Validée"})
		with patch.object(driver_cash.frappe.db, "set_value") as set_value:
			driver_cash.mark_route_pending_cash_control(pending)
			driver_cash.mark_route_pending_cash_control(validated)
		set_value.assert_called_once_with("Livraison", "LIV-6", "statut_caisse", "À contrôler", update_modified=False)
		self.assertEqual(pending.statut_caisse, "À contrôler")
		self.assertEqual(validated.statut_caisse, "Validée")

	def test_negative_balance_is_allowed_after_remise(self):
		cash_box = SimpleNamespace(
			name="CAISSE-DRV-1",
			livreur="DRV-1",
			nom_livreur="Livreur Test",
			solde=200,
			date_derniere_maj=None,
			save=Mock(),
		)
		created = []

		def fake_get_doc(*args, **kwargs):
			payload = args[0] if args else kwargs
			if payload == "Caisse Livreur" or (len(args) > 1 and args[0] == "Caisse Livreur"):
				return cash_box
			if isinstance(payload, dict) and payload.get("doctype") == "Mouvement Caisse Livreur":
				doc = SimpleNamespace(
					name="MVT-2",
					type_mouvement=payload["type_mouvement"],
					montant=payload["montant"],
					solde_apres=payload["solde_apres"],
					tournee=payload.get("tournee"),
					motif=payload.get("motif"),
					date=payload.get("date"),
					insert=Mock(),
				)
				created.append(doc)
				return doc
			return cash_box

		with (
			patch.object(driver_cash, "ensure_cash_box", return_value="CAISSE-DRV-1"),
			patch.object(driver_cash.frappe.db, "sql", return_value=None),
			patch.object(driver_cash.frappe, "get_doc", side_effect=fake_get_doc),
			patch.object(driver_cash.frappe.db, "get_value", return_value="Livreur Test"),
			patch.object(driver_cash, "now_datetime", return_value="2026-08-25"),
		):
			result = driver_cash.post_movement(livreur="DRV-1", movement_type="Remise", amount=500, motif="Remise caisse")

		self.assertEqual(cash_box.solde, -300)
		self.assertEqual(result["balance"], -300)
		self.assertEqual(created[0].montant, -500)

	def test_list_cash_boxes_does_not_sync_every_driver(self):
		drivers = [
			frappe._dict({"name": "DRV-1", "nom": "Karim", "active": 1}),
			frappe._dict({"name": "DRV-2", "nom": "Nadir", "active": 1}),
		]
		existing = [
			frappe._dict({"name": "CAISSE-DRV-1", "livreur": "DRV-1", "nom_livreur": "Karim", "solde": 1500, "date_derniere_maj": "2026-08-25"}),
			frappe._dict({"name": "CAISSE-DRV-2", "livreur": "DRV-2", "nom_livreur": "Nadir", "solde": -80, "date_derniere_maj": "2026-08-25"}),
		]

		def fake_get_all(doctype, **kwargs):
			if doctype == "Livreur":
				return drivers
			if doctype == "Caisse Livreur":
				return existing
			return []

		with (
			patch.object(driver_cash.frappe, "get_all", side_effect=fake_get_all),
			patch.object(driver_cash, "sync_driver_declared_cash") as sync,
			patch.object(driver_cash, "ensure_cash_box") as ensure,
		):
			payload = driver_cash.list_cash_boxes()

		sync.assert_not_called()
		ensure.assert_not_called()
		self.assertEqual([row["driverName"] for row in payload], ["Karim", "Nadir"])
		self.assertEqual(payload[0]["balance"], 1500)
		self.assertEqual(payload[1]["balance"], -80)
		self.assertTrue(payload[0]["active"])

	def test_list_cash_boxes_creates_missing_box_without_syncing_routes(self):
		drivers = [frappe._dict({"name": "DRV-3", "nom": "Samir", "active": 0})]
		created = frappe._dict({
			"name": "CAISSE-DRV-3",
			"livreur": "DRV-3",
			"nom_livreur": "Samir",
			"solde": 0,
			"date_derniere_maj": None,
		})

		def fake_get_all(doctype, **kwargs):
			if doctype == "Livreur":
				return drivers
			return []

		with (
			patch.object(driver_cash.frappe, "get_all", side_effect=fake_get_all),
			patch.object(driver_cash, "sync_driver_declared_cash") as sync,
			patch.object(driver_cash, "ensure_cash_box", return_value="CAISSE-DRV-3") as ensure,
			patch.object(driver_cash.frappe.db, "get_value", return_value=created),
		):
			payload = driver_cash.list_cash_boxes()

		sync.assert_not_called()
		ensure.assert_called_once_with("DRV-3")
		self.assertEqual(payload[0]["driverName"], "Samir")
		self.assertEqual(payload[0]["balance"], 0)
		self.assertFalse(payload[0]["active"])

	def test_adjustment_requires_reason_and_rejects_unknown_type(self):
		with (
			patch.object(driver_cash, "_", side_effect=lambda message, *args: message),
			patch.object(driver_cash.frappe, "throw", side_effect=frappe.ValidationError),
		):
			with self.assertRaises(frappe.ValidationError):
				driver_cash.post_adjustment("DRV-1", "Remise", 10, "")
			with self.assertRaises(frappe.ValidationError):
				driver_cash.post_adjustment("DRV-1", "Retour tournée", 10, "motif")


class TestVehicleStock(unittest.TestCase):
	def test_snapshot_groups_bins_and_keeps_missing_warehouse(self):
		vehicles = [
			{"name": "VEH-1", "nom": "Camion A", "immatriculation": "12345", "status": "Disponible", "active": 1, "warehouse": "12345 - VEH"},
			{"name": "VEH-2", "nom": "Camion B", "immatriculation": "67890", "status": "Disponible", "active": 1, "warehouse": None},
		]
		bins = [
			{"item_code": "ART-1", "warehouse": "12345 - VEH", "actual_qty": 4, "stock_uom": "Nos"},
			{"item_code": "ART-2", "warehouse": "12345 - VEH", "actual_qty": 1, "stock_uom": "Nos"},
		]
		routes = [{"name": "LIV-9", "vehicule": "VEH-1", "livreur": "DRV-1", "nom_livreur": "Karim", "etat_planification": "En cours"}]
		payload = build_vehicle_stocks(vehicles, bins, {"ART-1": "Huile", "ART-2": "Savon"}, routes)
		self.assertEqual(payload[0]["totalQuantity"], 5)
		self.assertEqual(payload[0]["itemCount"], 2)
		self.assertEqual(payload[0]["activeRoutes"][0]["routeId"], "LIV-9")
		self.assertTrue(payload[1]["missingWarehouse"])
		self.assertEqual(payload[1]["lines"], [])

	def test_snapshot_reads_bin_doctype_table(self):
		from log.services import distribution_vehicle_stock as stock

		vehicles = [
			frappe._dict(
				name="VEH-1",
				nom="Camion A",
				immatriculation="12345",
				status="Disponible",
				active=1,
				warehouse="12345 - VEH",
			)
		]
		bins = [frappe._dict(item_code="ART-1", warehouse="12345 - VEH", actual_qty=6, stock_uom="Nos")]
		items = [frappe._dict(name="ART-1", item_name="Huile")]

		calls = {}

		def get_all(doctype, **kwargs):
			calls[doctype] = kwargs
			return {
				"Vehicule": vehicles,
				"Bin": bins,
				"Item": items,
				"Livraison": [],
			}[doctype]

		with (
			patch.object(stock.frappe, "get_all", side_effect=get_all),
			patch.object(stock.frappe.db, "table_exists", return_value=True) as table_exists,
		):
			payload = stock.vehicle_stock_snapshot()

		table_exists.assert_called_with("Bin")
		self.assertTrue(calls["Bin"]["ignore_permissions"])
		self.assertEqual(payload[0]["totalQuantity"], 6)
		self.assertEqual(payload[0]["itemCount"], 1)
		self.assertEqual(payload[0]["lines"][0]["itemName"], "Huile")


if __name__ == "__main__":
	unittest.main()
