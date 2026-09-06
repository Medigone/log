import inspect
import unittest
from types import SimpleNamespace

from log.api import distribution


class TestApplyStopOrder(unittest.TestCase):
	def test_rewrites_child_rows_and_idx(self):
		first = SimpleNamespace(bon_de_livraison="DN-A", idx=1)
		second = SimpleNamespace(bon_de_livraison="DN-B", idx=2)
		doc = SimpleNamespace(bons_de_livraison=[first, second])
		doc.set = lambda _field, rows: setattr(doc, "bons_de_livraison", rows)

		distribution._apply_stop_order(doc, ["DN-B", "DN-A"])

		self.assertEqual([row.bon_de_livraison for row in doc.bons_de_livraison], ["DN-B", "DN-A"])
		self.assertEqual([row.idx for row in doc.bons_de_livraison], [1, 2])


class TestNextRemainingOrder(unittest.TestCase):
	def test_keeps_completed_prefix_and_promotes_choice(self):
		self.assertEqual(
			distribution._next_remaining_order(
				["A", "B", "C", "D"],
				{"A": "Livré", "B": "Enlevé", "C": "Enlevé", "D": "Préparé"},
				"C",
			),
			["A", "C", "B", "D"],
		)

	def test_already_next_remaining_stays_in_place(self):
		self.assertEqual(
			distribution._next_remaining_order(
				["A", "B", "C"],
				{"A": "Livré", "B": "Enlevé", "C": "Enlevé"},
				"B",
			),
			["A", "B", "C"],
		)

	def test_promotes_every_open_note_of_the_same_customer(self):
		self.assertEqual(
			distribution._next_remaining_order(
				["A1", "B1", "A2", "C1"],
				{"A1": "Livré", "B1": "Enlevé", "A2": "Enlevé", "C1": "Préparé"},
				"A2",
				{"A1": "A", "A2": "A", "B1": "B", "C1": "C"},
			),
			["A1", "A2", "B1", "C1"],
		)


class TestReorderRouteStopsFlow(unittest.TestCase):
	def test_applies_order_and_keeps_published_until_accepted(self):
		source = inspect.getsource(distribution.reorder_route_stops)
		self.assertIn("can_reorder_route_stops", source)
		self.assertIn("_apply_stop_order", source)
		self.assertIn("_advance_route_revision", source)
		self.assertIn("revision_publiee", source)
		self.assertIn("_lock_route", source)
		self.assertNotIn('!= "Brouillon"', source)


class TestSelectNextDeliveryStopFlow(unittest.TestCase):
	def test_in_progress_only_without_revision_bump(self):
		source = inspect.getsource(distribution.select_next_delivery_stop)
		self.assertIn('!= "En cours"', source)
		self.assertIn("_next_remaining_order", source)
		self.assertIn("_invalidate_route_routing", source)
		self.assertIn("_assert_driver_route", source)
		self.assertNotIn("_bump_route_revision", source)
