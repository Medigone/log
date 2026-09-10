# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

import unittest
from unittest.mock import patch

import frappe

from log.api import item_barcodes as api


def _raise(message, exc=frappe.ValidationError, **_kwargs):
	raise exc(message)


class FakeItem:
	def __init__(self, name="ART-1", item_name="Paracétamol", stock_uom="Unité", disabled=0, barcodes=None):
		self.name = name
		self.item_code = name
		self.item_name = item_name
		self.stock_uom = stock_uom
		self.disabled = disabled
		self.barcodes = list(barcodes or [])
		self.saved = False

	def append(self, field, row):
		self.barcodes.append(frappe._dict(row))

	def remove(self, row):
		self.barcodes.remove(row)

	def save(self, ignore_permissions=False):
		self.saved = True
		self.ignore_permissions = ignore_permissions


class TestItemBarcodes(unittest.TestCase):
	def test_normalize_strips_whitespace(self):
		self.assertEqual(api.normalize_barcode("  123456  "), "123456")
		self.assertEqual(api.normalize_barcode(None), "")

	def test_clamp_limit(self):
		self.assertEqual(api.clamp_limit(0), 30)
		self.assertEqual(api.clamp_limit(8), 8)
		self.assertEqual(api.clamp_limit(999), 50)

	def test_like_pattern_escapes_wildcards(self):
		self.assertEqual(api.like_pattern("A%B_C"), "%A\\%B\\_C%")

	def test_empty_barcode_rejected(self):
		with patch.object(api, "_require"), patch.object(api, "_", lambda value: value), patch.object(
			api.frappe, "throw", side_effect=_raise
		):
			with self.assertRaises(frappe.ValidationError):
				api.add_barcode("ART-1", "   ")

	@patch.object(api, "serialize_item", return_value={"itemCode": "ART-1", "barcodes": [{"barcode": "123"}]})
	@patch.object(api, "find_barcode_parent", return_value=frappe._dict(parent="ART-1"))
	@patch.object(api, "_load_item")
	@patch.object(api, "_require")
	def test_add_same_item_is_idempotent(self, _require, load_item, _find, serialize):
		load_item.return_value = FakeItem()
		result = api.add_barcode("ART-1", "123")
		self.assertTrue(result["already"])
		self.assertFalse(load_item.return_value.saved)

	@patch.object(api, "_", lambda value: value)
	@patch.object(api, "item_display_name", return_value=("ART-2", "Ibuprofène"))
	@patch.object(api, "find_barcode_parent", return_value=frappe._dict(parent="ART-2"))
	@patch.object(api, "_load_item")
	@patch.object(api, "_require")
	def test_add_rejects_barcode_owned_by_another_item(self, _require, load_item, _find, _label):
		load_item.return_value = FakeItem()
		with patch.object(api.frappe, "throw", side_effect=_raise):
			with self.assertRaises(frappe.ValidationError) as raised:
				api.add_barcode("ART-1", "999")
		self.assertIn("ART-2", str(raised.exception))
		self.assertIn("Ibuprofène", str(raised.exception))

	@patch.object(api, "serialize_item", return_value={"itemCode": "ART-1", "barcodes": [{"barcode": "555"}]})
	@patch.object(api, "allowed_uoms", return_value={"Unité", "Carton"})
	@patch.object(api, "find_barcode_parent", return_value=None)
	@patch.object(api, "_load_item")
	@patch.object(api, "_require")
	def test_add_appends_barcode_and_saves(self, _require, load_item, _find, _uoms, _serialize):
		item = FakeItem()
		load_item.return_value = item
		result = api.add_barcode("ART-1", "555", uom="Carton")
		self.assertFalse(result["already"])
		self.assertEqual(item.barcodes[0].barcode, "555")
		self.assertEqual(item.barcodes[0].uom, "Carton")
		self.assertTrue(item.saved)

	@patch.object(api, "serialize_item", return_value={"itemCode": "ART-1", "barcodes": []})
	@patch.object(api, "_load_item")
	@patch.object(api, "_require")
	def test_remove_barcode(self, _require, load_item, _serialize):
		row = frappe._dict(barcode="123")
		item = FakeItem(barcodes=[row])
		load_item.return_value = item
		api.remove_barcode("ART-1", "123")
		self.assertEqual(item.barcodes, [])
		self.assertTrue(item.saved)

	@patch.object(api, "_", lambda value: value)
	@patch.object(api, "_load_item")
	@patch.object(api, "_require")
	def test_remove_unknown_barcode_raises(self, _require, load_item):
		load_item.return_value = FakeItem()
		with patch.object(api.frappe, "throw", side_effect=_raise):
			with self.assertRaises(frappe.ValidationError):
				api.remove_barcode("ART-1", "missing")

	@patch.object(api, "serialize_item", return_value={"itemCode": "ART-1"})
	@patch.object(api, "find_barcode_parent", return_value=frappe._dict(parent="ART-1"))
	@patch.object(api, "_require")
	def test_lookup_returns_item(self, _require, _find, _serialize):
		result = api.lookup_barcode("123")
		self.assertEqual(result["barcode"], "123")
		self.assertEqual(result["item"]["itemCode"], "ART-1")

	@patch.object(api, "find_barcode_parent", return_value=None)
	@patch.object(api, "_require")
	def test_lookup_unknown(self, _require, _find):
		result = api.lookup_barcode("zzz")
		self.assertEqual(result, {"barcode": "zzz", "item": None})

	def test_serialize_search_row(self):
		row = api.serialize_search_row(
			{"name": "ART-1", "item_code": "ART-1", "item_name": "Doliprane", "stock_uom": "Unité", "barcode_count": 2}
		)
		self.assertEqual(row["itemCode"], "ART-1")
		self.assertEqual(row["barcodeCount"], 2)
