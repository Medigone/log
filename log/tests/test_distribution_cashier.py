import unittest
from unittest.mock import patch

import frappe

from log.api import distribution
from log.services import distribution_cashier as cashier
from log.services import distribution_fulfillment as fulfillment


class TestCashControlIndependence(unittest.TestCase):
	def test_validate_reconciliation_allows_cash_before_stock_return(self):
		route = frappe._dict(
			name="LIV-1",
			statut_chargement="Chargé",
			etat_planification="En cours",
			statut_caisse="Validée",
		)
		current = {"status": "Validée", "routeId": "LIV-1"}
		with patch.object(cashier, "reconciliation", return_value=current) as rec:
			result = cashier.validate_reconciliation(route, {})
		rec.assert_called_once_with(route)
		self.assertEqual(result["status"], "Validée")

	def test_sync_cash_status_marks_pending_only_when_untouched(self):
		route = frappe._dict(name="LIV-2", statut_caisse="Sans encaissement")
		with patch.object(fulfillment.frappe, "get_all", return_value=["PAY-1"]):
			fulfillment._sync_cash_status_after_return(route)
		self.assertEqual(route.statut_caisse, "À contrôler")

	def test_get_cashier_routes_includes_in_progress_pending_cash(self):
		captured = {}

		def fake_get_all(doctype, **kwargs):
			captured.update(kwargs)
			return []

		with (
			patch.object(distribution, "_require"),
			patch.object(distribution, "_require_schema"),
			patch.object(distribution.frappe, "get_all", fake_get_all),
		):
			distribution.get_cashier_routes("2026-08-01", "2026-08-28")
		self.assertEqual(
			captured["or_filters"],
			[
				["etat_planification", "in", ["Retour dépôt", "Contrôle caisse", "Terminée"]],
				["statut_caisse", "in", ["À contrôler", "Écart", "Validée"]],
			],
		)

	def test_ensure_source_invoice_reuses_payment_link(self):
		payment = frappe._dict(facture_source="SINV-1", bon_livraison="DN-1")
		with patch.object(cashier.frappe.db, "get_value", return_value=1):
			self.assertEqual(cashier._ensure_source_invoice(payment, frappe._dict()), "SINV-1")

	def test_ensure_source_invoice_uses_delivery_note_invoice(self):
		payment = frappe._dict(facture_source=None, bon_livraison="MAT-DN-2026-00003")

		def fake_get_value(doctype, name, field=None):
			if doctype == "Delivery Note":
				return "SINV-DN"
			if doctype == "Sales Invoice" and name == "SINV-DN":
				return 1
			return None

		with patch.object(cashier.frappe.db, "get_value", side_effect=fake_get_value):
			self.assertEqual(cashier._ensure_source_invoice(payment, frappe._dict()), "SINV-DN")
		self.assertEqual(payment.facture_source, "SINV-DN")

	def test_ensure_source_invoice_creates_missing_invoice(self):
		payment = frappe._dict(facture_source=None, bon_livraison="MAT-DN-2026-00003")
		route = frappe._dict(name="LIV-1")

		def fake_get_value(doctype, name, field=None):
			if doctype == "Sales Invoice" and name == "SINV-NEW":
				return 1
			return None

		with (
			patch.object(cashier.frappe.db, "get_value", side_effect=fake_get_value),
			patch.object(fulfillment, "create_and_submit_invoice", return_value=("SINV-NEW", "created")) as create,
		):
			self.assertEqual(cashier._ensure_source_invoice(payment, route), "SINV-NEW")
		create.assert_called_once_with(route, "MAT-DN-2026-00003")
		self.assertEqual(payment.facture_source, "SINV-NEW")

	def test_ensure_source_invoice_throws_when_creation_fails(self):
		payment = frappe._dict(facture_source=None, bon_livraison="MAT-DN-2026-00003")
		with (
			patch.object(cashier.frappe.db, "get_value", return_value=None),
			patch.object(fulfillment, "create_and_submit_invoice", return_value=(None, "error")),
			patch.object(cashier, "_", side_effect=lambda message: message),
			patch.object(cashier.frappe, "throw", side_effect=frappe.ValidationError),
		):
			with self.assertRaises(frappe.ValidationError):
				cashier._ensure_source_invoice(payment, frappe._dict())

	def test_requested_allocations_backfills_source_invoice(self):
		payment = frappe._dict(facture_source="SINV-1", montant=100)
		suggested = [
			{"name": "SINV-1", "dueDate": "2026-08-28", "outstandingAmount": 100, "allocatedAmount": 100}
		]
		with patch.object(cashier, "_suggested_allocations", return_value=suggested):
			rows = cashier._requested_allocations(
				payment, [{"salesInvoice": "SINV-OLD", "allocatedAmount": 100}]
			)
		self.assertEqual(rows, [
			{
				"salesInvoice": "SINV-1",
				"dueDate": "2026-08-28",
				"outstandingBefore": 100,
				"allocatedAmount": 100,
			}
		])

	def test_requested_allocations_keeps_payload_when_source_present(self):
		payment = frappe._dict(facture_source="SINV-1")
		requested = [
			{"salesInvoice": "SINV-1", "allocatedAmount": 50},
			{"salesInvoice": "SINV-2", "allocatedAmount": 50},
		]
		self.assertEqual(cashier._requested_allocations(payment, requested), requested)


if __name__ == "__main__":
	unittest.main()
