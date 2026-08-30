import unittest
from unittest.mock import Mock, patch

import frappe

from log.pick_list_ops import (
	_attach_commune_names,
	_covering_pick_lists_for_orders,
	pick_list_covers_remaining_items,
	scan_pick_item,
	serialize_pick_list,
	serialize_pick_session,
	stock_shortages_for_items,
	unreserve_sales_order_stock,
)


class _PickListItemLike:
	"""Document enfant ERPNext : attribut manquant → AttributeError, .get() retourne None."""

	def __init__(self, **values):
		self.__dict__.update(values)

	def get(self, key, default=None):
		return self.__dict__.get(key, default)


def _raise_throw(msg, *args, **kwargs):
	raise Exception(str(msg))


class TestPickListSerialization(unittest.TestCase):
	def test_commune_link_uses_nom_as_display_label(self):
		orders = [frappe._dict(name="SO-1", custom_commune="COM-00979")]
		with patch(
			"log.pick_list_ops.frappe.get_all",
			return_value=[frappe._dict(name="COM-00979", nom="Alger Centre")],
		):
			result = _attach_commune_names(orders)

		self.assertEqual(result[0]["custom_commune"], "COM-00979")
		self.assertEqual(result[0]["custom_commune_nom"], "Alger Centre")

	def _pick_list_doc(self, **overrides):
		location = frappe._dict(
			name="PLI-1",
			item_code="ART-1",
			item_name="Article test",
			warehouse="DEPOT",
			qty=2,
			stock_qty=2,
			picked_qty=1,
			actual_qty=10,
			uom="Unité",
			stock_uom="Unité",
			sales_order="SO-1",
			sales_order_item="SOI-1",
			batch_no=None,
			serial_no=None,
		)
		doc = frappe._dict(
			name="PL-1",
			docstatus=0,
			status="Draft",
			purpose="Delivery",
			company="Test",
			customer="Client test",
			parent_warehouse=None,
			locations=[location],
		)
		doc.update(overrides)
		return doc

	@patch("log.pick_list_ops._get_delivery_note_names", return_value=[])
	def test_session_groups_expose_locations(self, _names):
		session = serialize_pick_session([self._pick_list_doc()])

		self.assertEqual(session["grouped"][0]["locations"][0]["name"], "PLI-1")
		self.assertNotIn("rows", session["grouped"][0])
		self.assertEqual(session["delivery_notes"], [])

	@patch("log.pick_list_ops._bin_actual_qty", return_value=8)
	@patch("log.pick_list_ops._get_delivery_note_names", return_value=[])
	def test_v15_pick_list_item_reads_actual_qty_from_bin(self, _names, bin_qty):
		location = _PickListItemLike(
			name="PLI-1",
			item_code="ART-1",
			item_name="Article test",
			warehouse="DEPOT",
			qty=2,
			stock_qty=2,
			picked_qty=1,
			uom="Unité",
			stock_uom="Unité",
			sales_order="SO-1",
			sales_order_item="SOI-1",
			batch_no=None,
			serial_no=None,
		)
		self.assertFalse(hasattr(location, "actual_qty"))
		doc = self._pick_list_doc()
		doc.locations = [location]
		result = serialize_pick_list(doc)

		self.assertEqual(result["locations"][0]["actual_qty"], 8)
		bin_qty.assert_called_once_with("ART-1", "DEPOT")

	@patch("log.pick_list_ops._bin_actual_qty")
	@patch("log.pick_list_ops._get_delivery_note_names", return_value=[])
	def test_v16_pick_list_item_keeps_stored_actual_qty(self, _names, bin_qty):
		result = serialize_pick_list(self._pick_list_doc())

		self.assertEqual(result["locations"][0]["actual_qty"], 10)
		bin_qty.assert_not_called()

	@patch("log.pick_list_ops._bin_actual_qty", return_value=8)
	@patch("log.pick_list_ops._get_delivery_note_names", return_value=[])
	def test_v16_zero_actual_qty_is_not_replaced_by_bin(self, _names, bin_qty):
		doc = self._pick_list_doc()
		doc.locations[0].actual_qty = 0
		result = serialize_pick_list(doc)

		self.assertEqual(result["locations"][0]["actual_qty"], 0)
		bin_qty.assert_not_called()

	@patch("log.pick_list_ops.serialize_delivery_note", return_value={"name": "DN-1", "customer_name": "Client Test"})
	@patch("log.pick_list_ops.frappe.get_doc")
	@patch("log.pick_list_ops._get_delivery_note_names", return_value=["DN-1"])
	def test_submitted_session_exposes_delivery_notes(self, _names, get_doc, _serialize_dn):
		session = serialize_pick_session([self._pick_list_doc(docstatus=1, status="Completed")])

		self.assertEqual([note["name"] for note in session["delivery_notes"]], ["DN-1"])
		self.assertEqual(session["pick_lists"][0]["delivery_notes"][0]["name"], "DN-1")
		get_doc.assert_called_once_with("Delivery Note", "DN-1")


