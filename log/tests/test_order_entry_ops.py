import json
import unittest
from unittest.mock import MagicMock, patch

import frappe

from log.api.distribution import ORDER_ROLES, ORDER_VALIDATION_ROLES, ROLE_PRIORITY
from log.order_entry_ops import (
	PORTAL_ORIGIN,
	_rows_for_lines,
	_scaled_manual_schedule,
	_submitted_lines,
	cancel_order,
	_apply_line_pricing,
	_assert_editable,
	_clean_lines,
	_clean_schedule,
	_price_map,
	_validate_schedule,
	create_customer,
	delete_order,
	scan_order_item,
	schedule_gap,
	submit_order,
)
from log.setup.payment_terms import PAYMENT_TERMS_TEMPLATES, ensure_payment_terms


def _raise_throw(msg, *args, **kwargs):
	raise Exception(str(msg))


class _Row(frappe._dict):
	def precision(self, _field):
		return 2


class TestRoles(unittest.TestCase):
	def test_commercial_can_enter_but_not_validate(self):
		self.assertIn("Commercial", ORDER_ROLES)
		self.assertNotIn("Commercial", ORDER_VALIDATION_ROLES)
		self.assertIn(({"Commercial"}, "commercial"), ROLE_PRIORITY)


class TestLinesAndSchedule(unittest.TestCase):
	@patch("log.order_entry_ops.frappe.throw", side_effect=_raise_throw)
	def test_clean_lines_drops_empty_and_checks_discount(self, _throw):
		lines = _clean_lines(
			[{"item_code": "A", "qty": 2, "discount_percentage": 10}, {"item_code": "B", "qty": 0}, {"qty": 1}]
		)
		self.assertEqual(
			lines,
			[{"item_code": "A", "qty": 2.0, "discount_percentage": 10.0, "rate": None, "reserved_qty": None, "row_name": None}],
		)
		with self.assertRaises(Exception):
			_clean_lines([{"item_code": "A", "qty": 1, "discount_percentage": 120}])

	def test_line_discount_recomputes_rate(self):
		doc = frappe._dict(items=[_Row(price_list_rate=690, rate=690), _Row(price_list_rate=1100, rate=1100)])
		_apply_line_pricing(
			doc,
			[
				{"discount_percentage": 10, "rate": None},
				{"discount_percentage": None, "rate": None},
			],
			editable_rate=False,
		)
		rows = doc.get("items")
		self.assertEqual(rows[0].rate, 621)
		self.assertEqual(rows[0].discount_amount, 69)
		self.assertEqual(rows[1].rate, 1100)

	def test_editable_rate_sets_equivalent_discount(self):
		doc = frappe._dict(items=[_Row(price_list_rate=1000, rate=1000)])
		_apply_line_pricing(doc, [{"discount_percentage": None, "rate": 900}], editable_rate=True)
		row = doc.get("items")[0]
		self.assertEqual(row.rate, 900)
		self.assertAlmostEqual(row.discount_percentage, 10)

	@patch("log.order_entry_ops.frappe.throw", side_effect=_raise_throw)
	@patch("log.order_entry_ops.frappe.db.exists", return_value=True)
	def test_clean_schedule_requires_dates(self, _exists, _throw):
		self.assertIsNone(_clean_schedule(None))
		rows = _clean_schedule([{"due_date": "2026-10-03", "payment_amount": 500, "mode_of_payment": "Espèces"}, {"payment_amount": 0}])
		self.assertEqual(rows, [{"due_date": "2026-10-03", "payment_amount": 500.0, "mode_of_payment": "Espèces"}])
		with self.assertRaises(Exception):
			_clean_schedule([{"payment_amount": 10}])

	@patch("log.order_entry_ops.frappe.throw", side_effect=_raise_throw)
	def test_schedule_gap_is_refused(self, _throw):
		doc = frappe._dict(
			rounded_total=4130,
			grand_total=4130.04,
			transaction_date="2026-10-03",
			payment_schedule=[_Row(payment_amount=1000, due_date="2026-10-03")],
		)
		self.assertEqual(schedule_gap(doc), 3130)
		with self.assertRaises(Exception) as raised:
			_validate_schedule(doc)
		self.assertIn("écart", str(raised.exception))
		doc.payment_schedule.append(_Row(payment_amount=3130, due_date="2026-11-02"))
		_validate_schedule(doc)

	@patch("log.order_entry_ops.frappe.throw", side_effect=_raise_throw)
	def test_schedule_before_order_date_is_refused(self, _throw):
		doc = frappe._dict(
			rounded_total=100,
			transaction_date="2026-10-03",
			payment_schedule=[_Row(payment_amount=100, due_date="2026-10-01")],
		)
		with self.assertRaises(Exception):
			_validate_schedule(doc)


