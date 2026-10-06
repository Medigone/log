import unittest

import frappe

from log.services import delivery_payment_terms as terms


def _invoice(template, posting_date, due_date, schedule_dates):
	return frappe._dict(
		payment_terms_template=template,
		posting_date=posting_date,
		due_date=due_date,
		payment_schedule=[frappe._dict(due_date=value) for value in schedule_dates],
	)


class TestInvoiceDueDates(unittest.TestCase):
	def test_late_delivery_moves_past_due_dates_to_invoice_date(self):
		doc = _invoice(terms.ON_DELIVERY, "2026-10-06", "2026-10-02", ["2026-10-02"])
		terms.on_sales_invoice_before_validate(doc)
		self.assertEqual(str(doc.due_date), "2026-10-06")
		self.assertEqual(str(doc.payment_schedule[0].due_date), "2026-10-06")

	def test_on_time_or_future_due_dates_are_kept(self):
		doc = _invoice(terms.ON_DELIVERY, "2026-10-06", "2026-10-06", ["2026-10-06", "2026-10-20"])
		terms.on_sales_invoice_before_validate(doc)
		self.assertEqual([str(row.due_date) for row in doc.payment_schedule], ["2026-10-06", "2026-10-20"])

	def test_other_terms_are_untouched(self):
		doc = _invoice("30 jours", "2026-10-06", "2026-10-02", ["2026-10-02"])
		terms.on_sales_invoice_before_validate(doc)
		self.assertEqual(doc.due_date, "2026-10-02")
		self.assertEqual(doc.payment_schedule[0].due_date, "2026-10-02")
