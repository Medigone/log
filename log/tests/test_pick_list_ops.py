import unittest
from unittest.mock import Mock, patch

import frappe

from log.pick_list_ops import (
	_attach_commune_names,
	scan_pick_item,
	serialize_pick_session,
	stock_shortages_for_items,
	unreserve_sales_order_stock,
)


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

	def test_session_groups_expose_locations(self):
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

		session = serialize_pick_session([doc])

		self.assertEqual(session["grouped"][0]["locations"][0]["name"], "PLI-1")
		self.assertNotIn("rows", session["grouped"][0])


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
