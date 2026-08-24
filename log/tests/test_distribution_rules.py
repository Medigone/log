import unittest
from datetime import datetime

from log.api.distribution_rules import (
	can_transition_route,
	capacity_error,
	capacity_warning,
	change_reason_required,
	classify_order_change,
	completion_errors,
	driver_owns_route,
	has_assignment_conflict,
	has_any_role,
	is_repeated_request,
	intervals_overlap,
	planning_status_for_route,
	public_tracking_payload,
	revision_matches,
	stop_status,
)

FAILURES = {"Client absent", "Autre"}


class TestDistributionRules(unittest.TestCase):
	def test_role_permissions(self):
		self.assertTrue(has_any_role({"Planificateur"}, {"Planificateur", "Responsable"}))
		self.assertTrue(has_any_role({"Responsable"}, {"Préparateur", "Responsable"}))
		self.assertTrue(has_any_role({"Livreur"}, {"Livreur", "Responsable"}))
		self.assertTrue(has_any_role({"Préparateur"}, {"Préparateur", "Responsable"}))
		self.assertFalse(has_any_role({"Livreur"}, {"Planificateur", "Responsable"}))

	def test_route_transitions(self):
		self.assertTrue(can_transition_route("Brouillon", "Publiée"))
		self.assertTrue(can_transition_route("Publiée", "En cours"))
		self.assertTrue(can_transition_route("En cours", "Terminée"))
		self.assertFalse(can_transition_route("Terminée", "En cours"))

	def test_vehicle_capacity(self):
		self.assertIsNone(capacity_error(None, 200))
		self.assertIsNone(capacity_error(20, 20))
		self.assertIn("dépassée", capacity_error(20, 21))
		self.assertIn("pas configurée", capacity_warning(None))

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

	def test_revision_and_reopen_rules(self):
		self.assertTrue(revision_matches(3, 3))
		self.assertFalse(revision_matches(3, 2))
		self.assertTrue(change_reason_required("Publiée"))
		self.assertEqual(planning_status_for_route("En cours"), "En cours")

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
		self.assertIn("photo ou une signature", completion_errors(data, balance=1000, failure_reasons=FAILURES)[0])

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

	def test_cheque_requires_photo_and_collection_date(self):
		data = {
			"outcome": "delivered",
			"evidence": {"latitude": 36.7, "longitude": 3.0, "photoData": "image"},
			"payment": {"method": "cheque", "amount": 500},
		}
		self.assertTrue(any("chèque" in error for error in completion_errors(data, balance=1000, failure_reasons=FAILURES)))

	def test_payment_cannot_exceed_balance(self):
		data = {
			"outcome": "delivered",
			"evidence": {"latitude": 36.7, "longitude": 3.0, "photoData": "image"},
			"payment": {"method": "cash", "amount": 1001},
		}
		self.assertTrue(any("solde" in error for error in completion_errors(data, balance=1000, failure_reasons=FAILURES)))


if __name__ == "__main__":
	unittest.main()
