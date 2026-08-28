import unittest
from types import SimpleNamespace
from unittest.mock import patch

from log.services import distribution_activity_dashboard as dashboard


def _order(**kwargs):
	defaults = {
		"name": "SAL-ORD-1",
		"delivery_date": "2026-08-28",
		"total_qty": 10,
		"per_picked": 0,
		"company": "C1",
		"customer_name": "Client A",
	}
	defaults.update(kwargs)
	return SimpleNamespace(**defaults)


def _pick(**kwargs):
	defaults = {"name": "PICK-1", "modified": "2026-08-28 09:00:00", "sales_order_count": 2, "remaining_qty": 4}
	defaults.update(kwargs)
	return defaults


def _route(**kwargs):
	defaults = {
		"name": "LIV-1",
		"etat_planification": "En cours",
		"statut_chargement": "Chargé",
		"nom_livreur": "Karim",
		"vehicule": "VEH-1",
		"vehicleLabel": "Camion A",
		"livreur": "DRV-1",
	}
	defaults.update(kwargs)
	return defaults


class TestActivityDashboard(unittest.TestCase):
	def test_classify_delivery_date_overdue_today_later(self):
		self.assertEqual(dashboard.classify_delivery_date("2026-08-26", "2026-08-28"), "overdue")
		self.assertEqual(dashboard.classify_delivery_date("2026-08-28", "2026-08-28"), "today")
		self.assertEqual(dashboard.classify_delivery_date("2026-08-30", "2026-08-28"), "later")
		self.assertEqual(dashboard.classify_delivery_date(None, "2026-08-28"), "later")

	def test_remaining_qty_uses_unpicked_share(self):
		self.assertEqual(dashboard.remaining_qty(10, 0), 10)
		self.assertEqual(dashboard.remaining_qty(10, 40), 6)
		self.assertEqual(dashboard.remaining_qty(10, 100), 0)

	def test_summarize_preparation_counts_overdue_and_remaining(self):
		orders = [
			_order(name="SO-1", delivery_date="2026-08-26", total_qty=10, per_picked=0),
			_order(name="SO-2", delivery_date="2026-08-28", total_qty=4, per_picked=50),
			_order(name="SO-3", delivery_date="2026-08-30", total_qty=8, per_picked=0),
		]
		stats = dashboard.summarize_preparation(orders, [_pick()], shortage_count=1, day="2026-08-28")
		self.assertEqual(stats["toPick"], 3)
		self.assertEqual(stats["overdue"], 1)
		self.assertEqual(stats["today"], 1)
		self.assertEqual(stats["later"], 1)
		self.assertEqual(stats["inProgressPickLists"], 1)
		self.assertEqual(stats["shortageOrders"], 1)
		self.assertEqual(stats["remainingQty"], 20)

	def test_summarize_fulfillment_groups_loading_and_returns(self):
		stats = dashboard.summarize_fulfillment(
			[
				_route(name="LIV-LOAD", statut_chargement="À charger", etat_planification="Publiée"),
				_route(name="LIV-GO", statut_chargement="Chargé", etat_planification="En cours"),
				_route(name="LIV-RET", statut_chargement="Retour déclaré", etat_planification="Retour dépôt"),
				_route(name="LIV-X", statut_chargement="À charger", etat_planification="Annulée"),
			]
		)
		self.assertEqual(stats["toLoad"], 1)
		self.assertEqual(stats["loaded"], 1)
		self.assertEqual(stats["returnsPending"], 1)
		self.assertEqual(stats["toLoadRoutes"][0]["name"], "LIV-LOAD")

	def test_summarize_dispatch_counts_ready_backlog_without_date_filter(self):
		stats = dashboard.summarize_dispatch(
			[
				{
					"deliveryNote": "MAT-DN-2026-00003",
					"requestedDate": "2026-08-26",
					"routeId": "LIV-26-08-00002",
					"lifecycle": "Préparé",
				},
				{
					"deliveryNote": "DN-FUTURE",
					"requestedDate": "2026-09-01",
					"routeId": None,
					"lifecycle": "Préparé",
				},
				{
					"deliveryNote": "DN-NODATE",
					"requestedDate": None,
					"routeId": "LIV-OPEN",
					"lifecycle": "Préparé",
				},
			],
			"2026-08-28",
		)
		self.assertEqual(stats["ready"], 3)
		self.assertEqual(stats["waitingLoad"], 2)
		self.assertEqual(stats["unassigned"], 1)
		self.assertEqual(stats["overdue"], 1)
		self.assertEqual(stats["notes"][0]["deliveryNote"], "MAT-DN-2026-00003")

	def test_summarize_payments_splits_control_and_gaps(self):
		stats = dashboard.summarize_payments(
			[
				{"name": "LIV-A", "statut_caisse": "À contrôler"},
				{"name": "LIV-B", "statut_caisse": "Écart"},
				{"name": "LIV-C", "statut_caisse": "Validée"},
			],
			[
				{"montant": 1500, "statut_controle": "Déclaré"},
				{"montant": 500, "statut_controle": "À contrôler"},
			],
			[{"balance": 2000}, {"solde": 500}],
		)
		self.assertEqual(stats["toControl"], 1)
		self.assertEqual(stats["discrepancies"], 1)
		self.assertEqual(stats["pendingPayments"], 2)
		self.assertEqual(stats["declaredToday"], 2000)
		self.assertEqual(stats["driverCashTotal"], 2500)

	def test_preparateur_payload_omits_fleet_planning_and_payments(self):
		with (
			patch.object(dashboard, "_load_pickable_orders", return_value=[_order(delivery_date="2026-08-26")]),
			patch.object(dashboard, "_load_draft_pick_lists", return_value=[_pick()]),
			patch.object(dashboard, "_count_shortage_orders", return_value=1),
			patch.object(dashboard, "_load_open_routes", return_value=[_route(statut_chargement="À charger")]),
			patch.object(dashboard, "_vehicle_label", return_value="Camion A"),
			patch.object(dashboard, "_load_vehicle_stocks", return_value=[
				{"active": True, "activeRoutes": [], "totalQuantity": 0, "missingWarehouse": False},
			]),
			patch.object(dashboard, "_load_open_exceptions") as exceptions,
			patch.object(dashboard, "_load_unassigned_notes") as unassigned,
			patch.object(dashboard, "_load_ready_notes", return_value=[
				{
					"deliveryNote": "MAT-DN-2026-00003",
					"customerName": "Client A",
					"requestedDate": "2026-08-26",
					"lifecycle": "Préparé",
					"routeId": "LIV-26-08-00002",
					"loadingStatus": "À charger",
				},
			]),
			patch.object(dashboard, "_load_pending_cashier_routes") as cashier,
		):
			payload = dashboard.build_activity_dashboard(role="preparateur", date="2026-08-28")

		exceptions.assert_not_called()
		unassigned.assert_not_called()
		cashier.assert_not_called()
		self.assertEqual(payload["role"], "preparateur")
		self.assertEqual(payload["preparation"]["overdue"], 1)
		self.assertEqual(payload["fulfillment"]["toLoad"], 1)
		self.assertIn("stock", payload)
		self.assertNotIn("fleet", payload)
		self.assertNotIn("planning", payload)
		self.assertNotIn("payments", payload)
		self.assertNotIn("pipeline", payload)
		self.assertEqual(payload["dispatch"]["ready"], 1)
		self.assertTrue(any(alert["id"] == "prep-overdue" for alert in payload["alerts"]))
		self.assertTrue(any(alert["id"] == "dispatch-ready" for alert in payload["alerts"]))

	def test_responsable_payload_includes_pipeline_and_payments(self):
		live = [
			{
				"name": "LIV-1",
				"lifecycle": "En cours",
				"vehicleLabel": "Camion A",
				"driverName": "Karim",
				"doneStops": 1,
				"remainingStops": 1,
				"failedStops": 0,
				"stops": [],
				"nextStop": {"deliveryNote": "DN-2", "customerName": "Client B", "status": "Enlevé"},
			}
		]
		with (
			patch.object(dashboard, "_load_pickable_orders", return_value=[_order()]),
			patch.object(dashboard, "_load_draft_pick_lists", return_value=[]),
			patch.object(dashboard, "_count_shortage_orders", return_value=0),
			patch.object(dashboard, "_load_open_routes", return_value=[_route()]),
			patch.object(dashboard, "_vehicle_label", return_value="Camion A"),
			patch.object(dashboard, "_load_route_children", return_value=[]),
			patch.object(dashboard, "_load_delivery_notes", return_value={}),
			patch.object(dashboard, "_customer_gps_map", return_value={}),
			patch.object(dashboard, "build_lite_routes", return_value=live),
			patch.object(dashboard, "_load_unassigned_notes", return_value=[
				{"deliveryNote": "DN-9", "requestedDate": "2026-08-26", "customerName": "Late"},
			]),
			patch.object(dashboard, "_load_ready_notes", return_value=[
				{
					"deliveryNote": "MAT-DN-2026-00003",
					"requestedDate": "2026-08-26",
					"routeId": "LIV-26-08-00002",
					"lifecycle": "Préparé",
				},
			]),
			patch.object(dashboard, "_load_vehicle_stocks", return_value=[
				{"active": True, "activeRoutes": [{"routeId": "LIV-1"}], "totalQuantity": 12, "missingWarehouse": False},
			]),
			patch.object(dashboard, "_load_pending_cashier_routes", return_value=[{"statut_caisse": "À contrôler"}]),
			patch.object(dashboard, "_load_today_payments", return_value=[{"montant": 800, "statut_controle": "Déclaré"}]),
			patch.object(dashboard, "_load_cash_box_balances", return_value=[{"balance": 1200}]),
			patch.object(dashboard, "_load_open_exceptions", return_value=[]),
		):
			payload = dashboard.build_activity_dashboard(role="responsable", date="2026-08-28")

		self.assertEqual(payload["pipeline"]["toPrepare"], 1)
		self.assertEqual(payload["pipeline"]["toPlan"], 1)
		self.assertEqual(payload["pipeline"]["toDispatch"], 1)
		self.assertEqual(payload["pipeline"]["live"], 1)
		self.assertEqual(payload["pipeline"]["cashier"], 1)
		self.assertEqual(payload["planning"]["overdue"], 1)
		self.assertEqual(payload["dispatch"]["ready"], 1)
		self.assertEqual(payload["payments"]["toControl"], 1)
		self.assertEqual(payload["payments"]["declaredToday"], 800)
		self.assertEqual(payload["fleet"]["inProgress"], 1)
		self.assertTrue(any(item["kind"] == "route" for item in payload["now"]))
		self.assertTrue(any(item["kind"] == "dispatch" for item in payload["now"]))

	def test_planificateur_omits_payments(self):
		with (
			patch.object(dashboard, "_load_pickable_orders", return_value=[]),
			patch.object(dashboard, "_load_draft_pick_lists", return_value=[]),
			patch.object(dashboard, "_count_shortage_orders", return_value=0),
			patch.object(dashboard, "_load_open_routes", return_value=[]),
			patch.object(dashboard, "build_lite_routes", return_value=[]),
			patch.object(dashboard, "_load_route_children", return_value=[]),
			patch.object(dashboard, "_load_delivery_notes", return_value={}),
			patch.object(dashboard, "_customer_gps_map", return_value={}),
			patch.object(dashboard, "_load_unassigned_notes", return_value=[]),
			patch.object(dashboard, "_load_ready_notes", return_value=[]),
			patch.object(dashboard, "_load_vehicle_stocks", return_value=[]),
			patch.object(dashboard, "_load_open_exceptions", return_value=[]),
			patch.object(dashboard, "_load_pending_cashier_routes") as cashier,
		):
			payload = dashboard.build_activity_dashboard(role="planificateur", date="2026-08-28")

		cashier.assert_not_called()
		self.assertIn("pipeline", payload)
		self.assertNotIn("payments", payload)
		self.assertEqual(payload["pipeline"]["cashier"], 0)
		self.assertEqual(payload["pipeline"]["toDispatch"], 0)


if __name__ == "__main__":
	unittest.main()
