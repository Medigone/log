import unittest
from unittest.mock import patch

import frappe

from log.delivery_note_ops import serialize_delivery_note
from log.delivery_note_print import delivery_note_print_context, route_delivery_note_names
from log.pick_list_print import pick_list_print_context
from log.pick_list_ops import _reallocate_expired_batches, serialize_pick_list, serialize_pick_session
from log.utils.batches import batch_display, expiry_threshold_days, is_expired, is_expiry_soon


def _raise_throw(msg, *args, **kwargs):
	raise Exception(str(msg))


class TestBatchRules(unittest.TestCase):
	def test_batch_stays_valid_on_its_expiry_day(self):
		self.assertFalse(is_expired("2026-10-04", today="2026-10-04"))
		self.assertTrue(is_expired("2026-10-03", today="2026-10-04"))
		self.assertFalse(is_expired(None, today="2026-10-04"))

	def test_expiry_soon_uses_threshold(self):
		self.assertTrue(is_expiry_soon("2026-11-03", 30, today="2026-10-04"))
		self.assertFalse(is_expiry_soon("2026-11-04", 30, today="2026-10-04"))
		self.assertFalse(is_expiry_soon(None, 30, today="2026-10-04"))

	def test_threshold_defaults_to_30_when_never_saved(self):
		with patch("log.utils.batches.stored_threshold", return_value=None):
			self.assertEqual(expiry_threshold_days(), 30)
		with patch("log.utils.batches.stored_threshold", return_value="0"):
			self.assertEqual(expiry_threshold_days(), 0)
		with patch("log.utils.batches.stored_threshold", return_value="45"):
			self.assertEqual(expiry_threshold_days(), 45)

	@patch("log.utils.batches.frappe.get_all")
	def test_no_query_without_batches(self, get_all):
		self.assertEqual(batch_display([None, ""]), {})
		get_all.assert_not_called()


def _location(name, batch_no, qty=2, picked_qty=0):
	return frappe._dict(
		name=name,
		item_code="ART-1",
		item_name="Lait",
		warehouse="DEPOT",
		qty=qty,
		stock_qty=qty,
		picked_qty=picked_qty,
		actual_qty=10,
		uom="N°",
		stock_uom="N°",
		conversion_factor=1,
		sales_order="SO-1",
		sales_order_item="SOI-1",
		batch_no=batch_no,
		serial_no=None,
	)


class _FakePickList(frappe._dict):
	def append(self, _field, payload):
		row = frappe._dict(payload)
		self.locations.append(row)
		return row

	def remove(self, row):
		self.locations.remove(row)

	def save(self, **_kwargs):
		self.saved = True


DISPLAY = {
	"L-LONG": {"expiry_date": "2027-06-30", "expiry_soon": False, "expired": False},
	"L-COURT": {"expiry_date": "2026-10-20", "expiry_soon": True, "expired": False},
}


@patch("log.pick_list_ops._get_delivery_note_names", return_value=[])
@patch("log.pick_list_ops.batch_display", return_value=DISPLAY)
class TestPickListBatchSerialization(unittest.TestCase):
	def _doc(self):
		return frappe._dict(
			name="PL-1",
			docstatus=0,
			status="Draft",
			purpose="Delivery",
			company="Test",
			customer="Client",
			parent_warehouse=None,
			locations=[_location("PLI-1", "L-LONG"), _location("PLI-2", "L-COURT")],
		)

	def test_locations_expose_expiry_and_group_is_fefo(self, _display, _names):
		result = serialize_pick_list(self._doc())

		by_name = {row["name"]: row for row in result["locations"]}
		self.assertEqual(by_name["PLI-2"]["expiry_date"], "2026-10-20")
		self.assertTrue(by_name["PLI-2"]["expiry_soon"])
		self.assertFalse(by_name["PLI-1"]["expiry_soon"])
		self.assertEqual([row["batch_no"] for row in result["grouped"][0]["locations"]], ["L-COURT", "L-LONG"])

	def test_session_groups_are_fefo(self, _display, _names):
		session = serialize_pick_session([self._doc()])
		self.assertEqual([row["batch_no"] for row in session["grouped"][0]["locations"]], ["L-COURT", "L-LONG"])


