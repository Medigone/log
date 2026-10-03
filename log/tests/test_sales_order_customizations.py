import json
import unittest
from pathlib import Path


CUSTOMIZATIONS_DIR = Path(__file__).resolve().parents[1] / "log/custom"


class TestSalesOrderCustomizations(unittest.TestCase):
	def test_arabic_customer_name_field_is_not_exported(self):
		self._assert_fields_are_not_exported("sales_order.json", {"customer_name_in_arabic"})

	def test_uae_tax_fields_are_not_exported_on_sales_order_items(self):
		self._assert_fields_are_not_exported(
			"sales_order_item.json",
			{"tax_code", "tax_rate", "tax_amount", "total_amount"},
		)

	def _assert_fields_are_not_exported(self, filename, removed_fields):
		customizations = json.loads((CUSTOMIZATIONS_DIR / filename).read_text(encoding="utf-8"))
		self.assertTrue(
			removed_fields.isdisjoint(
				field["fieldname"] for field in customizations["custom_fields"]
			),
		)
		self.assertTrue(
			removed_fields.isdisjoint(
				property_setter.get("field_name")
				for property_setter in customizations["property_setters"]
			),
		)
		for property_setter in customizations["property_setters"]:
			if property_setter.get("property") != "field_order":
				continue
			self.assertTrue(removed_fields.isdisjoint(json.loads(property_setter["value"])))