class TestPickListCoverage(unittest.TestCase):
	def test_covers_when_pick_list_has_all_remaining_qty(self):
		self.assertTrue(pick_list_covers_remaining_items({"SOI-1": 5}, {"SOI-1": 5}))

	def test_missing_line_after_order_change_is_not_covering(self):
		self.assertFalse(pick_list_covers_remaining_items({"SOI-1": 5, "SOI-2": 3}, {"SOI-1": 5}))

	def test_insufficient_qty_on_pick_list_is_not_covering(self):
		self.assertFalse(pick_list_covers_remaining_items({"SOI-1": 8}, {"SOI-1": 5}))

	def test_pick_list_with_extra_qty_still_covers(self):
		self.assertTrue(pick_list_covers_remaining_items({"SOI-1": 3}, {"SOI-1": 5}))

	@patch("log.pick_list_ops.frappe.get_all")
	def test_covering_map_returns_the_pick_list_that_covers_the_order(self, get_all):
		so_items = [
			frappe._dict(
				name="SOI-1",
				parent="SO-1",
				qty=5,
				picked_qty=0,
				delivered_qty=0,
				conversion_factor=1,
				delivered_by_supplier=0,
			)
		]
		pl_items = [frappe._dict(parent="PL-1", sales_order="SO-1", sales_order_item="SOI-1", qty=5)]
		get_all.side_effect = [so_items, pl_items, ["PL-1"]]

		self.assertEqual(_covering_pick_lists_for_orders(["SO-1"]), {"SO-1": "PL-1"})

	@patch("log.pick_list_ops.frappe.get_all")
	def test_covering_map_skips_when_a_line_is_missing(self, get_all):
		so_items = [
			frappe._dict(
				name="SOI-1",
				parent="SO-1",
				qty=5,
				picked_qty=0,
				delivered_qty=0,
				conversion_factor=1,
				delivered_by_supplier=0,
			),
			frappe._dict(
				name="SOI-2",
				parent="SO-1",
				qty=2,
				picked_qty=0,
				delivered_qty=0,
				conversion_factor=1,
				delivered_by_supplier=0,
			),
		]
		pl_items = [frappe._dict(parent="PL-1", sales_order="SO-1", sales_order_item="SOI-1", qty=5)]
		get_all.side_effect = [so_items, pl_items, ["PL-1"]]

		self.assertEqual(_covering_pick_lists_for_orders(["SO-1"]), {})


class TestPickListStockGuard(unittest.TestCase):
	def test_shortage_when_available_qty_is_below_required(self):
		items = [
			frappe._dict(
				item_code="ART-1",
				item_name="Article 1",
				qty=12,
				delivered_qty=0,
				picked_qty=0,
				warehouse="Magasins - MP",
				conversion_factor=1,
				delivered_by_supplier=0,
			)
		]
		shortages = stock_shortages_for_items(items, available_by_item={"ART-1": 0})
		self.assertEqual(len(shortages), 1)
		self.assertEqual(shortages[0]["required"], 12)
		self.assertEqual(shortages[0]["available"], 0)

	def test_no_shortage_when_stock_covers_remaining_qty(self):
		items = [
			frappe._dict(
				item_code="ART-1",
				item_name="Article 1",
				qty=12,
				delivered_qty=4,
				picked_qty=0,
				warehouse="Magasins - MP",
				conversion_factor=1,
				delivered_by_supplier=0,
			)
		]
		self.assertEqual(stock_shortages_for_items(items, available_by_item={"ART-1": 8}), [])


