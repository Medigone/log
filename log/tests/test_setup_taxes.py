import unittest
from unittest.mock import patch

import frappe

from log.setup import taxes


class TestAlgeriaVat(unittest.TestCase):
	@patch("log.setup.taxes.frappe.db.set_value")
	@patch("log.setup.taxes.frappe.get_all")
	def test_only_templates_with_obsolete_rates_are_disabled(self, get_all, set_value):
		company = frappe._dict(name="Modern Pharma", abbr="MP")
		rates = {
			"Algeria VAT 17% - MP": [17.0],
			"Algeria VAT 7% - MP": [7.0],
			"Taxe mixte - MP": [17.0, 2.0],
			"TVA 19% - MP": [19.0],
		}

		def fake_get_all(doctype, filters=None, pluck=None, **_kwargs):
			if pluck == "name":
				return list(rates)
			return rates[filters["parent"]]

		get_all.side_effect = fake_get_all
		taxes._disable_obsolete(
			"Sales Taxes and Charges Template", "Sales Taxes and Charges", company, keep={"TVA 19% - MP"}
		)
		disabled = [call.args[1] for call in set_value.call_args_list]
		self.assertEqual(disabled, ["Algeria VAT 17% - MP", "Algeria VAT 7% - MP"])

	@patch("log.setup.taxes.frappe.get_doc")
	@patch("log.setup.taxes.frappe.db.exists", return_value=False)
	def test_purchase_template_rows_add_tax_on_total(self, _exists, get_doc):
		company = frappe._dict(name="Modern Pharma", abbr="MP")
		taxes._ensure_template(
			"Purchase Taxes and Charges Template", "Purchase Taxes and Charges", company, "TVA 9%", 9, "TVA 9% - MP", False
		)
		payload = get_doc.call_args.args[0]
		self.assertEqual(payload["title"], "TVA 9%")
		self.assertEqual(payload["is_default"], 0)
		self.assertEqual(
			payload["taxes"][0],
			{
				"charge_type": "On Net Total",
				"account_head": "TVA 9% - MP",
				"rate": 9,
				"description": "TVA 9%",
				"category": "Total",
				"add_deduct_tax": "Add",
			},
		)

	def test_rates_are_current_algerian_vat(self):
		self.assertEqual([vat["rate"] for vat in taxes.VAT_RATES], [19, 9])
		self.assertTrue(taxes.VAT_RATES[0]["default"])


if __name__ == "__main__":
	unittest.main()
