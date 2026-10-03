import unittest
from unittest.mock import patch

import frappe

from log import stock_reservation as sr


def _raise_throw(msg, *args, **kwargs):
	raise Exception(str(msg))


class TestOpenReservations(unittest.TestCase):
	@patch("log.stock_reservation.consumed_qty_by_so_item", return_value={"SOI-1": 3, "SOI-2": 10})
	@patch("log.stock_reservation._reservation_rows")
	def test_consumed_quantities_release_the_reservation(self, rows, _consumed):
		rows.return_value = [
			frappe._dict(name="SOI-1", parent="SO-1", item_code="A", reserved=5),
			frappe._dict(name="SOI-2", parent="SO-2", item_code="A", reserved=4),
			frappe._dict(name="SOI-3", parent="SO-3", item_code="B", reserved=2),
		]
		self.assertEqual(sr.open_reservations(["A", "B"], "W"), {"A": 2.0, "B": 2.0})

	@patch("log.stock_reservation.open_reservations", return_value={"A": 30})
	@patch("log.stock_reservation.actual_stock", return_value={"A": 50, "B": 7})
	def test_available_is_stock_minus_reservations(self, _actual, open_reservations):
		self.assertEqual(sr.available_stock(["A", "B"], "W", exclude_order="SO-9"), {"A": 20, "B": 7})
		open_reservations.assert_called_once_with(["A", "B"], "W", "SO-9")


@patch("log.stock_reservation.frappe.throw", side_effect=_raise_throw)
@patch("log.stock_reservation.available_stock", return_value={"A": 10})
class TestAllocate(unittest.TestCase):
	def test_automatic_reservation_is_capped_and_shared(self, _available, _throw):
		lines = [{"item_code": "A", "qty": 6, "reserved_qty": None}, {"item_code": "A", "qty": 6, "reserved_qty": None}]
		self.assertEqual(sr.allocate_reservations(lines, "W"), [6, 4])

	def test_explicit_reservation_over_available_is_refused(self, _available, _throw):
		with self.assertRaises(Exception) as raised:
			sr.allocate_reservations([{"item_code": "A", "qty": 20, "reserved_qty": 12}], "W")
		self.assertIn("seulement 10 disponible", str(raised.exception))

	def test_explicit_reservation_over_quantity_is_refused(self, _available, _throw):
		with self.assertRaises(Exception) as raised:
			sr.allocate_reservations([{"item_code": "A", "qty": 2, "reserved_qty": 3}], "W")
		self.assertIn("dépasse la quantité", str(raised.exception))

	def test_delivered_part_is_kept_in_stored_value(self, _available, _throw):
		lines = [{"item_code": "A", "qty": 8, "reserved_qty": None, "so_detail": "SOI-1"}]
		self.assertEqual(sr.allocate_reservations(lines, "W", consumed={"SOI-1": 5}), [8])
		self.assertEqual(sr.allocate_reservations([{**lines[0], "reserved_qty": 6}], "W", consumed={"SOI-1": 5}), [6])
		self.assertEqual(sr.allocate_reservations([{**lines[0], "reserved_qty": 0}], "W", consumed={"SOI-1": 5}), [5])


if __name__ == "__main__":
	unittest.main()
