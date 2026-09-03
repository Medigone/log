# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

import unittest
from unittest.mock import patch

import frappe

from log.api import sales_order_stock as stock


def _raise(message, exc=frappe.PermissionError, **_kwargs):
	raise exc(message)


def _bin(item_code, warehouse, actual_qty, reserved_qty):
	return frappe._dict(
		item_code=item_code,
		warehouse=warehouse,
		actual_qty=actual_qty,
		reserved_qty=reserved_qty,
	)


class TestSalesOrderStock(unittest.TestCase):
	def test_parse_items_from_json_string(self):
		parsed = stock.parse_stock_items(
			'[{"item_code": "ART-1", "warehouse": "DEPOT"}, {"item_code": "", "warehouse": "X"}]'
		)
		self.assertEqual(parsed, [{"item_code": "ART-1", "warehouse": "DEPOT"}])

	def test_parse_items_ignores_invalid_rows(self):
		parsed = stock.parse_stock_items([{"warehouse": "DEPOT"}, "not-a-dict", None])
		self.assertEqual(parsed, [])

	def test_aggregate_sums_warehouse_and_children(self):
		result = stock.aggregate_item_stock(
			[{"item_code": "ART-1", "warehouse": "PARENT"}],
			[
				_bin("ART-1", "PARENT", 10, 2),
				_bin("ART-1", "CHILD", 5, 1),
				_bin("ART-1", "OTHER", 99, 99),
				_bin("ART-2", "PARENT", 7, 3),
			],
			{"PARENT": ["PARENT", "CHILD"]},
		)
		self.assertEqual(result["ART-1::PARENT"], {"actual_qty": 15.0, "reserved_qty": 3.0})

	def test_aggregate_company_fallback_without_warehouse(self):
		result = stock.aggregate_item_stock(
			[{"item_code": "ART-1", "warehouse": ""}],
			[
				_bin("ART-1", "WH-A", 8, 3),
				_bin("ART-1", "WH-B", 4, 1),
				_bin("ART-1", "WH-OTHER", 50, 10),
			],
			{},
			company_warehouses={"WH-A", "WH-B"},
		)
		self.assertEqual(result["ART-1::"], {"actual_qty": 12.0, "reserved_qty": 4.0})

	def test_aggregate_all_bins_when_no_company_and_no_warehouse(self):
		result = stock.aggregate_item_stock(
			[{"item_code": "ART-1", "warehouse": ""}],
			[_bin("ART-1", "WH-A", 8, 3), _bin("ART-1", "WH-B", 4, 1)],
			{},
			company_warehouses=None,
		)
		self.assertEqual(result["ART-1::"], {"actual_qty": 12.0, "reserved_qty": 4.0})

	def test_aggregate_deduplicates_requests(self):
		result = stock.aggregate_item_stock(
			[
				{"item_code": "ART-1", "warehouse": "DEPOT"},
				{"item_code": "ART-1", "warehouse": "DEPOT"},
			],
			[_bin("ART-1", "DEPOT", 2, 1)],
			{"DEPOT": ["DEPOT"]},
		)
		self.assertEqual(list(result.keys()), ["ART-1::DEPOT"])
		self.assertEqual(result["ART-1::DEPOT"], {"actual_qty": 2.0, "reserved_qty": 1.0})

	def test_child_warehouses_falls_back_when_erpnext_helper_missing(self):
		with patch.object(stock, "_get_child_warehouses", side_effect=Exception("v15 import")):
			self.assertEqual(stock.child_warehouses("DEPOT"), ["DEPOT"])

	def test_child_warehouses_uses_helper_when_available(self):
		with patch.object(stock, "_get_child_warehouses", return_value=["DEPOT", "DEPOT-A"]):
			self.assertEqual(stock.child_warehouses("DEPOT"), ["DEPOT", "DEPOT-A"])

	@patch.object(stock, "child_warehouses", return_value=["DEPOT", "DEPOT-A"])
	@patch.object(stock, "_fetch_bins")
	@patch.object(stock.frappe, "has_permission", return_value=True)
	def test_get_items_stock_groups_by_item_and_warehouse(self, _perm, fetch_bins, child_wh):
		fetch_bins.return_value = [
			_bin("ART-1", "DEPOT", 10, 4),
			_bin("ART-1", "DEPOT-A", 2, 1),
			_bin("ART-2", "DEPOT", 5, 0),
		]
		result = stock.get_items_stock(
			[
				{"item_code": "ART-1", "warehouse": "DEPOT"},
				{"item_code": "ART-2", "warehouse": "DEPOT"},
			],
			company="Acme",
		)
		self.assertEqual(result["ART-1::DEPOT"], {"actual_qty": 12.0, "reserved_qty": 5.0})
		self.assertEqual(result["ART-2::DEPOT"], {"actual_qty": 5.0, "reserved_qty": 0.0})
		fetch_bins.assert_called_once_with(["ART-1", "ART-2"])
		child_wh.assert_called_once_with("DEPOT")

	@patch.object(stock, "_company_warehouses", return_value={"WH-A"})
	@patch.object(stock, "_fetch_bins")
	@patch.object(stock.frappe, "has_permission", return_value=True)
	def test_get_items_stock_uses_company_warehouses_without_row_warehouse(
		self, _perm, fetch_bins, company_wh
	):
		fetch_bins.return_value = [_bin("ART-1", "WH-A", 3, 1), _bin("ART-1", "WH-B", 9, 2)]
		result = stock.get_items_stock([{"item_code": "ART-1", "warehouse": ""}], company="Acme")
		self.assertEqual(result["ART-1::"], {"actual_qty": 3.0, "reserved_qty": 1.0})
		company_wh.assert_called_once_with("Acme")

	@patch.object(stock.frappe, "throw", side_effect=_raise)
	@patch.object(stock.frappe, "has_permission", return_value=False)
	def test_get_items_stock_requires_sales_order_read(self, _perm, _throw):
		with self.assertRaises(frappe.PermissionError):
			stock.get_items_stock([{"item_code": "ART-1", "warehouse": "DEPOT"}])
