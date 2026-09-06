import unittest
from datetime import datetime

from log.api.distribution_rules import (
	can_transition_route,
	capacity_error,
	capacity_warning,
	change_reason_required,
	classify_order_change,
	complete_stop_gate_error,
	completion_errors,
	driver_owns_route,
	draft_route_delete_error,
	has_assignment_conflict,
	has_any_role,
	is_repeated_request,
	intervals_overlap,
	load_verification_error,
	next_free_slot,
	planning_status_for_route,
	parse_gps_value,
	public_tracking_payload,
	revision_matches,
	start_without_load_error,
	stop_status,
)

FAILURES = {"Client absent", "Autre"}


class TestDistributionRules(unittest.TestCase):
	def test_role_permissions(self):
		self.assertTrue(has_any_role({"Planificateur"}, {"Planificateur", "Responsable"}))
		self.assertTrue(has_any_role({"Responsable"}, {"Préparateur", "Responsable"}))
		self.assertTrue(has_any_role({"Livreur"}, {"Livreur", "Responsable"}))
		self.assertTrue(has_any_role({"Préparateur"}, {"Préparateur", "Responsable"}))
		self.assertTrue(has_any_role({"Caissier"}, {"Caissier", "Responsable"}))
		self.assertFalse(has_any_role({"Livreur"}, {"Planificateur", "Responsable"}))

	def test_route_transitions(self):
		self.assertTrue(can_transition_route("Brouillon", "Publiée"))
		self.assertTrue(can_transition_route("Publiée", "En cours"))
		self.assertTrue(can_transition_route("En cours", "Retour dépôt"))
		self.assertTrue(can_transition_route("En cours", "Contrôle caisse"))
		self.assertTrue(can_transition_route("Retour dépôt", "Contrôle caisse"))
		self.assertTrue(can_transition_route("Contrôle caisse", "Terminée"))
		self.assertFalse(can_transition_route("En cours", "Terminée"))
		self.assertFalse(can_transition_route("Terminée", "En cours"))

	def test_vehicle_capacity(self):
		# Contrôle de charge désactivé : ni erreur ni avertissement.
		self.assertIsNone(capacity_error(None, 200))
		self.assertIsNone(capacity_error(20, 20))
		self.assertIsNone(capacity_error(20, 21))
		self.assertIsNone(capacity_warning(None))

	def test_delivery_note_cannot_have_two_active_routes(self):
		self.assertTrue(has_assignment_conflict("LIV-0002"))
		self.assertFalse(has_assignment_conflict(None))

	def test_driver_cannot_access_another_route(self):
		self.assertTrue(driver_owns_route("DRV-1", "DRV-1"))
		self.assertFalse(driver_owns_route("DRV-2", "DRV-1"))

	def test_idempotence(self):
		self.assertTrue(is_repeated_request("request-1", "request-1"))
		self.assertFalse(is_repeated_request("request-1", "request-2"))

	def test_schedule_overlap(self):
		self.assertTrue(
			intervals_overlap(
				datetime(2026, 8, 25, 8), datetime(2026, 8, 25, 11),
				datetime(2026, 8, 25, 10), datetime(2026, 8, 25, 12),
			)
		)
		self.assertFalse(
			intervals_overlap(
				datetime(2026, 8, 25, 8), datetime(2026, 8, 25, 10),
				datetime(2026, 8, 25, 10), datetime(2026, 8, 25, 12),
			)
		)

	def test_next_free_slot_keeps_preferred_when_free(self):
		start, end = next_free_slot(
			[],
			datetime(2026, 9, 5, 8),
			datetime(2026, 9, 5, 12),
		)
		self.assertEqual((start, end), (datetime(2026, 9, 5, 8), datetime(2026, 9, 5, 12)))

	def test_next_free_slot_shifts_after_existing_morning(self):
		start, end = next_free_slot(
			[(datetime(2026, 9, 5, 8), datetime(2026, 9, 5, 12))],
			datetime(2026, 9, 5, 8),
			datetime(2026, 9, 5, 12),
		)
		self.assertEqual((start, end), (datetime(2026, 9, 5, 12), datetime(2026, 9, 5, 16)))

	def test_next_free_slot_skips_two_occupied_windows(self):
		start, end = next_free_slot(
			[
				(datetime(2026, 9, 5, 8), datetime(2026, 9, 5, 12)),
				(datetime(2026, 9, 5, 12), datetime(2026, 9, 5, 16)),
			],
			datetime(2026, 9, 5, 8),
			datetime(2026, 9, 5, 12),
		)
		self.assertEqual((start, end), (datetime(2026, 9, 5, 16), datetime(2026, 9, 5, 20)))

	def test_revision_and_reopen_rules(self):
		self.assertTrue(revision_matches(3, 3))
		self.assertFalse(revision_matches(3, 2))
		self.assertTrue(change_reason_required("Publiée"))
		self.assertEqual(planning_status_for_route("En cours"), "En cours")

	def test_draft_route_delete(self):
		self.assertIsNone(draft_route_delete_error(state="Brouillon", stop_count=0))
		self.assertEqual(
			draft_route_delete_error(state="Publiée", stop_count=0),
			"Seule une tournée brouillon peut être supprimée.",
		)
		self.assertEqual(
			draft_route_delete_error(state="Brouillon", stop_count=1),
			"Retirez tous les bons avant de supprimer la tournée.",
		)

	def test_order_change_classification(self):
		self.assertEqual(classify_order_change({"items"}), "preparation")
		self.assertEqual(classify_order_change({"delivery_date"}), "routing")
		self.assertEqual(classify_order_change({"grand_total"}), "financial")
		self.assertIsNone(classify_order_change({"po_no"}))

	def test_delivery_results(self):
		self.assertEqual(stop_status(remaining_quantity=0, delivered_quantity=2, outcome="delivered"), "Livré")
		self.assertEqual(stop_status(remaining_quantity=2, delivered_quantity=1, outcome="partial"), "Partiellement Livré")
		self.assertEqual(stop_status(remaining_quantity=2, delivered_quantity=0, outcome="failed"), "Non Livré")

	def test_public_tracking_is_minimal(self):
		payload = public_tracking_payload("DN-1", "Préparé", [], [])
		self.assertEqual(set(payload), {"name", "status", "steps", "articles"})
		self.assertNotIn("customer", payload)
		self.assertNotIn("gps", payload)

	def test_total_delivery_evidence(self):
		data = {"outcome": "delivered", "evidence": {"latitude": 36.7, "longitude": 3.0}}
		self.assertEqual(completion_errors(data, balance=1000, failure_reasons=FAILURES), [])

	def test_missing_customer_requires_accurate_gps_for_delivery(self):
		data = {
			"outcome": "delivered",
			"evidence": {
				"latitude": 36.7,
				"longitude": 3.0,
				"accuracy": 51,
				"photoData": "image",
			},
		}
		errors = completion_errors(
			data,
			balance=1000,
			failure_reasons=FAILURES,
			requires_customer_geolocation=True,
		)
		self.assertTrue(any("50 m" in error for error in errors))
		data["evidence"]["accuracy"] = 50
		self.assertEqual(
			completion_errors(
				data,
				balance=1000,
				failure_reasons=FAILURES,
				requires_customer_geolocation=True,
			),
			[],
		)

	def test_failure_does_not_require_customer_accuracy(self):
		data = {
			"outcome": "failed",
			"failureReason": "Client absent",
			"failureComment": "Porte fermée",
			"evidence": {"latitude": 36.7, "longitude": 3.0, "accuracy": 120},
		}
		self.assertEqual(
			completion_errors(
				data,
				balance=1000,
				failure_reasons=FAILURES,
				requires_customer_geolocation=True,
			),
			[],
		)

	def test_gps_parser_rejects_missing_invalid_and_zero_coordinates(self):
		self.assertEqual(parse_gps_value(None), (None, None))
		self.assertEqual(parse_gps_value("invalide"), (None, None))
		self.assertEqual(parse_gps_value("0,0"), (None, None))
		self.assertEqual(parse_gps_value("35.7,-0.6"), (35.7, -0.6))

	def test_zero_delivery_coordinates_are_invalid(self):
		data = {
			"outcome": "failed",
			"failureReason": "Client absent",
			"failureComment": "Porte fermée",
			"evidence": {"latitude": 0, "longitude": 0},
		}
		self.assertTrue(any("GPS valide" in error for error in completion_errors(data, balance=0, failure_reasons=FAILURES)))

	def test_partial_requires_quantity(self):
		data = {
			"outcome": "partial",
			"items": [{"deliveredQuantity": 0}],
			"evidence": {"latitude": 36.7, "longitude": 3.0, "photoData": "image"},
		}
		self.assertTrue(any("quantités" in error for error in completion_errors(data, balance=1000, failure_reasons=FAILURES)))

	def test_failure_requires_reason_and_comment(self):
		data = {"outcome": "failed", "evidence": {"latitude": 36.7, "longitude": 3.0}}
		errors = completion_errors(data, balance=1000, failure_reasons=FAILURES)
		self.assertTrue(any("motif" in error for error in errors))
		self.assertTrue(any("commentaire" in error for error in errors))

	def test_failed_stop_cannot_declare_payment(self):
		data = {
			"outcome": "failed",
			"failureReason": "Client absent",
			"failureComment": "Porte fermée",
			"evidence": {"latitude": 36.7, "longitude": 3.0},
			"payment": {"method": "cash", "amount": 500},
		}
		self.assertTrue(any("encaissement" in error for error in completion_errors(data, balance=1000, failure_reasons=FAILURES)))

	def test_cheque_requires_photo_and_collection_date(self):
		data = {
			"outcome": "delivered",
			"evidence": {"latitude": 36.7, "longitude": 3.0, "photoData": "image"},
			"payment": {"method": "cheque", "amount": 500},
		}
		self.assertTrue(any("chèque" in error for error in completion_errors(data, balance=1000, failure_reasons=FAILURES)))

	def test_declared_payment_can_exceed_delivery_note_balance(self):
		data = {
			"outcome": "delivered",
			"evidence": {"latitude": 36.7, "longitude": 3.0, "photoData": "image"},
			"payment": {"method": "cash", "amount": 1001},
		}
		self.assertFalse(any("solde" in error for error in completion_errors(data, balance=1000, failure_reasons=FAILURES)))

	def test_load_requires_every_delivery_note_verified(self):
		self.assertIsNone(load_verification_error({"DN-1", "DN-2"}, {"DN-2", "DN-1"}))
		self.assertIn("Vérifiez", load_verification_error({"DN-1", "DN-2"}, {"DN-1"}))
		self.assertIn("aucun bon", load_verification_error(set(), set()))

	def test_start_requires_loaded_stock(self):
		self.assertIsNone(start_without_load_error(loaded=True))
		self.assertIn("Chargez", start_without_load_error(loaded=False))

	def test_complete_stop_requires_started_loaded_and_enleve(self):
		self.assertIn("démarrée", complete_stop_gate_error(route_state="Publiée", loaded=True, stop_status="Enlevé"))
		self.assertIn("Chargez", complete_stop_gate_error(route_state="En cours", loaded=False, stop_status="Enlevé"))
		self.assertIn("chargé", complete_stop_gate_error(route_state="En cours", loaded=True, stop_status="Préparé"))
		self.assertIsNone(complete_stop_gate_error(route_state="En cours", loaded=True, stop_status="Enlevé"))


if __name__ == "__main__":
	unittest.main()
