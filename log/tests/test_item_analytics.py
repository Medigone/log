import unittest
from unittest.mock import patch

import frappe

from log.api.distribution import MANAGER_ROLES
from log.item_analytics_ops import _by_item, _period, get_item_analytics
from log.services import item_analytics as ia

TODAY = "2026-10-05"


def _raise_throw(msg, *args, **kwargs):
	raise Exception(str(msg))


def _metrics(sales=None, stock=None, **kwargs):
	item = {"name": "ART", "item_name": "Article", "valuation_rate": kwargs.pop("valuation_rate", 0)}
	kwargs.setdefault("days", 30)
	kwargs.setdefault("today", TODAY)
	return ia.item_metrics(item, sales, stock, **kwargs)


class TestPeriod(unittest.TestCase):
	def test_previous_period_has_same_length_and_ends_the_day_before(self):
		self.assertEqual(ia.previous_period("2026-07-01", "2026-09-28"), ("2026-04-02", "2026-06-30"))
		self.assertEqual(ia.period_days("2026-07-01", "2026-07-01"), 1)

	@patch("log.item_analytics_ops.frappe.throw", side_effect=_raise_throw)
	def test_period_bounds(self, _throw):
		self.assertEqual(_period("2026-07-01", "2026-09-28"), ("2026-07-01", "2026-09-28"))
		with self.assertRaises(Exception):
			_period("2026-09-28", "2026-07-01")
		with self.assertRaises(Exception) as raised:
			_period("2023-01-01", "2026-09-28")
		self.assertIn("deux ans", str(raised.exception))


class TestCost(unittest.TestCase):
	def test_unit_cost_fallbacks(self):
		self.assertEqual(ia.unit_cost(10, 500, 40, 30), 50)
		self.assertEqual(ia.unit_cost(0, 0, 40, 30), 40)
		self.assertEqual(ia.unit_cost(0, 0, 0, 30), 30)

	def test_lines_without_valuation_use_current_cost(self):
		self.assertEqual(ia.sales_cost(100, 0, 9), (100, False))
		self.assertEqual(ia.sales_cost(100, 5, 9), (145, True))


class TestItemMetrics(unittest.TestCase):
	def test_margin_rotation_cover_and_discount(self):
		row = _metrics(
			{
				"qty": 30,
				"revenue": 3000,
				"known_cost": 2400,
				"unknown_qty": 0,
				"customers": 3,
				"deliveries": 4,
			},
			{"qty": 60, "value": 4800},
			last_sale="2026-10-01",
			previous={"revenue": 2000, "known_cost": 1600},
			list_price=120,
		)
		self.assertEqual(row["margin"], 600)
		self.assertEqual(row["margin_rate"], 0.2)
		self.assertEqual(row["markup"], 0.25)
		self.assertEqual(row["cover_days"], 60)
		self.assertEqual(row["rotation"], round(2400 * 365 / 30 / 4800, 2))
		self.assertEqual(row["gmroi"], round(600 * 365 / 30 / 4800, 2))
		self.assertEqual(row["discount"], round(1 - 100 / 120, 4))
		self.assertEqual(row["discount_loss"], 600)
		self.assertEqual(row["days_since_last_sale"], 4)
		self.assertEqual(row["revenue_delta"], 0.5)
		self.assertEqual(row["margin_delta"], 0.5)

	def test_returns_reduce_sales_and_estimated_cost_is_flagged(self):
		row = _metrics({"qty": -2, "revenue": -200, "known_cost": -150, "unknown_qty": 0})
		self.assertEqual(row["margin"], -50)
		self.assertIsNone(row["margin_rate"])
		estimated = _metrics({"qty": 5, "revenue": 500, "known_cost": 0, "unknown_qty": 5}, valuation_rate=60)
		self.assertTrue(estimated["cost_estimated"])
		self.assertEqual(estimated["cost"], 300)

	def test_no_sales_means_no_cover(self):
		row = _metrics(None, {"qty": 10, "value": 100})
		self.assertIsNone(row["cover_days"])
		self.assertEqual(row["stock_value"], 100)
		self.assertEqual(row["prev_revenue"], 0)


class TestAbc(unittest.TestCase):
	def test_classes_by_cumulative_share(self):
		classes = ia.abc_classes({"a": 70, "b": 15, "c": 10, "d": 5, "e": 0, "f": -20})
		self.assertEqual(classes, {"a": "A", "b": "A", "c": "B", "d": "C", "e": "C", "f": "C"})

	def test_single_item_is_a(self):
		self.assertEqual(ia.abc_classes({"x": 10}), {"x": "A"})


class TestMatrix(unittest.TestCase):
	def test_quadrants_split_on_medians(self):
		rows = [
			{"item_code": "star", "qty": 1, "revenue": 100, "margin_rate": 0.4, "cover_days": 5},
			{"item_code": "loco", "qty": 1, "revenue": 100, "margin_rate": 0.1, "cover_days": 0},
			{"item_code": "pepite", "qty": 1, "revenue": 100, "margin_rate": 0.3, "cover_days": 90},
			{"item_code": "mort", "qty": 1, "revenue": 100, "margin_rate": 0.05, "cover_days": 200},
			{"item_code": "unsold", "qty": 0, "revenue": 0, "margin_rate": None, "cover_days": None},
		]
		thresholds = ia.matrix_thresholds(rows)
		self.assertEqual(thresholds, {"margin_rate": 0.2, "cover_days": 47.5})
		self.assertEqual(
			{row["item_code"]: ia.quadrant(row, thresholds) for row in rows},
			{
				"star": "star",
				"loco": "locomotive",
				"pepite": "pepite",
				"mort": "poids_mort",
				"unsold": None,
			},
		)