class TestUnreserveSalesOrderStock(unittest.TestCase):
	@patch("log.pick_list_ops.frappe.get_doc")
	@patch("log.pick_list_ops._stock_reservation_names_for_order", return_value=["SRE-1"])
	def test_cancels_submitted_reservation_entries(self, _names, get_doc):
		entry = Mock()
		entry.docstatus = 1
		get_doc.return_value = entry

		unreserve_sales_order_stock("SO-1")

		self.assertTrue(entry.flags.ignore_permissions)
		entry.cancel.assert_called_once()
		get_doc.assert_called_once_with("Stock Reservation Entry", "SRE-1")

	@patch("log.pick_list_ops.frappe.get_doc")
	@patch("log.pick_list_ops._stock_reservation_names_for_order", return_value=[])
	def test_skips_when_order_has_no_reservation(self, _names, get_doc):
		unreserve_sales_order_stock("SO-1")
		get_doc.assert_not_called()


class TestScanPickItem(unittest.TestCase):
	def setUp(self):
		self.session = {
			"pick_lists": [
				{
					"name": "PL-1",
					"locations": [
						{
							"name": "PLI-1",
							"item_code": "ART-1",
							"item_name": "Article test",
							"warehouse": "DEPOT",
							"stock_qty": 2,
							"stock_uom": "Unité",
							"uom": "Unité",
						}
					],
				}
			],
		}
		translate = patch("log.pick_list_ops._", side_effect=lambda msg: msg)
		throw = patch("log.pick_list_ops.frappe.throw", side_effect=_raise_throw)
		translate.start()
		throw.start()
		self.addCleanup(translate.stop)
		self.addCleanup(throw.stop)

	@patch("log.pick_list_ops._require_preparation_role")
	@patch("log.pick_list_ops.get_pick_session")
	@patch("log.pick_list_ops._scan_barcode")
	def test_resolves_barcode_in_session(self, scan_barcode, get_session, _role):
		scan_barcode.return_value = {"item_code": "ART-1", "barcode": "123456", "uom": "Unité"}
		get_session.return_value = self.session

		result = scan_pick_item("123456", ["PL-1"])

		self.assertEqual(result["item_code"], "ART-1")
		self.assertEqual(result["item_name"], "Article test")
		self.assertEqual(result["increment"], 1)
		self.assertEqual(result["barcode"], "123456")
		get_session.assert_called_once_with(["PL-1"])

	@patch("log.pick_list_ops._require_preparation_role")
	@patch("log.pick_list_ops.get_pick_session")
	@patch("log.pick_list_ops._item_exists", return_value=False)
	@patch("log.pick_list_ops._scan_barcode")
	def test_unknown_barcode_raises(self, scan_barcode, _exists, get_session, _role):
		scan_barcode.return_value = {}
		get_session.return_value = self.session
		with self.assertRaises(Exception) as raised:
			scan_pick_item("NOPE", ["PL-1"])
		self.assertIn("inconnu", str(raised.exception).lower())

	@patch("log.pick_list_ops._require_preparation_role")
	@patch("log.pick_list_ops.get_pick_session")
	@patch("log.pick_list_ops._scan_barcode")
	def test_item_outside_session_raises(self, scan_barcode, get_session, _role):
		scan_barcode.return_value = {"item_code": "ART-OTHER", "barcode": "999"}
		get_session.return_value = self.session
		with self.assertRaises(Exception) as raised:
			scan_pick_item("999", ["PL-1"])
		self.assertIn("session", str(raised.exception).lower())

	@patch("log.pick_list_ops._require_preparation_role")
	@patch("log.pick_list_ops.get_pick_session")
	@patch("log.pick_list_ops._uom_conversion_factor", return_value=12)
	@patch("log.pick_list_ops._scan_barcode")
	def test_pack_uom_uses_conversion_factor(self, scan_barcode, conversion, get_session, _role):
		scan_barcode.return_value = {"item_code": "ART-1", "barcode": "CARTON", "uom": "Carton"}
		get_session.return_value = self.session

		result = scan_pick_item("CARTON", ["PL-1"])

		self.assertEqual(result["increment"], 12)
		self.assertEqual(result["uom"], "Carton")
		conversion.assert_called_once_with("ART-1", "Carton")


if __name__ == "__main__":
	unittest.main()
