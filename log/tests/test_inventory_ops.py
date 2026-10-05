import unittest

import frappe

from log.api.distribution import MANAGER_ROLES
from log.inventory_ops import (
	INVENTORY_ROLES,
	build_lines,
	needs_recount,
	reconciliation_rows,
	review_line,
	scope_from_rows,
	target_qty,
)


def _item(name, has_batch_no=0, valuation_rate=10):
	return frappe._dict(
		name=name,
		item_name=f"Article {name}",
		stock_uom="N°",
		has_batch_no=has_batch_no,
		valuation_rate=valuation_rate,
	)


def _line(**values):
	base = dict(
		item_code="A",
		warehouse="WH",
		batch_no=None,
		status="Compté",
		counted_qty=0,
		expected_at_count=0,
		valuation_rate=10,
	)
	base.update(values)
	return frappe._dict(base)


class TestVariancePrinciple(unittest.TestCase):
	def test_movement_after_count_is_kept(self):
		# Théorique 12 au comptage, compté 10 (écart −2), puis sortie de 3 : stock actuel 9.
		self.assertEqual(target_qty(9, 10, 12), 7)

	def test_target_is_never_negative(self):
		self.assertEqual(target_qty(1, 0, 5), 0)

	def test_no_movement_gives_counted_qty(self):
		self.assertEqual(target_qty(12, 10, 12), 10)


class TestRecountThreshold(unittest.TestCase):
	def test_no_variance(self):
		self.assertFalse(needs_recount(10, 10, 0, 5))

	def test_percentage_threshold(self):
		self.assertFalse(needs_recount(100, 96, 0, 5))
		self.assertTrue(needs_recount(100, 90, 0, 5))

	def test_quantity_threshold(self):
		self.assertFalse(needs_recount(10, 8, 2, 5))
		self.assertTrue(needs_recount(10, 7, 2, 5))

	def test_unexpected_stock_always_flagged(self):
		self.assertTrue(needs_recount(0, 3, 0, 5))


class TestScope(unittest.TestCase):
	def test_rows_grouped_by_doctype_without_duplicates(self):
		scope = scope_from_rows(
			[
				{"link_doctype": "Warehouse", "link_name": "WH"},
				{"link_doctype": "Brand", "link_name": "B1"},
				{"link_doctype": "Brand", "link_name": "B1"},
				{"link_doctype": "Unknown", "link_name": "X"},
			]
		)
		self.assertEqual(scope["Warehouse"], ["WH"])
		self.assertEqual(scope["Brand"], ["B1"])
		self.assertEqual(scope["Item"], [])

	def test_roles(self):
		self.assertIn("Magasinier", INVENTORY_ROLES)
		self.assertIn("Préparateur", INVENTORY_ROLES)
		self.assertNotIn("Magasinier", MANAGER_ROLES)


class TestBuildLines(unittest.TestCase):
	def test_stock_batch_and_zero_lines(self):
		items = {"A": _item("A"), "B": _item("B", has_batch_no=1), "C": _item("C")}
		bins = [
			frappe._dict(item_code="A", warehouse="WH1", actual_qty=5, valuation_rate=12),
			frappe._dict(item_code="B", warehouse="WH1", actual_qty=8, valuation_rate=3),
		]
		batches = {
			"B": [
				{"batch_no": "L1", "warehouse": "WH1", "qty": 6},
				{"batch_no": "L2", "warehouse": "WH1", "qty": 2},
			]
		}
		lines = build_lines(items, ["WH1", "WH2"], bins, batches, include_zero_stock=True)
		keys = {(line["item_code"], line["warehouse"], line["batch_no"]): line for line in lines}

		self.assertEqual(keys[("A", "WH1", None)]["snapshot_qty"], 5)
		self.assertEqual(keys[("A", "WH1", None)]["valuation_rate"], 12)
		self.assertEqual(keys[("B", "WH1", "L1")]["snapshot_qty"], 6)
		self.assertEqual(keys[("B", "WH1", "L2")]["snapshot_qty"], 2)
		self.assertNotIn(("B", "WH1", None), keys)
		# Articles sans stock : une ligne à zéro par entrepôt, jamais pour les articles à lots.
		self.assertEqual(keys[("C", "WH2", None)]["snapshot_qty"], 0)
		self.assertIn(("A", "WH2", None), keys)
		self.assertNotIn(("B", "WH2", None), keys)

	def test_zero_stock_excluded_by_default(self):
		items = {"A": _item("A")}
		lines = build_lines(items, ["WH1"], [], {}, include_zero_stock=False)
		self.assertEqual(lines, [])


class TestReconciliationRows(unittest.TestCase):
	def test_counted_lines_use_variance(self):
		lines = [_line(counted_qty=10, expected_at_count=12)]
		rows = reconciliation_rows(lines, zero_uncounted=0, current_qty=lambda *_: 9)
		self.assertEqual(rows, [{"item_code": "A", "warehouse": "WH", "qty": 7}])

	def test_unchanged_lines_are_skipped(self):
		lines = [_line(counted_qty=12, expected_at_count=12)]
		self.assertEqual(reconciliation_rows(lines, 0, current_qty=lambda *_: 12), [])

	def test_uncounted_lines_only_zeroed_on_request(self):
		lines = [_line(status="À compter")]
		self.assertEqual(reconciliation_rows(lines, 0, current_qty=lambda *_: 4), [])
		rows = reconciliation_rows(lines, 1, current_qty=lambda *_: 4)
		self.assertEqual(rows[0]["qty"], 0)

	def test_batch_line_uses_serial_batch_fields(self):
		lines = [_line(batch_no="L1", counted_qty=3, expected_at_count=5)]
		rows = reconciliation_rows(lines, 0, current_qty=lambda *_: 5)
		self.assertEqual(rows[0]["batch_no"], "L1")
		self.assertEqual(rows[0]["use_serial_batch_fields"], 1)
		self.assertEqual(rows[0]["qty"], 3)

	def test_found_stock_without_rate_allows_zero_valuation(self):
		lines = [_line(counted_qty=2, expected_at_count=0, valuation_rate=0)]
		rows = reconciliation_rows(lines, 0, current_qty=lambda *_: 0)
		self.assertEqual(rows[0]["allow_zero_valuation_rate"], 1)


class TestReviewLine(unittest.TestCase):
	def test_counted_line_variance_and_value(self):
		row = _line(
			name="L-1",
			item_name="Article A",
			stock_uom="N°",
			hors_liste=0,
			round=1,
			snapshot_qty=12,
			counted_qty=10,
			expected_at_count=12,
			first_count_qty=0,
			last_counted_by=None,
			last_counted_at=None,
		)
		line = review_line(row, 0, 5)
		self.assertEqual(line["variance"], -2)
		self.assertEqual(line["variance_value"], -20)
		self.assertTrue(line["needs_recount"])

	def test_uncounted_line_has_no_variance(self):
		row = _line(
			name="L-2",
			item_name="Article A",
			stock_uom="N°",
			hors_liste=0,
			round=1,
			status="À compter",
			snapshot_qty=4,
			first_count_qty=0,
			last_counted_by=None,
			last_counted_at=None,
		)
		line = review_line(row, 0, 5)
		self.assertIsNone(line["variance"])
		self.assertEqual(line["expected_qty"], 4)
		self.assertFalse(line["needs_recount"])
