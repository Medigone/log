import unittest
from unittest.mock import Mock, patch

import frappe

from log import pick_list_ops as pick_list_ops_mod
from log.pick_list_ops import (
	_active_pick_progress_for_orders,
	_apply_order_pick_fields,
	_attach_commune_names,
	_covering_pick_lists_for_orders,
	_draft_pick_coverage_for_orders,
	_draft_pick_list_names_by_order,
	_enrich_draft_pick_list,
	_enrich_recent_pick_lists,
	_pick_lists_by_so_item,
	_serialize_order_pick_lines,
	_uncovered_has_stock,
	count_ready_to_complete_orders,
	create_pick_list_from_sales_orders,
	ensure_draft_pick_list,
	ensure_open_order_pick_lists,
	get_pick_session,
	get_recent_pick_lists,
	get_pick_list_queue_stats,
	has_available_stock_for_items,
	pick_list_covers_remaining_items,
	pick_list_queue_stats,
	serialize_sales_order_pick_detail,
	scan_pick_item,
	serialize_pick_list,
	serialize_pick_session,
	stock_shortages_for_items,
	unreserve_sales_order_stock,
	on_sales_order_submit,
	on_stock_inbound,
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

	def test_serialize_order_pick_lines_skips_supplier_and_applies_qty(self):
		items = [
			frappe._dict(
				item_code="ART-1",
				item_name="Article 1",
				qty=12,
				picked_qty=0,
				delivered_qty=0,
				warehouse="DEPOT",
				conversion_factor=1,
				delivered_by_supplier=0,
				stock_uom="Unité",
			),
			frappe._dict(
				item_code="ART-2",
				item_name="Fournisseur",
				qty=1,
				picked_qty=0,
				delivered_qty=0,
				warehouse="DEPOT",
				conversion_factor=1,
				delivered_by_supplier=1,
			),
		]
		lines = _serialize_order_pick_lines(items, {"ART-1": 4, "ART-2": 9})
		self.assertEqual(len(lines), 1)
		self.assertEqual(lines[0]["item_code"], "ART-1")
		self.assertEqual(lines[0]["required"], 12)
		self.assertEqual(lines[0]["available"], 4)
		self.assertEqual(lines[0]["uom"], "Unité")
		self.assertNotIn("pick_list", lines[0])

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

	@patch("log.pick_list_ops._get_delivery_note_names", return_value=[])
	def test_serialize_exposes_order_changed_flag(self, _names):
		doc = self._pick_list_doc(custom_order_changed=1, custom_order_changed_reason="Ligne retirée")
		result = serialize_pick_list(doc)
		self.assertEqual(result["custom_order_changed"], 1)
		self.assertEqual(result["custom_order_changed_reason"], "Ligne retirée")

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

	@patch("log.pick_list_ops.frappe.get_all")
	def test_submitted_pick_list_does_not_cover_remaining(self, get_all):
		so_items = [
			frappe._dict(
				name="SOI-1",
				parent="SO-1",
				qty=4,
				picked_qty=2,
				delivered_qty=2,
				conversion_factor=1,
				delivered_by_supplier=0,
			)
		]
		pl_items = [frappe._dict(parent="PL-1", sales_order="SO-1", sales_order_item="SOI-1", qty=2)]
		get_all.side_effect = [so_items, pl_items, []]

		self.assertEqual(_covering_pick_lists_for_orders(["SO-1"]), {})


class TestDraftPickCoverage(unittest.TestCase):
	@patch("log.pick_list_ops.frappe.get_all")
	def test_uncovered_qty_after_partial_draft(self, get_all):
		so_items = [
			frappe._dict(
				name="SOI-1",
				parent="SO-1",
				item_code="ART-1",
				item_name="Article 1",
				qty=5,
				picked_qty=0,
				delivered_qty=0,
				conversion_factor=1,
				delivered_by_supplier=0,
			),
			frappe._dict(
				name="SOI-2",
				parent="SO-1",
				item_code="ART-2",
				item_name="Article 2",
				qty=3,
				picked_qty=0,
				delivered_qty=0,
				conversion_factor=1,
				delivered_by_supplier=0,
			),
		]
		pl_items = [frappe._dict(parent="PL-1", sales_order="SO-1", sales_order_item="SOI-1", qty=5)]
		get_all.side_effect = [so_items, pl_items, ["PL-1"]]

		coverage = _draft_pick_coverage_for_orders(["SO-1"])["SO-1"]
		self.assertIsNone(coverage["covering"])
		self.assertEqual(coverage["uncovered_qty"], 3)
		self.assertEqual(coverage["uncovered_items"][0]["item_code"], "ART-2")
		self.assertTrue(_uncovered_has_stock(coverage, {"ART-2": 3}))
		self.assertFalse(_uncovered_has_stock(coverage, {"ART-2": 0}))


class TestOrderPickProgress(unittest.TestCase):
	@patch("log.pick_list_ops.frappe.get_all")
	def test_aggregates_draft_and_submitted_pick_lists(self, get_all):
		items = [
			frappe._dict(parent="PL-DRAFT", sales_order="SO-1", qty=2, stock_qty=2, picked_qty=1),
			frappe._dict(parent="PL-DONE", sales_order="SO-1", qty=3, stock_qty=3, picked_qty=3),
		]
		lists = [
			frappe._dict(name="PL-DRAFT", docstatus=0),
			frappe._dict(name="PL-DONE", docstatus=1),
		]
		get_all.side_effect = [items, lists]

		result = _active_pick_progress_for_orders(["SO-1"])

		self.assertEqual(
			result["SO-1"]["pick_lists"],
			[{"name": "PL-DRAFT", "docstatus": 0}, {"name": "PL-DONE", "docstatus": 1}],
		)
		self.assertEqual(result["SO-1"]["requested_qty"], 5)
		self.assertEqual(result["SO-1"]["picked_qty"], 4)

	def test_apply_fields_without_list_uses_total_qty(self):
		order = {"name": "SO-1", "total_qty": 12, "per_picked": 0}
		_apply_order_pick_fields(order)
		self.assertEqual(order["pick_lists"], [])
		self.assertTrue(order["can_create_pick_list"])
		self.assertEqual(order["requested_qty"], 12)
		self.assertEqual(order["picked_qty"], 0)

	def test_apply_fields_falls_back_to_desk_per_picked(self):
		order = {"name": "SO-1", "total_qty": 10, "per_picked": 40}
		_apply_order_pick_fields(order)
		self.assertEqual(order["picked_qty"], 4)
		self.assertEqual(order["requested_qty"], 10)

	def test_apply_fields_blocks_create_when_submitted_list_exists(self):
		order = {"name": "SO-1", "total_qty": 12}
		_apply_order_pick_fields(
			order,
			{"pick_lists": [{"name": "PL-1", "docstatus": 1}], "picked_qty": 12, "requested_qty": 12},
		)
		self.assertFalse(order["can_create_pick_list"])
		self.assertEqual(order["existing_pick_list"], "PL-1")
		self.assertEqual(order["picked_qty"], 12)
		self.assertFalse(order["pick_incomplete"])
		self.assertFalse(order["ready_to_complete"])

	def test_apply_fields_uses_order_qty_and_allows_reliquat_after_partial_submit(self):
		order = {"name": "SO-1", "total_qty": 14, "per_picked": 50}
		_apply_order_pick_fields(
			order,
			{"pick_lists": [{"name": "PL-1", "docstatus": 1}], "picked_qty": 10, "requested_qty": 10},
			coverage={
				"covering": None,
				"uncovered_qty": 4,
				"uncovered_items": [{"item_code": "ART-2", "qty": 4}],
			},
			uncovered_has_stock=True,
		)
		self.assertEqual(order["requested_qty"], 14)
		self.assertEqual(order["picked_qty"], 10)
		self.assertTrue(order["pick_incomplete"])
		self.assertTrue(order["ready_to_complete"])
		self.assertTrue(order["can_create_pick_list"])
		self.assertEqual(order["uncovered_qty"], 4)

	def test_apply_fields_blocks_create_when_covering_draft_exists(self):
		order = {"name": "SO-1", "total_qty": 12}
		_apply_order_pick_fields(
			order,
			{"pick_lists": [{"name": "PL-1", "docstatus": 0}], "picked_qty": 0, "requested_qty": 12},
			covering="PL-1",
			coverage={"covering": "PL-1", "uncovered_qty": 0, "uncovered_items": []},
			uncovered_has_stock=False,
		)
		self.assertFalse(order["can_create_pick_list"])
		self.assertFalse(order["pick_incomplete"])


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

	def test_partial_stock_is_still_pickable(self):
		items = [
			frappe._dict(
				item_code="ART-1",
				qty=4,
				delivered_qty=0,
				picked_qty=0,
				conversion_factor=1,
				delivered_by_supplier=0,
			)
		]
		self.assertTrue(has_available_stock_for_items(items, available_by_item={"ART-1": 2}))
		self.assertFalse(has_available_stock_for_items(items, available_by_item={"ART-1": 0}))


class TestSalesOrderPickDetail(unittest.TestCase):
	def _order(self, **overrides):
		doc = frappe._dict(
			name="SO-1",
			customer="C-1",
			customer_name="Client Test",
			company="Cie",
			transaction_date="2026-09-01",
			delivery_date="2026-09-03",
			grand_total=100,
			total_qty=14,
			per_picked=0,
			per_delivered=0,
			status="To Deliver",
			custom_commune="COM-1",
			custom_wilaya="Alger",
			items=[
				frappe._dict(
					name="SOI-1",
					item_code="ART-1",
					item_name="Article 1",
					qty=12,
					picked_qty=0,
					delivered_qty=0,
					warehouse="Magasins - MP",
					conversion_factor=1,
					delivered_by_supplier=0,
				),
				frappe._dict(
					name="SOI-2",
					item_code="ART-2",
					item_name="Article 2",
					qty=2,
					picked_qty=0,
					delivered_qty=0,
					warehouse="Magasins - MP",
					conversion_factor=1,
					delivered_by_supplier=0,
				),
			],
		)
		doc.update(overrides)
		return doc

	@patch("log.pick_list_ops._attach_commune_names", side_effect=lambda orders: orders)
	@patch("log.pick_list_ops._active_pick_progress_for_orders", return_value={})
	@patch("log.pick_list_ops._draft_pick_lists_for_orders", return_value=[])
	@patch("log.pick_list_ops._draft_pick_coverage_for_orders", return_value={})
	@patch("log.pick_list_ops._bundle_item_codes", return_value=set())
	@patch("log.pick_list_ops._company_available_qty", return_value={"ART-1": 0, "ART-2": 10})
	@patch("log.pick_list_ops._pick_lists_by_so_item", return_value={})
	def test_detail_exposes_shortage_and_ok_lines(self, _pick_map, _available, _bundles, _coverage, _drafts, _progress, _communes):
		result = serialize_sales_order_pick_detail(self._order())

		self.assertEqual(result["name"], "SO-1")
		self.assertTrue(result["can_create_pick_list"])
		self.assertEqual(len(result["items"]), 2)
		self.assertEqual(result["items"][0]["required"], 12)
		self.assertEqual(result["items"][0]["available"], 0)
		self.assertIsNone(result["items"][0].get("pick_list"))
		self.assertEqual(result["items"][1]["required"], 2)
		self.assertEqual(result["items"][1]["available"], 10)
		self.assertEqual(len(result["stock_shortages"]), 1)
		self.assertEqual(result["stock_shortages"][0]["item_code"], "ART-1")
		self.assertTrue(result["has_available_stock"])

	@patch("log.pick_list_ops._attach_commune_names", side_effect=lambda orders: orders)
	@patch("log.pick_list_ops._active_pick_progress_for_orders", return_value={})
	@patch("log.pick_list_ops._draft_pick_lists_for_orders", return_value=[])
	@patch(
		"log.pick_list_ops._draft_pick_coverage_for_orders",
		return_value={"SO-1": {"covering": "PL-COVER", "uncovered_qty": 0, "uncovered_items": []}},
	)
	@patch("log.pick_list_ops._bundle_item_codes", return_value=set())
	@patch("log.pick_list_ops._company_available_qty", return_value={"ART-1": 20, "ART-2": 10})
	@patch("log.pick_list_ops._pick_lists_by_so_item", return_value={})
	def test_covered_order_cannot_create_pick_list(self, _pick_map, _available, _bundles, _coverage, _drafts, _progress, _communes):
		result = serialize_sales_order_pick_detail(self._order())

		self.assertFalse(result["can_create_pick_list"])
		self.assertEqual(result["existing_pick_list"], "PL-COVER")
		self.assertEqual(result["stock_shortages"], [])

	@patch("log.pick_list_ops._attach_commune_names", side_effect=lambda orders: orders)
	@patch("log.pick_list_ops._active_pick_progress_for_orders", return_value={})
	@patch("log.pick_list_ops._draft_pick_lists_for_orders", return_value=[{"name": "PL-DRAFT", "sales_orders": {"SO-1"}}])
	@patch(
		"log.pick_list_ops._draft_pick_coverage_for_orders",
		return_value={
			"SO-1": {
				"covering": None,
				"uncovered_qty": 12,
				"uncovered_items": [{"item_code": "ART-1", "item_name": "Article 1", "qty": 12}],
			}
		},
	)
	@patch("log.pick_list_ops._bundle_item_codes", return_value=set())
	@patch("log.pick_list_ops._company_available_qty", return_value={"ART-1": 20, "ART-2": 10})
	@patch("log.pick_list_ops._pick_lists_by_so_item", return_value={})
	def test_incomplete_draft_can_complete_when_stock_returns(self, _pick_map, _available, _bundles, _coverage, _drafts, _progress, _communes):
		result = serialize_sales_order_pick_detail(self._order())

		self.assertTrue(result["can_create_pick_list"])
		self.assertTrue(result["pick_incomplete"])
		self.assertTrue(result["ready_to_complete"])
		self.assertEqual(result["draft_pick_list"], "PL-DRAFT")
		self.assertEqual(result["uncovered_qty"], 12)

	@patch("log.pick_list_ops._attach_commune_names", side_effect=lambda orders: orders)
	@patch("log.pick_list_ops._active_pick_progress_for_orders", return_value={})
	@patch("log.pick_list_ops._draft_pick_lists_for_orders", return_value=[{"name": "PL-1", "sales_orders": {"SO-1"}}])
	@patch("log.pick_list_ops._draft_pick_coverage_for_orders", return_value={})
	@patch("log.pick_list_ops._bundle_item_codes", return_value=set())
	@patch("log.pick_list_ops._company_available_qty", return_value={"ART-1": 0, "ART-2": 10})
	@patch("log.pick_list_ops._pick_lists_by_so_item", return_value={"SOI-2": "PL-1"})
	def test_detail_attaches_pick_list_only_on_covered_lines(self, _pick_map, _available, _bundles, _coverage, _drafts, _progress, _communes):
		result = serialize_sales_order_pick_detail(self._order())

		self.assertIsNone(result["items"][0]["pick_list"])
		self.assertEqual(result["items"][1]["pick_list"], "PL-1")

	@patch("log.pick_list_ops.frappe.get_all")
	def test_pick_map_prefers_draft_over_submitted(self, get_all):
		pl_items = [
			frappe._dict(parent="PL-OLD", sales_order_item="SOI-1"),
			frappe._dict(parent="PL-DRAFT", sales_order_item="SOI-1"),
			frappe._dict(parent="PL-DRAFT", sales_order_item="SOI-2"),
		]
		lists = [
			frappe._dict(name="PL-OLD", docstatus=1, modified="2026-08-01 10:00:00"),
			frappe._dict(name="PL-DRAFT", docstatus=0, modified="2026-08-02 10:00:00"),
		]
		get_all.side_effect = [pl_items, lists]

		self.assertEqual(_pick_lists_by_so_item("SO-1"), {"SOI-1": "PL-DRAFT", "SOI-2": "PL-DRAFT"})

	@patch("log.pick_list_ops.frappe.get_all")
	def test_pick_map_ignores_cancelled_pick_list(self, get_all):
		pl_items = [
			frappe._dict(parent="PL-CANCELLED", sales_order_item="SOI-1"),
			frappe._dict(parent="PL-OPEN", sales_order_item="SOI-2"),
		]
		lists = [frappe._dict(name="PL-OPEN", docstatus=0, modified="2026-09-01 10:00:00")]
		get_all.side_effect = [pl_items, lists]

		self.assertEqual(_pick_lists_by_so_item("SO-1"), {"SOI-2": "PL-OPEN"})

	@patch("log.pick_list_ops._draft_pick_lists_for_orders")
	def test_draft_names_keep_every_pick_list_for_the_order(self, drafts):
		drafts.return_value = [
			{"name": "PL-1", "sales_orders": {"SO-1"}},
			{"name": "PL-2", "sales_orders": {"SO-1", "SO-2"}},
		]

		self.assertEqual(
			_draft_pick_list_names_by_order(["SO-1", "SO-2"]),
			{"SO-1": ["PL-1", "PL-2"], "SO-2": ["PL-2"]},
		)


class TestCreatePickListFromSalesOrders(unittest.TestCase):
	@patch("log.pick_list_ops._enrich_draft_pick_list", side_effect=lambda doc, so: doc)
	@patch("log.pick_list_ops.serialize_pick_session", return_value={"name": "SESSION"})
	@patch("log.pick_list_ops.frappe.get_doc")
	@patch("log.pick_list_ops._draft_pick_lists_for_orders", return_value=[{"name": "PL-DRAFT", "sales_orders": {"SO-1"}}])
	@patch("log.pick_list_ops._covering_pick_lists_for_orders", return_value={})
	@patch("log.pick_list_ops._sales_order_pickable")
	@patch("log.pick_list_ops._require_preparation_role")
	def test_reopens_existing_draft_instead_of_deleting(self, _role, _pickable, _covering, _drafts, get_doc, serialize, enrich):
		draft = frappe._dict(name="PL-DRAFT", locations=[{"item_code": "ART-1"}])
		get_doc.return_value = draft

		result = create_pick_list_from_sales_orders(["SO-1"])

		get_doc.assert_called_once_with("Pick List", "PL-DRAFT")
		enrich.assert_called_once_with(draft, "SO-1")
		serialize.assert_called_once_with([draft])
		self.assertEqual(result["name"], "SESSION")

	@patch("log.order_change_ops.assert_preparation_modification_accepted", side_effect=Exception("Acceptez"))
	@patch("log.pick_list_ops._require_preparation_role")
	def test_create_blocked_when_modification_pending(self, _role, _assert):
		with self.assertRaises(Exception) as raised:
			create_pick_list_from_sales_orders(["SO-1"])
		self.assertIn("Acceptez", str(raised.exception))

	@patch("log.pick_list_ops._map_pick_list_from_sales_order")
	@patch("log.pick_list_ops._throw_if_no_available_stock", side_effect=Exception("Aucun article disponible"))
	@patch("log.pick_list_ops.unreserve_sales_order_stock")
	@patch("log.pick_list_ops._draft_pick_lists_for_orders", return_value=[])
	@patch("log.pick_list_ops._covering_pick_lists_for_orders", return_value={})
	@patch("log.pick_list_ops._sales_order_pickable")
	@patch("log.pick_list_ops._require_preparation_role")
	def test_throws_when_no_locations_can_be_allocated(self, _role, _pickable, _covering, _drafts, _unreserve, throw_empty, create_pl):
		create_pl.return_value = frappe._dict(locations=[])

		with self.assertRaises(Exception):
			create_pick_list_from_sales_orders(["SO-1"])

		throw_empty.assert_called_once_with("SO-1")

	@patch("log.pick_list_ops.serialize_pick_session", return_value={"name": "SESSION"})
	@patch("log.pick_list_ops.frappe.get_doc")
	@patch("log.pick_list_ops._covering_pick_lists_for_orders", return_value={"SO-1": "PL-COVER"})
	@patch("log.pick_list_ops._sales_order_pickable")
	@patch("log.pick_list_ops._require_preparation_role")
	def test_reopens_covering_draft_without_enrich(self, _role, _pickable, _covering, get_doc, serialize):
		draft = frappe._dict(name="PL-COVER")
		get_doc.return_value = draft

		result = create_pick_list_from_sales_orders(["SO-1"])

		get_doc.assert_called_once_with("Pick List", "PL-COVER")
		serialize.assert_called_once_with([draft])
		self.assertEqual(result["name"], "SESSION")

	@patch("log.pick_list_ops.serialize_pick_session", return_value={"name": "SESSION"})
	@patch("log.pick_list_ops._map_pick_list_from_sales_order")
	@patch("log.pick_list_ops.unreserve_sales_order_stock")
	@patch("log.pick_list_ops._draft_pick_lists_for_orders", return_value=[])
	@patch("log.pick_list_ops._covering_pick_lists_for_orders", return_value={})
	@patch("log.pick_list_ops._sales_order_pickable")
	@patch("log.pick_list_ops._require_preparation_role")
	def test_creates_reliquat_list_after_submitted_partial(
		self, _role, _pickable, _covering, _drafts, unreserve, create_pl, serialize
	):
		target = Mock()
		target.get.side_effect = lambda key, default=None: [{"item_code": "ART-2"}] if key == "locations" else default
		create_pl.return_value = target

		result = create_pick_list_from_sales_orders(["SO-1"])

		unreserve.assert_called_once_with("SO-1")
		create_pl.assert_called_once_with("SO-1")
		self.assertEqual(target.purpose, "Delivery")
		target.insert.assert_called_once_with(ignore_permissions=True)
		serialize.assert_called_once_with([target])
		self.assertEqual(result["name"], "SESSION")


class TestEnrichDraftPickList(unittest.TestCase):
	@patch("log.pick_list_ops.unreserve_sales_order_stock")
	@patch("log.pick_list_ops._map_pick_list_from_sales_order")
	@patch("log.pick_list_ops.frappe.get_doc")
	def test_appends_restocked_location_without_resetting_picked_qty(self, get_doc, create_pl, _unreserve):
		existing = frappe._dict(
			item_code="ART-2",
			sales_order_item="SOI-2",
			warehouse="DEPOT",
			batch_no=None,
			qty=2,
			stock_qty=2,
			picked_qty=1,
			conversion_factor=1,
		)
		locations = [existing]

		def append(_field, payload):
			row = frappe._dict(payload)
			locations.append(row)
			return row

		doc = frappe._dict(locations=locations, append=append, save=Mock())
		so = Mock()
		so.items = [
				frappe._dict(
					name="SOI-1",
					item_code="ART-1",
					qty=12,
					picked_qty=0,
					delivered_qty=0,
					conversion_factor=1,
					delivered_by_supplier=0,
				),
				frappe._dict(
					name="SOI-2",
					item_code="ART-2",
					qty=2,
					picked_qty=0,
					delivered_qty=0,
					conversion_factor=1,
					delivered_by_supplier=0,
				),
		]
		get_doc.return_value = so
		create_pl.return_value = frappe._dict(
			locations=[
				frappe._dict(
					item_code="ART-1",
					item_name="Article 1",
					sales_order_item="SOI-1",
					warehouse="DEPOT",
					batch_no=None,
					qty=12,
					stock_qty=12,
					conversion_factor=1,
					picked_qty=0,
				)
			]
		)

		result = _enrich_draft_pick_list(doc, "SO-1")

		self.assertEqual(len(result.locations), 2)
		self.assertEqual(existing.picked_qty, 1)
		self.assertEqual(result.locations[1]["item_code"], "ART-1")
		self.assertEqual(result.locations[1]["picked_qty"], 0)
		self.assertEqual(result.locations[1]["qty"], 12)
		doc.save.assert_called_once()


class TestReadyToCompleteCount(unittest.TestCase):
	@patch("log.pick_list_ops._stock_shortages_for_orders")
	@patch("log.pick_list_ops._draft_pick_coverage_for_orders")
	def test_counts_orders_with_uncovered_stock(self, coverage, stock):
		coverage.return_value = {
			"SO-1": {"uncovered_qty": 4, "uncovered_items": [{"item_code": "ART-2", "qty": 4}]},
			"SO-2": {"uncovered_qty": 2, "uncovered_items": [{"item_code": "ART-9", "qty": 2}]},
		}
		stock.return_value = {
			"SO-1": {"items": [{"item_code": "ART-2", "available": 4, "required": 4}]},
			"SO-2": {"items": [{"item_code": "ART-9", "available": 0, "required": 2}]},
		}
		self.assertEqual(count_ready_to_complete_orders([frappe._dict(name="SO-1"), frappe._dict(name="SO-2")]), 1)


class TestRecentPickLists(unittest.TestCase):
	@patch("log.pick_list_ops.frappe.get_all")
	def test_enriches_clients_orders_and_quantities_without_get_doc(self, get_all):
		items = [
			frappe._dict(
				parent="PL-1",
				sales_order="SO-1",
				qty=2,
				stock_qty=2,
				picked_qty=1,
				warehouse="DEPOT",
				item_code="ART-1",
				item_name="Article test",
				uom="Unité",
				stock_uom="Unité",
			),
			frappe._dict(
				parent="PL-1",
				sales_order="SO-2",
				qty=3,
				stock_qty=3,
				picked_qty=0,
				warehouse="DEPOT",
				item_code="ART-2",
				item_name="Article 2",
				uom="Unité",
				stock_uom="Unité",
			),
		]
		dns = [frappe._dict(parent="DN-1", against_pick_list="PL-1")]
		orders = [
			frappe._dict(name="SO-1", customer="C-1", customer_name="Client Test 1", custom_wilaya="Alger"),
			frappe._dict(name="SO-2", customer="C-2", customer_name="Client Test 2", custom_wilaya="Oran"),
		]
		get_all.side_effect = [items, dns, orders]

		result = _enrich_recent_pick_lists(
			[frappe._dict(name="PL-1", docstatus=0, status="Draft", modified="2026-09-01 10:00:00")]
		)

		self.assertEqual(result[0]["sales_orders"], ["SO-1", "SO-2"])
		self.assertEqual(result[0]["sales_order_count"], 2)
		self.assertEqual(result[0]["customer_names"], ["Client Test 1", "Client Test 2"])
		self.assertEqual(result[0]["wilayas"], ["Alger", "Oran"])
		self.assertEqual(result[0]["requested_qty"], 5)
		self.assertEqual(result[0]["picked_qty"], 1)
		self.assertEqual(result[0]["warehouses"], ["DEPOT"])
		self.assertEqual(result[0]["delivery_notes"], ["DN-1"])
		self.assertEqual(
			result[0]["items"],
			[
				{
					"item_code": "ART-1",
					"item_name": "Article test",
					"warehouse": "DEPOT",
					"sales_order": "SO-1",
					"requested_qty": 2,
					"picked_qty": 1,
					"uom": "Unité",
				},
				{
					"item_code": "ART-2",
					"item_name": "Article 2",
					"warehouse": "DEPOT",
					"sales_order": "SO-2",
					"requested_qty": 3,
					"picked_qty": 0,
					"uom": "Unité",
				},
			],
		)
		self.assertEqual(
			get_all.call_args_list[2].kwargs["fields"],
			["name", "customer_name", "customer", "custom_wilaya"],
		)
		self.assertEqual([call.args[0] for call in get_all.call_args_list], ["Pick List Item", "Delivery Note Item", "Sales Order"])

	@patch("log.pick_list_ops.frappe.get_doc")
	@patch("log.pick_list_ops._require_preparation_role")
	@patch("log.pick_list_ops.frappe.get_all")
	def test_get_recent_pick_lists_does_not_load_each_document(self, get_all, _role, get_doc):
		pick_lists = [frappe._dict(name="PL-1", docstatus=1, status="Completed", modified="2026-09-01 10:00:00")]
		get_all.side_effect = [pick_lists, [], [], []]

		result = get_recent_pick_lists(limit=10)

		self.assertEqual(result[0]["name"], "PL-1")
		self.assertEqual(result[0]["sales_orders"], [])
		self.assertEqual(result[0]["requested_qty"], 0)
		get_doc.assert_not_called()
		_role.assert_called_once()


class TestPickListQueueStats(unittest.TestCase):
	def test_aggregates_drafts_submitted_remaining_and_changed(self):
		fake_db = Mock()
		fake_db.has_column.return_value = True
		fake_db.count.side_effect = [3, 8, 2]
		fake_db.sql.return_value = ((27.0,),)
		with patch.object(pick_list_ops_mod.frappe, "db", fake_db):
			stats = pick_list_queue_stats()
		self.assertEqual(stats["drafts"], 3)
		self.assertEqual(stats["submitted"], 8)
		self.assertEqual(stats["remainingQty"], 27)
		self.assertEqual(stats["changed"], 2)

	@patch("log.pick_list_ops._require_preparation_role")
	@patch("log.pick_list_ops.pick_list_queue_stats", return_value={"drafts": 1, "submitted": 0, "remainingQty": 4, "changed": 0})
	def test_get_pick_list_queue_stats_requires_role(self, stats, role):
		self.assertEqual(get_pick_list_queue_stats()["drafts"], 1)
		role.assert_called_once()
		stats.assert_called_once()


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


class TestGetPickSessionModificationPending(unittest.TestCase):
	@patch("log.pick_list_ops._require_preparation_role")
	@patch("log.pick_list_ops.frappe.get_doc")
	@patch("log.pick_list_ops.serialize_pick_session", return_value={"name": "SESSION", "sales_orders": ["SO-1"]})
	@patch("log.order_change_ops.pending_order_change_notice", return_value="Commande SO-1 modifiée")
	@patch("log.order_change_ops.pending_modified_sales_orders", return_value=["SO-1"])
	@patch("log.order_change_ops.sales_orders_from_pick_docs", return_value=["SO-1"])
	@patch("log.order_change_ops.clear_order_changed_status")
	def test_session_flags_pending_without_clearing(
		self, clear, _sos, _pending, notice, serialize, get_doc, _role
	):
		get_doc.return_value = frappe._dict(name="PL-1", locations=[])
		result = get_pick_session(["PL-1"])

		self.assertEqual(result["order_changed_notice"], "Commande SO-1 modifiée")
		self.assertEqual(result["pending_sales_orders"], ["SO-1"])
		self.assertTrue(result["modification_pending"])
		clear.assert_not_called()
		serialize.assert_called_once()


class TestEnsureDraftPickList(unittest.TestCase):
	@patch("log.pick_list_ops._build_or_reuse_pick_list")
	@patch("log.pick_list_ops.frappe.get_doc")
	def test_skips_closed_order(self, get_doc, build):
		get_doc.return_value = frappe._dict(docstatus=1, status="Closed", per_picked=0, per_delivered=0)
		self.assertIsNone(ensure_draft_pick_list("SO-1"))
		build.assert_not_called()

	@patch("log.pick_list_ops._build_or_reuse_pick_list")
	@patch("log.pick_list_ops.frappe.get_doc")
	def test_skips_fully_picked_order(self, get_doc, build):
		get_doc.return_value = frappe._dict(docstatus=1, status="To Deliver", per_picked=100, per_delivered=0)
		self.assertIsNone(ensure_draft_pick_list("SO-1"))
		build.assert_not_called()

	@patch("log.pick_list_ops._map_pick_list_from_sales_order", return_value=frappe._dict(locations=[]))
	@patch("log.pick_list_ops.unreserve_sales_order_stock")
	@patch("log.pick_list_ops._draft_pick_lists_for_orders", return_value=[])
	@patch("log.pick_list_ops._covering_pick_lists_for_orders", return_value={})
	@patch("log.pick_list_ops.frappe.get_doc")
	def test_returns_none_when_no_stock(self, get_doc, _covering, _drafts, unreserve, _map):
		get_doc.return_value = frappe._dict(docstatus=1, status="To Deliver", per_picked=0, per_delivered=0)
		self.assertIsNone(ensure_draft_pick_list("SO-1"))
		unreserve.assert_called_once_with("SO-1")

	@patch("log.pick_list_ops._map_pick_list_from_sales_order")
	@patch("log.pick_list_ops.unreserve_sales_order_stock")
	@patch("log.pick_list_ops._draft_pick_lists_for_orders", return_value=[])
	@patch("log.pick_list_ops._covering_pick_lists_for_orders", return_value={})
	@patch("log.pick_list_ops.frappe.get_doc")
	def test_creates_draft_when_stock_available(self, get_doc, _covering, _drafts, unreserve, map_pl):
		get_doc.return_value = frappe._dict(docstatus=1, status="To Deliver", per_picked=0, per_delivered=0)
		target = Mock()
		target.get.side_effect = lambda key, default=None: [{"item_code": "ART-1"}] if key == "locations" else default
		map_pl.return_value = target

		result = ensure_draft_pick_list("SO-1")

		unreserve.assert_called_once_with("SO-1")
		self.assertEqual(target.purpose, "Delivery")
		target.insert.assert_called_once_with(ignore_permissions=True)
		self.assertIs(result, target)

	@patch("log.pick_list_ops._enrich_draft_pick_list", side_effect=lambda doc, so: doc)
	@patch("log.pick_list_ops._draft_pick_lists_for_orders", return_value=[{"name": "PL-DRAFT", "sales_orders": {"SO-1"}}])
	@patch("log.pick_list_ops._covering_pick_lists_for_orders", return_value={})
	@patch("log.pick_list_ops.frappe.get_doc")
	def test_enriches_existing_incomplete_draft(self, get_doc, _covering, _drafts, enrich):
		so = frappe._dict(docstatus=1, status="To Deliver", per_picked=0, per_delivered=0)
		draft = frappe._dict(name="PL-DRAFT")
		get_doc.side_effect = [so, draft]

		result = ensure_draft_pick_list("SO-1")

		enrich.assert_called_once_with(draft, "SO-1")
		self.assertIs(result, draft)

	@patch("log.pick_list_ops._map_pick_list_from_sales_order")
	@patch("log.pick_list_ops.unreserve_sales_order_stock")
	@patch("log.pick_list_ops._draft_pick_lists_for_orders", return_value=[])
	@patch("log.pick_list_ops._covering_pick_lists_for_orders", return_value={})
	@patch("log.pick_list_ops.frappe.get_doc")
	def test_creates_second_list_after_submitted_partial(self, get_doc, _covering, _drafts, unreserve, map_pl):
		get_doc.return_value = frappe._dict(docstatus=1, status="To Deliver", per_picked=40, per_delivered=0)
		target = Mock()
		target.get.side_effect = lambda key, default=None: [{"item_code": "ART-2"}] if key == "locations" else default
		map_pl.return_value = target

		result = ensure_draft_pick_list("SO-1")

		unreserve.assert_called_once_with("SO-1")
		map_pl.assert_called_once_with("SO-1")
		target.insert.assert_called_once_with(ignore_permissions=True)
		self.assertIs(result, target)


class TestEnsureOpenOrderPickLists(unittest.TestCase):
	@patch("log.pick_list_ops.ensure_draft_pick_list")
	@patch("log.pick_list_ops._stock_shortages_for_orders")
	@patch("log.pick_list_ops._draft_pick_coverage_for_orders")
	@patch("log.pick_list_ops._load_open_pickable_orders")
	def test_creates_for_ready_and_skips_covering_and_closed(self, load, coverage, stock, ensure):
		load.return_value = [
			frappe._dict(name="SO-CLOSED", status="Closed", company="C1"),
			frappe._dict(name="SO-COVER", status="To Deliver", company="C1"),
			frappe._dict(name="SO-READY", status="To Deliver", company="C1"),
			frappe._dict(name="SO-EMPTY", status="To Deliver", company="C1"),
		]
		coverage.return_value = {
			"SO-CLOSED": {"covering": None, "uncovered_items": [{"item_code": "ART-2", "qty": 2}]},
			"SO-COVER": {"covering": "PL-1", "uncovered_items": []},
			"SO-READY": {"covering": None, "uncovered_items": [{"item_code": "ART-2", "qty": 2}]},
			"SO-EMPTY": {"covering": None, "uncovered_items": [{"item_code": "ART-9", "qty": 1}]},
		}
		stock.return_value = {
			"SO-CLOSED": {"has_available_stock": True, "items": [{"item_code": "ART-2", "available": 4}]},
			"SO-COVER": {"has_available_stock": True, "items": [{"item_code": "ART-1", "available": 4}]},
			"SO-READY": {"has_available_stock": True, "items": [{"item_code": "ART-2", "available": 4}]},
			"SO-EMPTY": {"has_available_stock": False, "items": [{"item_code": "ART-9", "available": 0}]},
		}

		ensure_open_order_pick_lists()

		ensure.assert_called_once_with("SO-READY")


class TestAutoPickHooks(unittest.TestCase):
	@patch("log.pick_list_ops.frappe.enqueue")
	@patch("log.pick_list_ops._background_context", return_value=False)
	def test_submit_enqueues_ensure_after_commit(self, _bg, enqueue):
		on_sales_order_submit(frappe._dict(name="SO-1"))
		enqueue.assert_called_once()
		self.assertEqual(enqueue.call_args.args[0], "log.pick_list_ops.ensure_draft_pick_list")
		self.assertEqual(enqueue.call_args.kwargs["so_name"], "SO-1")
		self.assertTrue(enqueue.call_args.kwargs["enqueue_after_commit"])

	@patch("log.pick_list_ops.frappe.enqueue")
	@patch("log.pick_list_ops._background_context", return_value=False)
	def test_stock_inbound_enqueues_open_orders_job(self, _bg, enqueue):
		on_stock_inbound(frappe._dict(name="REC-1"))
		enqueue.assert_called_once()
		self.assertEqual(enqueue.call_args.args[0], "log.pick_list_ops.ensure_open_order_pick_lists")
		self.assertTrue(enqueue.call_args.kwargs["enqueue_after_commit"])


if __name__ == "__main__":
	unittest.main()