@patch("log.pick_list_ops.frappe.throw", side_effect=_raise_throw)
class TestReallocateExpiredBatches(unittest.TestCase):
	def _doc(self, *locations):
		return _FakePickList(name="PL-1", docstatus=0, company="Test", locations=list(locations))

	@patch("log.pick_list_ops.batch_expiry_map", return_value={"L-OK": "2027-01-01"})
	def test_nothing_to_do_when_no_batch_is_expired(self, _expiry, _throw):
		doc = self._doc(_location("PLI-1", "L-OK"))
		self.assertFalse(_reallocate_expired_batches(doc))
		self.assertFalse(doc.get("saved"))

	@patch("log.pick_list_ops._available_batch_locations")
	@patch("log.pick_list_ops.batch_expiry_map", return_value={"L-OLD": "2020-01-01", "L-NEW": "2027-01-01"})
	def test_unpicked_expired_line_moves_to_next_batch(self, _expiry, available, _throw):
		available.return_value = [
			frappe._dict(warehouse="DEPOT", batch_no="L-A", qty=1),
			frappe._dict(warehouse="DEPOT", batch_no="L-NEW", qty=10),
		]
		doc = self._doc(_location("PLI-1", "L-OLD", qty=3), _location("PLI-2", "L-NEW", qty=9))

		self.assertTrue(_reallocate_expired_batches(doc))

		self.assertTrue(doc.saved)
		self.assertNotIn("L-OLD", [row.batch_no for row in doc.locations])
		moved = [row for row in doc.locations if row.get("name") is None]
		# L-NEW n'a plus qu'1 unité libre (9 déjà engagées par PLI-2).
		self.assertEqual([(row.batch_no, row.qty, row.picked_qty) for row in moved], [("L-A", 1, 0), ("L-NEW", 1, 0)])

	@patch("log.pick_list_ops.batch_expiry_map", return_value={"L-OLD": "2020-01-01"})
	def test_picked_expired_line_blocks(self, _expiry, _throw):
		doc = self._doc(_location("PLI-1", "L-OLD", picked_qty=1))
		with self.assertRaises(Exception) as raised:
			_reallocate_expired_batches(doc)
		self.assertIn("périmé", str(raised.exception))

	@patch("log.pick_list_ops._available_batch_locations", return_value=[])
	@patch("log.pick_list_ops.batch_expiry_map", return_value={"L-OLD": "2020-01-01"})
	def test_no_valid_batch_left_blocks(self, _expiry, _available, _throw):
		doc = self._doc(_location("PLI-1", "L-OLD"))
		with self.assertRaises(Exception) as raised:
			_reallocate_expired_batches(doc)
		self.assertIn("Aucun lot valide", str(raised.exception))

	def test_submitted_pick_list_is_left_alone(self, _throw):
		doc = _FakePickList(name="PL-1", docstatus=1, locations=[_location("PLI-1", "L-OLD")])
		self.assertFalse(_reallocate_expired_batches(doc))


def _dn_item(batch_no):
	return frappe._dict(
		name="DNI-1",
		item_code="ART-1",
		item_name="Lait",
		qty=4,
		uom="N°",
		rate=100,
		amount=400,
		batch_no=batch_no,
		against_sales_order="SO-1",
	)