class TestPriceMap(unittest.TestCase):
	@patch("log.order_entry_ops.frappe.get_all")
	def test_customer_price_wins_and_other_uom_ignored(self, get_all):
		get_all.side_effect = [
			[
				frappe._dict(item_code="A", price_list_rate=100, customer=None, uom="N°"),
				frappe._dict(item_code="A", price_list_rate=90, customer="CUST", uom="N°"),
				frappe._dict(item_code="B", price_list_rate=1200, customer=None, uom="Carton"),
				frappe._dict(item_code="B", price_list_rate=100, customer=None, uom=None),
			],
			[["A", "N°"], ["B", "N°"]],
		]
		self.assertEqual(_price_map(["A", "B"], "Vente standard", "CUST"), {"A": 90, "B": 100})


@patch("log.order_entry_ops.frappe.throw", side_effect=_raise_throw)
@patch("log.order_entry_ops._require")
class TestWriteGuards(unittest.TestCase):
	@patch("log.order_entry_ops._can_validate", return_value=False)
	def test_commercial_cannot_edit_portal_draft(self, _validate, _require, _throw):
		doc = frappe._dict(docstatus=0, custom_origine_commande=PORTAL_ORIGIN, name="SO-1")
		with self.assertRaises(Exception) as raised:
			_assert_editable(doc)
		self.assertIn("portail", str(raised.exception))

	@patch("log.order_entry_ops._can_validate", return_value=True)
	def test_submitted_order_is_read_only(self, _validate, _require, _throw):
		with self.assertRaises(Exception) as raised:
			_assert_editable(frappe._dict(docstatus=1, name="SO-1"))
		self.assertIn("déjà validée", str(raised.exception))

	def test_submit_requires_validation_role(self, require, _throw):
		require.side_effect = Exception("Vous n'avez pas accès à cette opération.")
		with self.assertRaises(Exception):
			submit_order("SO-1")
		require.assert_called_once_with(ORDER_VALIDATION_ROLES)

	@patch("log.order_entry_ops._can_validate", return_value=False)
	@patch("log.order_entry_ops._get_order")
	def test_portal_draft_cannot_be_deleted(self, get_order, _validate, _require, _throw):
		get_order.return_value = frappe._dict(docstatus=0, custom_origine_commande=PORTAL_ORIGIN)
		with self.assertRaises(Exception) as raised:
			delete_order("SO-1")
		self.assertIn("portail", str(raised.exception))

	@patch("log.order_entry_ops.frappe.db.exists", return_value=False)
	@patch("log.order_entry_ops._scan_barcode", return_value={})
	def test_unknown_barcode_is_not_an_error(self, _scan, _exists, _require, _throw):
		self.assertEqual(scan_order_item(" 999 "), {"found": False, "barcode": "999"})

	@patch("log.order_entry_ops.frappe.db.exists", return_value=False)
	def test_create_customer_requires_name(self, _exists, _require, _throw):
		with self.assertRaises(Exception) as raised:
			create_customer(json.dumps({"customer_group": "Pharmacie", "commune": "COM-1"}))
		self.assertIn("nom du client", str(raised.exception))

	@patch("log.order_entry_ops.frappe.db.exists", return_value=False)
	@patch("log.api.customer_signup.frappe.throw", side_effect=_raise_throw)
	def test_create_customer_requires_category(self, _signup_throw, _exists, _require, _throw):
		with self.assertRaises(Exception) as raised:
			create_customer(json.dumps({"customer_name": "Pharmacie X", "commune": "COM-1"}))
		self.assertIn("catégorie", str(raised.exception))


