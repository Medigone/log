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
		self.assertEqual(stats["readyToComplete"], 0)
		self.assertEqual(stats["remainingQty"], 20)

	def test_summarize_preparation_exposes_ready_to_complete(self):
		stats = dashboard.summarize_preparation([], [], shortage_count=0, day="2026-08-28", ready_to_complete=3)
		self.assertEqual(stats["readyToComplete"], 3)

	def test_build_now_puts_reliquat_ahead_of_pick_lists(self):
		items = dashboard.build_now(
			role="preparateur",
			preparation={
				"readyToComplete": 2,
				"pickLists": [{"name": "PICK-1", "salesOrderCount": 1, "remainingQty": 3}],
			},
			fulfillment=None,
			fleet=None,
			payments=None,
		)
		self.assertEqual(items[0]["id"], "prep-complete")
		self.assertEqual(items[0]["title"], "Reliquats à prélever")
		self.assertEqual(items[0]["target"], "/preparation?complete=1")
		self.assertEqual(items[0]["tone"], "warning")
		self.assertEqual(items[1]["id"], "pick-PICK-1")

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

	def test_summarize_shipped_trend_fills_fourteen_days(self):
		values = dashboard.summarize_shipped_trend({"2026-08-15": 2, "2026-08-28": 5}, "2026-08-28")
		self.assertEqual(len(values), 14)
		self.assertEqual(values[0], 2)
		self.assertEqual(values[-1], 5)
		self.assertEqual(sum(values), 7)

	def test_suggest_route_groups_ignores_assigned_and_singletons(self):
		suggestions = dashboard.suggest_route_groups(
			[
				{"deliveryNote": "DN-1", "customerCity": "Hydra", "qty": 4},
				{"deliveryNote": "DN-2", "customerCity": "Hydra", "qty": 2},
				{"deliveryNote": "DN-3", "customerCity": "Kouba", "qty": 8},
				{"deliveryNote": "DN-4", "customerCity": "Hydra", "routeId": "LIV-1", "qty": 9},
			]
		)
		self.assertEqual(len(suggestions), 1)
		self.assertEqual(suggestions[0]["id"], "Hydra")
		self.assertEqual(suggestions[0]["noteIds"], ["DN-1", "DN-2"])
		self.assertIn("6", suggestions[0]["detail"])

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

	def test_build_alerts_targets_include_query_params(self):
		alerts = dashboard.build_alerts(
			role="responsable",
			exceptions=[
				SimpleNamespace(
					name="EX-1",
					priorite="Haute",
					type_exception="Échec",
					description="",
					tournee="LIV-1",
					bon_de_livraison="DN-9",
				)
			],
			preparation={"shortageOrders": 1, "overdue": 2, "readyToComplete": 3},
			fulfillment={"returnsPending": 1},
			fleet={"failedStops": 3},
			planning={"overdue": 1},
			stock={"missingWarehouse": 1},
			payments={"discrepancies": 0, "toControl": 1},
		)
		by_id = {alert["id"]: alert["target"] for alert in alerts}
		self.assertEqual(by_id["EX-1"], "/planning/routes/LIV-1?dn=DN-9")
		self.assertEqual(by_id["prep-shortages"], "/preparation?shortage=1")
		self.assertEqual(by_id["prep-complete"], "/preparation?complete=1")
		self.assertEqual(by_id["prep-overdue"], "/preparation?dateScope=overdue")
		self.assertEqual(by_id["fulfillment-returns"], "/stock?focus=route")
		self.assertEqual(by_id["stock-missing"], "/stock?focus=missing")
		self.assertEqual(by_id["planning-overdue"], "/planning?status=En%20retard")
		self.assertEqual(by_id["fleet-failed"], "/deliveries?kpi=failed")
		self.assertEqual(by_id["cash-control"], "/cashier?status=%C3%80%20contr%C3%B4ler")

		orphan = dashboard.build_alerts(
			role="responsable",
			exceptions=[SimpleNamespace(name="EX-2", priorite="Haute", type_exception="Échec", description="", tournee=None, bon_de_livraison="DN-8")],
			preparation=None,
			fulfillment=None,
			fleet=None,
			planning=None,
			stock=None,
			payments={"discrepancies": 1, "toControl": 0},
		)
		self.assertEqual(orphan[0]["target"], "/deliveries?kpi=failed&dn=DN-8")
		self.assertEqual(orphan[1]["target"], "/cashier?status=%C3%89cart")

	def test_preparateur_payload_omits_fleet_planning_and_payments(self):
		with (
			patch.object(dashboard, "_load_pickable_orders", return_value=[_order(delivery_date="2026-08-26")]),
			patch.object(dashboard, "_load_draft_pick_lists", return_value=[_pick()]),
			patch.object(dashboard, "_count_shortage_orders", return_value=1),
			patch.object(dashboard, "_count_ready_to_complete_orders", return_value=0),
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
			patch.object(dashboard, "_load_shipped_counts", return_value={}),
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
		self.assertEqual(payload["shippedTrend"], [0] * 14)
		self.assertEqual(payload["routeSuggestions"], [])
		self.assertTrue(any(alert["id"] == "prep-overdue" for alert in payload["alerts"]))
		self.assertTrue(any(alert["target"] == "/preparation?dateScope=overdue" for alert in payload["alerts"]))
		self.assertFalse(any(alert["id"] == "dispatch-ready" for alert in payload["alerts"]))

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
			patch.object(dashboard, "_count_ready_to_complete_orders", return_value=0),
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
			patch.object(dashboard, "_load_shipped_counts", return_value={"2026-08-28": 3}),
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
		self.assertEqual(payload["shippedTrend"][-1], 3)
		self.assertEqual(payload["routeSuggestions"], [])
		self.assertTrue(any(item["kind"] == "route" for item in payload["now"]))
		self.assertTrue(any(item["kind"] == "dispatch" for item in payload["now"]))

	def test_planificateur_omits_payments(self):
		with (
			patch.object(dashboard, "_load_pickable_orders", return_value=[]),
			patch.object(dashboard, "_load_draft_pick_lists", return_value=[]),
			patch.object(dashboard, "_count_shortage_orders", return_value=0),
			patch.object(dashboard, "_count_ready_to_complete_orders", return_value=0),
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
			patch.object(dashboard, "_load_shipped_counts", return_value={}),
		):
			payload = dashboard.build_activity_dashboard(role="planificateur", date="2026-08-28")

		cashier.assert_not_called()
		self.assertIn("pipeline", payload)
		self.assertNotIn("payments", payload)
		self.assertEqual(payload["pipeline"]["cashier"], 0)
		self.assertEqual(payload["pipeline"]["toDispatch"], 0)
		self.assertEqual(payload["shippedTrend"], [0] * 14)


if __name__ == "__main__":
	unittest.main()