class TestDeliveryNoteBatches(unittest.TestCase):
	@patch("log.delivery_note_ops.batch_display", return_value=DISPLAY)
	def test_articles_expose_batch_and_expiry(self, _display):
		doc = frappe._dict(name="DN-1", customer="C", customer_name="Client", items=[_dn_item("L-COURT")])
		article = serialize_delivery_note(doc)["articles"][0]

		self.assertEqual(article["batch_no"], "L-COURT")
		self.assertEqual(article["expiry_date"], "2026-10-20")
		self.assertTrue(article["expiry_soon"])

	@patch("log.delivery_note_print._file_data_uri", return_value="")
	@patch("log.delivery_note_print._logo_data_uri", return_value="")
	@patch("log.delivery_note_print._customer_block", return_value={})
	@patch("log.delivery_note_print._company_block", return_value={"name": "MP"})
	@patch("log.delivery_note_print.batch_display", return_value=DISPLAY)
	def test_print_context_has_batch_columns(self, *_mocks):
		doc = frappe._dict(
			name="DN-1",
			docstatus=1,
			company="MP",
			customer="C",
			posting_date="2026-10-04",
			total_qty=4,
			net_total=400,
			grand_total=476,
			items=[_dn_item("L-COURT"), _dn_item(None)],
		)
		context = delivery_note_print_context(doc)

		self.assertTrue(context["has_batches"])
		self.assertEqual(context["lines"][0]["batch_no"], "L-COURT")
		self.assertEqual(context["lines"][0]["expiry_date"], "20/10/2026")
		self.assertTrue(context["lines"][0]["expiry_soon"])
		self.assertEqual(context["lines"][1]["batch_no"], "")
		self.assertEqual(context["note"]["orders"], ["SO-1"])


class TestPickListPrint(unittest.TestCase):
	@patch("log.pick_list_print._orders_block", return_value=[{"name": "SO-1", "customer": "Client"}])
	@patch("log.pick_list_print.frappe.db.get_value", return_value="Admin")
	@patch("log.pick_list_print._logo_data_uri", return_value="")
	@patch("log.pick_list_print._company_block", return_value={"name": "MP"})
	@patch("log.pick_list_print.batch_display", return_value=DISPLAY)
	def test_lines_merge_orders_per_batch_and_sort_fefo(self, *_mocks):
		second_order = _location("PLI-3", "L-COURT", qty=1)
		second_order.sales_order = "SO-2"
		doc = frappe._dict(
			name="PL-1",
			docstatus=0,
			company="MP",
			owner="admin@example.com",
			creation="2026-10-04 08:00:00",
			locations=[_location("PLI-1", "L-LONG"), _location("PLI-2", "L-COURT"), second_order],
		)
		context = pick_list_print_context(doc)

		self.assertTrue(context["has_batches"])
		self.assertEqual([line["batch_no"] for line in context["lines"]], ["L-COURT", "L-LONG"])
		self.assertEqual(context["lines"][0]["qty"], "3")
		self.assertEqual(context["lines"][0]["orders"], ["SO-1", "SO-2"])
		self.assertTrue(context["lines"][0]["expiry_soon"])
		self.assertEqual(context["lines"][0]["picked"], "")
		self.assertEqual(context["totals"]["lines"], 2)
		self.assertEqual(context["pick_list"]["status"], "Brouillon")


class TestRouteDeliveryNotes(unittest.TestCase):
	@patch("log.delivery_note_print.frappe.db.exists", return_value=True)
	@patch("log.delivery_note_print.frappe.get_all")
	def test_route_notes_follow_stop_order_and_group_same_customer(self, get_all, _exists):
		get_all.return_value = [
			frappe._dict(bon_de_livraison="DN-1", customer="C1"),
			frappe._dict(bon_de_livraison="DN-2", customer="C2"),
			frappe._dict(bon_de_livraison="DN-3", customer="C1"),
		]
		self.assertEqual(route_delivery_note_names("LIV-1"), ["DN-1", "DN-3", "DN-2"])
		self.assertEqual(get_all.call_args.kwargs["order_by"], "idx asc")

	@patch("log.delivery_note_print.frappe.throw", side_effect=_raise_throw)
	@patch("log.delivery_note_print.frappe.get_all", return_value=[])
	@patch("log.delivery_note_print.frappe.db.exists", return_value=True)
	def test_empty_route_is_refused(self, _exists, _get_all, _throw):
		with self.assertRaises(Exception) as raised:
			route_delivery_note_names("LIV-1")
		self.assertIn("aucun bon de livraison", str(raised.exception))


if __name__ == "__main__":
	unittest.main()