class TestPaymentTermsSetup(unittest.TestCase):
	@patch("log.setup.payment_terms.frappe.get_doc")
	@patch("log.setup.payment_terms.frappe.db.exists")
	def test_ensure_payment_terms_is_idempotent(self, exists, get_doc):
		exists.return_value = True
		ensure_payment_terms()
		get_doc.assert_not_called()

		exists.side_effect = lambda doctype, name=None: doctype == "DocType"
		get_doc.return_value = MagicMock()
		ensure_payment_terms()
		templates = [call.args[0] for call in get_doc.call_args_list if call.args[0]["doctype"] == "Payment Terms Template"]
		self.assertEqual(len(templates), len(PAYMENT_TERMS_TEMPLATES))
		split = next(t for t in templates if t["template_name"].startswith("50 %"))
		self.assertEqual([row["invoice_portion"] for row in split["terms"]], [50, 50])
		self.assertEqual(split["terms"][1]["credit_days"], 30)


@patch("log.order_entry_ops.frappe.throw", side_effect=_raise_throw)
class TestSubmittedOrders(unittest.TestCase):
	def _doc(self):
		return frappe._dict(
			name="SO-1",
			items=[
				_Row(name="SOI-1", idx=1, item_code="A", item_name="Lait", delivered_qty=2, conversion_factor=1),
				_Row(name="SOI-2", idx=2, item_code="B", item_name="Gaze", delivered_qty=0, conversion_factor=1),
			],
		)

	def test_quantity_below_delivered_is_refused(self, _throw):
		with self.assertRaises(Exception) as raised:
			_submitted_lines(self._doc(), {"lines": [{"item_code": "A", "qty": 1, "row_name": "SOI-1"}]})
		self.assertIn("sous la quantité livrée", str(raised.exception))

	def test_delivered_line_cannot_be_removed(self, _throw):
		with self.assertRaises(Exception) as raised:
			_submitted_lines(self._doc(), {"lines": [{"item_code": "B", "qty": 1, "row_name": "SOI-2"}]})
		self.assertIn("ne peut pas être retirée", str(raised.exception))

	def test_undelivered_line_can_be_removed_and_new_line_added(self, _throw):
		lines = _submitted_lines(
			self._doc(), {"lines": [{"item_code": "A", "qty": 3, "row_name": "SOI-1"}, {"item_code": "C", "qty": 1}]}
		)
		self.assertEqual([line["row_name"] for line in lines], ["SOI-1", None])

	def test_rows_are_aligned_on_lines_after_update(self, _throw):
		doc = frappe._dict(
			items=[
				_Row(name="SOI-1", idx=1, item_code="A"),
				_Row(name="NEW-9", idx=2, item_code="C"),
			]
		)
		rows = _rows_for_lines(doc, [{"row_name": None, "item_code": "C"}, {"row_name": "SOI-1", "item_code": "A"}])
		self.assertEqual([row.name for row in rows], ["NEW-9", "SOI-1"])

	def test_manual_schedule_is_scaled_to_new_total(self, _throw):
		doc = frappe._dict(
			payment_schedule=[
				_Row(payment_term=None, due_date="2026-10-03", payment_amount=1000, mode_of_payment="Espèces"),
				_Row(payment_term=None, due_date="2026-11-02", payment_amount=3000, mode_of_payment=None),
			]
		)
		scaled = _scaled_manual_schedule(doc, 6001)
		self.assertEqual([row["payment_amount"] for row in scaled], [1500.25, 4500.75])
		template = frappe._dict(payment_schedule=[_Row(payment_term="Comptant", payment_amount=10)])
		self.assertIsNone(_scaled_manual_schedule(template, 20))

	@patch("log.order_entry_ops._require")
	@patch("log.order_change_ops.get_repreparation_impact_data")
	@patch("log.order_entry_ops._get_order")
	def test_cancel_is_refused_when_goods_left(self, get_order, impact, _require, _throw):
		get_order.return_value = frappe._dict(name="SO-1", docstatus=1, per_delivered=0)
		impact.return_value = {"blockers": ["Le BL DN-1 a déjà quitté la préparation."], "deliveryNotes": [], "pickLists": []}
		with self.assertRaises(Exception) as raised:
			cancel_order("SO-1")
		self.assertIn("déjà quitté", str(raised.exception))


if __name__ == "__main__":
	unittest.main()
