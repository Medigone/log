import json
import unittest
from unittest.mock import patch

from log.order_print import _parse_names, _pdf_filename, money, percent, quantity


def _raise_throw(msg, *args, **kwargs):
	raise Exception(str(msg))


class TestFormatting(unittest.TestCase):
	def test_french_number_format(self):
		self.assertEqual(money(11449), "11 449,00")
		self.assertEqual(money(-563.15), "-563,15")
		self.assertEqual(quantity(2.5), "2,5")
		self.assertEqual(quantity(1200), "1 200")
		self.assertEqual(percent(10), "10 %")
		self.assertEqual(percent(0), "")


@patch("log.order_print.frappe.throw", side_effect=_raise_throw)
class TestNames(unittest.TestCase):
	@patch("log.order_print.frappe.db.exists", return_value=True)
	def test_names_are_deduplicated(self, _exists, _throw):
		self.assertEqual(_parse_names(json.dumps(["SO-1", "SO-2", "SO-1", " "])), ["SO-1", "SO-2"])
		self.assertEqual(_parse_names("SO-3"), ["SO-3"])

	def test_empty_selection_is_refused(self, _throw):
		with self.assertRaises(Exception) as raised:
			_parse_names("[]")
		self.assertIn("au moins une commande", str(raised.exception))

	@patch("log.order_print.frappe.db.exists", return_value=True)
	def test_too_many_orders_are_refused(self, _exists, _throw):
		with self.assertRaises(Exception):
			_parse_names(json.dumps([f"SO-{index}" for index in range(101)]))

	def test_pdf_filename(self, _throw):
		self.assertEqual(_pdf_filename(["SAL-ORD-1"]), "SAL-ORD-1.pdf")
		self.assertTrue(_pdf_filename(["A", "B"]).endswith("-2.pdf"))


if __name__ == "__main__":
	unittest.main()
