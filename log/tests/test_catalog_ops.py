import json
import unittest
from unittest.mock import patch

import frappe

from log.api.distribution import CATALOG_ROLES, ROLE_PRIORITY
from log.catalog_ops import (
	_bulk_rate,
	_check_price_overlap,
	_clean_barcodes,
	_clean_uoms,
	_rule_state,
	save_pricing_rule,
)


def _raise_throw(msg, *args, **kwargs):
	raise Exception(str(msg))


class TestRoles(unittest.TestCase):
	def test_catalog_role_is_distribution_role(self):
		self.assertIn("Gestionnaire catalogue", CATALOG_ROLES)
		self.assertIn("Responsable", CATALOG_ROLES)
		self.assertNotIn("Commercial", CATALOG_ROLES)
		self.assertIn(({"Gestionnaire catalogue"}, "catalogue"), ROLE_PRIORITY)


class TestBulkRate(unittest.TestCase):
	def test_percent_and_amount_need_a_current_price(self):
		self.assertAlmostEqual(_bulk_rate(100, "percent", 10, None), 110)
		self.assertAlmostEqual(_bulk_rate(100, "amount", -15, None), 85)
		self.assertIsNone(_bulk_rate(None, "percent", 10, None))

	def test_fixed_and_from_buying(self):
		self.assertEqual(_bulk_rate(None, "fixed", 250, None), 250)
		self.assertAlmostEqual(_bulk_rate(None, "from_buying", 25, 80), 100)
		self.assertIsNone(_bulk_rate(None, "from_buying", 25, None))


@patch("log.catalog_ops.frappe.throw", side_effect=_raise_throw)
class TestCleanRows(unittest.TestCase):
	@patch("log.catalog_ops._barcode_owner", return_value=None)
	def test_duplicate_barcode_in_form_is_refused(self, _owner, _throw):
		with self.assertRaises(Exception) as raised:
			_clean_barcodes([{"barcode": "123"}, {"barcode": " 123 "}])
		self.assertIn("deux fois", str(raised.exception))

	@patch("log.catalog_ops._barcode_owner", return_value="ART-1")
	def test_barcode_of_same_item_is_kept(self, _owner, _throw):
		rows = _clean_barcodes([{"barcode": "3017620422003"}], item_code="ART-1")
		self.assertEqual(rows, [{"barcode": "3017620422003", "barcode_type": "EAN", "uom": None}])
		with self.assertRaises(Exception) as raised:
			_clean_barcodes([{"barcode": "3017620422003"}], item_code="ART-2")
		self.assertIn("ART-1", str(raised.exception))

	@patch("log.catalog_ops.frappe.db.exists", return_value=True)
	def test_uoms_always_start_with_stock_uom(self, _exists, _throw):
		rows = _clean_uoms([{"uom": "N°", "conversion_factor": 5}, {"uom": "Carton", "conversion_factor": 12}], "N°")
		self.assertEqual(rows, [{"uom": "N°", "conversion_factor": 1}, {"uom": "Carton", "conversion_factor": 12.0}])
		with self.assertRaises(Exception):
			_clean_uoms([{"uom": "Carton", "conversion_factor": 0}], "N°")


@patch("log.catalog_ops.frappe.throw", side_effect=_raise_throw)
class TestPriceOverlap(unittest.TestCase):
	@patch("log.catalog_ops.frappe.get_all")
	def test_open_ended_prices_overlap(self, get_all, _throw):
		get_all.return_value = [frappe._dict(name="P1", valid_from=None, valid_upto=None)]
		with self.assertRaises(Exception) as raised:
			_check_price_overlap(None, "A", "Vente standard", "CLI-1", "2026-01-01", None)
		self.assertIn("pour ce client", str(raised.exception))

	@patch("log.catalog_ops.frappe.get_all")
	def test_disjoint_periods_are_allowed(self, get_all, _throw):
		get_all.return_value = [frappe._dict(name="P1", valid_from="2026-01-01", valid_upto="2026-03-31")]
		_check_price_overlap(None, "A", "Vente standard", None, "2026-04-01", None)


class TestRuleState(unittest.TestCase):
	@patch("log.catalog_ops.nowdate", return_value="2026-06-15")
	def test_states(self, _today):
		rule = frappe._dict
		self.assertEqual(_rule_state(rule(disable=1, valid_from=None, valid_upto=None)), "desactivee")
		self.assertEqual(_rule_state(rule(disable=0, valid_from="2026-01-01", valid_upto="2026-06-01")), "expiree")
		self.assertEqual(_rule_state(rule(disable=0, valid_from="2026-07-01", valid_upto=None)), "a_venir")
		self.assertEqual(_rule_state(rule(disable=0, valid_from="2026-06-01", valid_upto=None)), "active")


@patch("log.catalog_ops.frappe.throw", side_effect=_raise_throw)
@patch("log.catalog_ops._require")
class TestSavePricingRule(unittest.TestCase):
	def test_title_and_targets_are_required(self, _require, _throw):
		with self.assertRaises(Exception) as raised:
			save_pricing_rule(json.dumps({"targets": ["A"], "value": 10}))
		self.assertIn("titre", str(raised.exception))
		with self.assertRaises(Exception) as raised:
			save_pricing_rule(json.dumps({"title": "Promo", "targets": [], "value": 10}))
		self.assertIn("au moins un", str(raised.exception))

	@patch("log.catalog_ops.frappe.db.exists", return_value=True)
	def test_percentage_above_100_is_refused(self, _exists, _require, _throw):
		with self.assertRaises(Exception) as raised:
			save_pricing_rule(json.dumps({"title": "Promo", "targets": ["A"], "value": 120}))
		self.assertIn("100 %", str(raised.exception))


if __name__ == "__main__":
	unittest.main()