class TestAlerts(unittest.TestCase):
	def codes(self, row, **kwargs):
		return [alert["code"] for alert in ia.item_alerts(row, days=30, **kwargs)]

	def test_dormant_stock_is_valued(self):
		row = _metrics(None, {"qty": 10, "value": 500}, last_sale="2026-05-01")
		alerts = ia.item_alerts(row, days=30)
		self.assertEqual([a["code"] for a in alerts], ["dormant"])
		self.assertEqual(alerts[0]["impact"], 500)

	def test_low_cover_and_overstock(self):
		fast = _metrics(
			{"qty": 300, "revenue": 3000, "known_cost": 2000}, {"qty": 20, "value": 100}, last_sale=TODAY
		)
		self.assertEqual(self.codes(fast), ["low_cover"])
		slow = _metrics(
			{"qty": 3, "revenue": 300, "known_cost": 200}, {"qty": 600, "value": 6000}, last_sale=TODAY
		)
		alerts = ia.item_alerts(slow, days=30)
		self.assertEqual([a["code"] for a in alerts], ["overstock"])
		self.assertEqual(alerts[0]["impact"], round(6000 * (1 - 120 / 6000), 2))

	def test_negative_margin_price_below_cost_and_discount(self):
		row = _metrics(
			{"qty": 10, "revenue": 800, "known_cost": 1000},
			{"qty": 20, "value": 2000},
			last_sale=TODAY,
			list_price=85,
		)
		self.assertEqual(self.codes(row), ["negative_margin", "price_below_cost"])
		discounted = _metrics({"qty": 10, "revenue": 850, "known_cost": 500}, list_price=100, last_sale=TODAY)
		self.assertIn("discount", self.codes(discounted))

	def test_stock_alerts_can_be_disabled_for_customer_scope(self):
		row = _metrics(None, {"qty": 10, "value": 500})
		self.assertEqual(self.codes(row, stock_alerts=False), [])

	def test_opportunities_sum_impacts(self):
		rows = [
			_metrics(None, {"qty": 10, "value": 500}),
			_metrics(None, {"qty": 4, "value": 300}),
		]
		ia.finalize_items(rows, days=30)
		opportunities = ia.profit_opportunities(rows)
		self.assertEqual(opportunities["dormant"], {"amount": 800, "count": 2})
		self.assertEqual(ia.totals(rows, days=30)["items_with_alerts"], 2)


class TestCustomers(unittest.TestCase):
	def test_customer_metrics_and_abc(self):
		lines = [
			{"item_code": "A", "item_name": "A", "qty": 2, "revenue": 1000, "cost": 600, "margin": 400},
			{"item_code": "B", "item_name": "B", "qty": 1, "revenue": 200, "cost": 250, "margin": -50},
		]
		row = ia.customer_metrics(
			{"name": "C1", "customer_name": "Client 1"},
			lines,
			today=TODAY,
			previous={"revenue": 600, "margin": 300},
			deliveries=3,
			last_purchase="2026-10-01",
		)
		self.assertEqual(row["margin"], 350)
		self.assertEqual(row["avg_basket"], 400)
		self.assertEqual(row["revenue_delta"], 1)
		self.assertEqual([item["item_code"] for item in row["top_items"]], ["A", "B"])
		rows = [row, {**row, "customer": "C2", "margin": -10}]
		ia.finalize_customers(rows)
		self.assertEqual((rows[0]["abc"], rows[0]["margin_share"]), ("A", 1))
		self.assertEqual((rows[1]["abc"], rows[1]["margin_share"]), ("C", None))


class TestAggregation(unittest.TestCase):
	def test_by_item_sums_customers_with_positive_qty(self):
		rows = [
			frappe._dict(item_code="A", qty=5, revenue=50, known_cost=30, unknown_qty=0, deliveries=2),
			frappe._dict(item_code="A", qty=-1, revenue=-10, known_cost=-6, unknown_qty=0, deliveries=0),
			frappe._dict(item_code="B", qty=1, revenue=10, known_cost=0, unknown_qty=1, deliveries=1),
		]
		result = _by_item(rows)
		self.assertEqual(result["A"]["qty"], 4)
		self.assertEqual(result["A"]["customers"], 1)
		self.assertEqual(result["B"]["unknown_qty"], 1)


class TestRoles(unittest.TestCase):
	def test_only_managers(self):
		self.assertEqual(MANAGER_ROLES, {"Responsable", "System Manager"})

	@patch("log.api.distribution.frappe.throw", side_effect=frappe.PermissionError)
	@patch("log.api.distribution._roles", return_value={"Commercial"})
	def test_commercial_is_refused(self, _roles, _throw):
		with self.assertRaises(frappe.PermissionError):
			get_item_analytics()
