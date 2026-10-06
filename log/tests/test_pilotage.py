import unittest
from datetime import date

from log.services import pilotage as pl

TODAY = date(2026, 10, 5)


class TestCash(unittest.TestCase):
	def test_daily_series_fills_empty_days(self):
		series = pl.daily_series(
			[{"date": "2026-10-02", "amount": 50}, {"date": "2026-10-02", "amount": 25}],
			"2026-10-01",
			"2026-10-03",
		)
		self.assertEqual([row["amount"] for row in series], [0, 75, 0])

	def test_forecast_weeks(self):
		buckets = pl.forecast_weeks(
			[
				{"due_date": "2026-09-30", "outstanding_amount": 100},
				{"due_date": "2026-10-06", "outstanding_amount": 40},
			],
			[{"due_date": "2026-10-13", "amount": 60}, {"due_date": "2026-12-01", "amount": 999}],
			TODAY,
		)
		self.assertEqual(buckets[0]["total"], 100)  # échu
		self.assertEqual(buckets[1]["invoices"], 40)  # S+1
		self.assertEqual(buckets[2]["orders"], 60)  # S+2
		self.assertEqual(sum(bucket["total"] for bucket in buckets), 200)  # au-delà de l'horizon ignoré


class TestExpiry(unittest.TestCase):
	def test_each_batch_lands_in_its_own_bucket(self):
		result = pl.expiry_exposure(
			[
				{"item": "LAIT", "item_name": "Lait", "qty": 2, "value": 100, "expiry_date": "2026-09-30"},
				{"item": "LAIT", "item_name": "Lait", "qty": 5, "value": 500, "expiry_date": "2026-10-20"},
				{"item": "VITC", "item_name": "Vitamine C", "qty": 4, "value": 80, "expiry_date": "2026-12-20"},
			],
			TODAY,
		)
		self.assertEqual(result["buckets"], {"expired": 100, "d30": 500, "d60": 0, "d90": 80})
		lait = result["items"][0]
		self.assertEqual((lait["item_code"], lait["qty"], lait["value"], lait["days"]), ("LAIT", 7, 600, -5))
		self.assertEqual(result["items"][1]["item_code"], "VITC")


class TestDelivery(unittest.TestCase):
	def test_outcomes_and_first_attempt(self):
		result = pl.delivery_outcomes(
			[
				{"status": "Livré", "attempts": 1},
				{"status": "Livré", "attempts": 2},
				{"status": "Non Livré", "reasons": ["Client absent"]},
				{"status": "Partiellement Livré", "reasons": ["Client absent", "Refus client"]},
				{"status": "Annulé"},
			]
		)
		self.assertEqual(result["closed"], 4)
		self.assertEqual(result["success_rate"], 0.5)
		self.assertEqual(result["first_attempt_rate"], 0.25)
		self.assertEqual(result["reasons"][0], {"reason": "Client absent", "count": 2})

	def test_attempt_numbers_count_redelivery_of_same_order(self):
		numbers = pl.attempt_numbers(
			[
				{"order": "SO-1", "name": "DN-2", "date": "2026-10-02"},
				{"order": "SO-1", "name": "DN-1", "date": "2026-10-01"},
				{"order": "SO-2", "name": "DN-3", "date": "2026-10-01"},
				{"order": None, "name": "DN-4", "date": "2026-10-01"},
			]
		)
		self.assertEqual(numbers, {"DN-1": 1, "DN-2": 2, "DN-3": 1})

	def test_duration_stats(self):
		self.assertEqual(pl.duration_stats([1, 2, 3, 10])["median"], 2.5)
		self.assertEqual(pl.duration_stats([])["average"], None)


class TestCustomers(unittest.TestCase):
	def test_regular_customer_gone_silent(self):
		rows = [
			# Commande tous les 10 jours, silencieux depuis 40 jours : à risque.
			{
				"customer": "A",
				"orders": 4,
				"first_order": "2026-07-27",
				"last_order": "2026-08-26",
				"revenue": 500,
			},
			# Même rythme, dernière commande il y a 5 jours : actif.
			{
				"customer": "B",
				"orders": 4,
				"first_order": "2026-09-01",
				"last_order": "2026-09-30",
				"revenue": 900,
			},
			# Trop peu de commandes pour juger.
			{
				"customer": "C",
				"orders": 2,
				"first_order": "2026-01-01",
				"last_order": "2026-02-01",
				"revenue": 100,
			},
		]
		result = pl.customers_at_risk(rows, TODAY)
		self.assertEqual([row["customer"] for row in result], ["A"])
		self.assertEqual(result[0]["days_silent"], 40)

	def test_funnel(self):
		result = pl.funnel(
			[
				{"campaign": "C1", "title": "Été", "event_type": "view_promotion", "count": 100},
				{"campaign": "C1", "event_type": "select_promotion", "count": 10},
				{"campaign": "C1", "event_type": "add_to_cart", "count": 4},
			]
		)
		self.assertEqual((result[0]["click_rate"], result[0]["cart_rate"]), (0.1, 0.04))


class TestObjectives(unittest.TestCase):
	def test_projection(self):
		result = pl.objective_progress(310, 1000, "2026-10-01", date(2026, 10, 10))
		self.assertEqual(result["progress"], 0.31)
		self.assertEqual(result["projection"], 961)
		self.assertEqual(result["expected_progress"], round(10 / 31, 4))

	def test_without_target(self):
		self.assertIsNone(pl.objective_progress(100, None, "2026-10-01", TODAY)["progress"])
