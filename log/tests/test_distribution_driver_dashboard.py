import unittest
from types import SimpleNamespace
from unittest.mock import patch

from log.services import distribution_driver_dashboard as dashboard


def _route(**kwargs):
	defaults = {
		"name": "LIV-1",
		"date_liv": "2026-08-25",
		"etat_planification": "En cours",
		"depart_prevu": "2026-08-25 08:00:00",
		"fin_prevue": "2026-08-25 16:00:00",
		"vehicule": "VEH-1",
		"nom_livreur": "Karim",
		"statut_caisse": "À contrôler",
		"total_montant_a_encaisser": 2000,
		"total_paiements": 1000,
	}
	defaults.update(kwargs)
	return SimpleNamespace(**defaults)


def _dn(name, status, total, customer="Client Test"):
	return SimpleNamespace(
		name=name,
		customer="CUST-1",
		customer_name=customer,
		grand_total=total,
		custom_statut=status,
		shipping_address="12 rue Test",
		contact_mobile="0550000000",
		custom_commune=None,
		custom_wilaya="Oran",
	)


class TestDriverDashboard(unittest.TestCase):
	def test_summarize_stops_counts_delivered_remaining_and_failed(self):
		stops = [
			{"deliveryNote": "DN-1", "status": "Livré", "grandTotal": 1000},
			{"deliveryNote": "DN-2", "status": "Partiellement Livré", "grandTotal": 500},
			{"deliveryNote": "DN-3", "status": "Non Livré", "grandTotal": 200},
			{"deliveryNote": "DN-4", "status": "Enlevé", "grandTotal": 800},
		]
		stats = dashboard.summarize_stops(stops, {"DN-1": 1000, "DN-2": 200})
		self.assertEqual(stats["plannedStops"], 4)
		self.assertEqual(stats["deliveredStops"], 2)
		self.assertEqual(stats["failedStops"], 1)
		self.assertEqual(stats["completedStops"], 3)
		self.assertEqual(stats["remainingStops"], 1)
		self.assertEqual(stats["amountCollected"], 1200)
		self.assertEqual(stats["amountToCollect"], 1300)

	def test_cash_status_prefers_discrepancy_then_pending(self):
		self.assertEqual(dashboard.cash_status_from_routes(["Validée", "Écart"]), "Écart")
		self.assertEqual(dashboard.cash_status_from_routes(["À contrôler", "Validée"]), "À contrôler")
		self.assertEqual(dashboard.cash_status_from_routes(["Validée"]), "Validée")
		self.assertEqual(dashboard.cash_status_from_routes([]), "Sans encaissement")

	def test_session_cash_treats_declared_payments_as_pending_control(self):
		with patch.object(dashboard, "get_cash_box", return_value={"balance": 0, "updatedAt": None, "movements": []}):
			payload = dashboard._session_cash(
				"DRV-1",
				[{"moyen_paiement": "Espèce", "montant": 33700}],
				["Sans encaissement"],
			)
		self.assertEqual(payload["status"], "À contrôler")
		self.assertEqual(payload["declaredCash"], 33700)
		self.assertEqual(payload["balance"], 0)

	def test_week_days_always_covers_seven_days(self):
		days = dashboard.build_week_days(
			"2026-08-19",
			"2026-08-25",
			{"2026-08-25": {"plannedStops": 4, "deliveredStops": 3, "collected": 1500}},
		)
		self.assertEqual(len(days), 7)
		self.assertEqual(days[0]["date"], "2026-08-19")
		self.assertEqual(days[0]["plannedStops"], 0)
		self.assertEqual(days[-1]["date"], "2026-08-25")
		self.assertEqual(days[-1]["deliveredStops"], 3)
		self.assertEqual(days[-1]["collected"], 1500)

	def test_empty_dashboard_without_driver_does_not_load_cash(self):
		with patch.object(dashboard, "get_cash_box") as cash:
			payload = dashboard.build_driver_dashboard(driver=None, date="2026-08-25")
		cash.assert_not_called()
		self.assertEqual(payload["date"], "2026-08-25")
		self.assertEqual(payload["kpis"]["plannedStops"], 0)
		self.assertEqual(payload["cash"]["balance"], 0)
		self.assertEqual(len(payload["week"]["days"]), 7)

	def test_build_dashboard_is_scoped_to_session_driver(self):
		routes = [
			_route(name="LIV-TODAY", date_liv="2026-08-25", statut_caisse="À contrôler"),
			_route(
				name="LIV-YDAY",
				date_liv="2026-08-24",
				etat_planification="Terminée",
				statut_caisse="Validée",
				depart_prevu="2026-08-24 08:00:00",
				fin_prevue="2026-08-24 12:00:00",
			),
		]
		children = [
			SimpleNamespace(parent="LIV-TODAY", bon_de_livraison="DN-1", idx=1),
			SimpleNamespace(parent="LIV-TODAY", bon_de_livraison="DN-2", idx=2),
			SimpleNamespace(parent="LIV-YDAY", bon_de_livraison="DN-0", idx=1),
		]
		notes = {
			"DN-1": _dn("DN-1", "Livré", 1000, "Client A"),
			"DN-2": _dn("DN-2", "Enlevé", 1500, "Client B"),
			"DN-0": _dn("DN-0", "Livré", 500, "Client C"),
		}
		payments = [
			{"livraison": "LIV-TODAY", "bon_livraison": "DN-1", "montant": 1000, "moyen_paiement": "Espèce"},
			{"livraison": "LIV-YDAY", "bon_livraison": "DN-0", "montant": 500, "moyen_paiement": "Chèque"},
		]
		cash_box = {
			"balance": 45000,
			"updatedAt": "2026-08-25 10:00:00",
			"movements": [{"name": "MVT-1", "type": "Retour tournée", "amount": 500}],
		}

		with (
			patch.object(dashboard, "_driver_profile", return_value={"name": "DRV-1", "label": "Karim", "vehicle": "Camion 1"}),
			patch.object(dashboard, "_load_routes", return_value=routes) as load_routes,
			patch.object(dashboard, "_load_children", return_value=children),
			patch.object(dashboard, "_load_delivery_notes", return_value=notes),
			patch.object(dashboard, "_load_payments", return_value=payments),
			patch.object(dashboard, "_vehicle_label", return_value="Camion 1"),
			patch.object(dashboard, "get_cash_box", return_value=cash_box) as cash,
		):
			payload = dashboard.build_driver_dashboard(driver="DRV-1", date="2026-08-25")

		load_routes.assert_called_once_with("DRV-1", "2026-08-19", "2026-08-25")
		cash.assert_called_once_with("DRV-1")
		self.assertEqual(payload["kpis"]["plannedStops"], 2)
		self.assertEqual(payload["kpis"]["deliveredStops"], 1)
		self.assertEqual(payload["kpis"]["remainingStops"], 1)
		self.assertEqual(payload["kpis"]["amountCollected"], 1000)
		self.assertEqual(payload["kpis"]["amountToCollect"], 1500)
		self.assertEqual(payload["cash"]["balance"], 45000)
		self.assertEqual(payload["cash"]["declaredCash"], 1000)
		self.assertEqual(payload["cash"]["declaredCheques"], 0)
		self.assertEqual(payload["cash"]["status"], "À contrôler")
		self.assertEqual(payload["nextStop"]["deliveryNote"], "DN-2")
		self.assertEqual(payload["nextStop"]["customerName"], "Client B")
		self.assertEqual(payload["week"]["deliveredStops"], 2)
		self.assertEqual(payload["week"]["plannedStops"], 3)
		self.assertEqual(payload["week"]["collected"], 1500)


if __name__ == "__main__":
	unittest.main()
