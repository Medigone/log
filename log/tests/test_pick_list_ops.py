import unittest
from unittest.mock import patch

import frappe

from log.pick_list_ops import _attach_commune_names, serialize_pick_session


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


if __name__ == "__main__":
	unittest.main()
