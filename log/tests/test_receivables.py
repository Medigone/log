import unittest
from datetime import date

from log.services import receivables as rc

TODAY = date(2026, 10, 5)


def _inv(customer, amount, due):
	return {"customer": customer, "customer_name": customer.title(), "outstanding_amount": amount, "due_date": due}


class TestAging(unittest.TestCase):
	def test_buckets(self):
		self.assertEqual(rc.bucket_for(0), "not_due")
		self.assertEqual(rc.bucket_for(-3), "not_due")
		self.assertEqual(rc.bucket_for(30), "d30")
		self.assertEqual(rc.bucket_for(31), "d60")
		self.assertEqual(rc.bucket_for(90), "d90")
		self.assertEqual(rc.bucket_for(91), "d90_plus")

	def test_aging_due_soon_and_credits(self):
		rows = rc.aging_by_customer(
			[
				_inv("a", 100, "2026-10-08"),  # échoit dans 3 jours
				_inv("a", 50, "2026-09-01"),  # 34 jours de retard
				_inv("a", -20, "2026-09-15"),  # avoir
				_inv("b", 200, "2026-05-01"),  # > 90 jours
				_inv("b", 10, "2026-12-01"),  # non échu, hors fenêtre
			],
			TODAY,
		)
		a, b = rows["a"], rows["b"]
		self.assertEqual((a["gross"], a["credits"], a["overdue"], a["due_soon"]), (150, 20, 50, 100))
		self.assertEqual((a["d60"], a["not_due"], a["max_days_overdue"]), (50, 100, 34))
		self.assertEqual((b["d90_plus"], b["not_due"], b["due_soon"]), (200, 10, 0))

	def test_finalize_net_limit_and_totals(self):
		customers = rc.aging_by_customer([_inv("a", 300, "2026-09-01"), _inv("b", 80, "2026-10-20")], TODAY)
		rc.apply_advances(customers, {"a": 50})
		rows = rc.finalize(customers, {"a": 200, "b": 1000})
		self.assertEqual(rows[0]["customer"], "a")  # le plus en retard d'abord
		self.assertEqual((rows[0]["net"], rows[0]["over_limit"]), (250, True))
		self.assertFalse(rows[1]["over_limit"])
		totals = rc.totals(rows)
		self.assertEqual((totals["gross"], totals["net"], totals["overdue"]), (380, 330, 300))
		self.assertEqual((totals["overdue_customers"], totals["over_limit_customers"]), (1, 1))
		self.assertEqual(totals["overdue_share"], 0.7895)
