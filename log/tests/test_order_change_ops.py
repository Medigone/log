import json
import unittest
from unittest.mock import Mock, patch

import frappe

from log.order_change_ops import (
	_changed_fields,
	_rebuild_draft_pick_list,
	item_delta,
	pick_lists_drift_from_order,
	sync_pick_lists_after_order_change,
	trans_items_change_sales_order,
	update_child_qty_rate,
)


def _item(**values):
	row = frappe._dict(
		name=values.pop("name", "SOI-1"),
		item_code="ART-1",
		qty=2,
		uom="Unité",
		warehouse="DEPOT",
		batch_no=None,
		picked_qty=0,
		delivered_qty=0,
		conversion_factor=1,
		delivered_by_supplier=0,
	)
	row.update(values)
	return row


def _so(items=None, **values):
	doc = frappe._dict(name="SO-1", items=items or [_item()], grand_total=100, custom_distribution_revision=0)
	doc.update(values)
	return doc


class FakePickList:
	def __init__(self, name="PL-1", docstatus=0, locations=None):
		self.name = name
		self.docstatus = docstatus
		self.locations = list(locations or [])
		self.custom_order_changed = 0
		self.custom_order_changed_reason = None
		self.saved = False

	def set(self, field, value):
		setattr(self, field, value)

	def append(self, field, row):
		getattr(self, field).append(frappe._dict(row))

	def save(self, ignore_permissions=True):
		self.saved = True

	def get(self, key, default=None):
		return getattr(self, key, default)


class TestItemDeltaAndUpdateItems(unittest.TestCase):
	def test_item_delta_detects_qty_and_removed_line(self):
		before = _so(items=[_item(name="SOI-1", qty=2), _item(name="SOI-2", item_code="ART-2", qty=1)])
		after_qty = _so(items=[_item(name="SOI-1", qty=1), _item(name="SOI-2", item_code="ART-2", qty=1)])
		after_removed = _so(items=[_item(name="SOI-1", qty=2)])
		self.assertTrue(item_delta(before, after_qty))
		self.assertTrue(item_delta(before, after_removed))
		self.assertFalse(item_delta(before, before))

	def test_changed_fields_misses_items_after_reload_without_flag(self):
		items = [_item(qty=1)]
		doc = _so(items=items, grand_total=80)
		doc.get_doc_before_save = lambda: _so(items=items, grand_total=100)
		frappe.flags.sales_order_items_changed = False
		changed = _changed_fields(doc)
		self.assertNotIn("items", changed)
		self.assertIn("grand_total", changed)

	def test_flag_injects_items_when_fingerprint_is_blind(self):
		items = [_item(qty=1)]
		doc = _so(items=items, grand_total=80)
		doc.get_doc_before_save = lambda: _so(items=items, grand_total=100)
		frappe.flags.sales_order_items_changed = True
		try:
			self.assertIn("items", _changed_fields(doc))
		finally:
			frappe.flags.sales_order_items_changed = False

	@patch("log.order_change_ops.frappe.get_doc")
	def test_trans_items_detects_qty_change_and_ignores_rate(self, get_doc):
		get_doc.return_value = _so(items=[_item(name="SOI-1", qty=2)])
		changed = json.dumps(
			[{"docname": "SOI-1", "item_code": "ART-1", "qty": 1, "uom": "Unité", "warehouse": "DEPOT"}]
		)
		same = json.dumps(
			[{"docname": "SOI-1", "item_code": "ART-1", "qty": 2, "rate": 99, "uom": "Unité", "warehouse": "DEPOT"}]
		)
		self.assertTrue(trans_items_change_sales_order("SO-1", changed))
		self.assertFalse(trans_items_change_sales_order("SO-1", same))

	@patch("log.order_change_ops.sync_pick_lists_after_order_change")
	@patch("erpnext.controllers.accounts_controller.update_child_qty_rate")
	@patch("log.order_change_ops.frappe.get_doc")
	def test_wrapper_syncs_when_update_items_changes_qty(self, get_doc, original, sync):
		get_doc.return_value = _so(items=[_item(name="SOI-1", qty=2)])
		original.return_value = None
		trans = json.dumps(
			[{"docname": "SOI-1", "item_code": "ART-1", "qty": 1, "uom": "Unité", "warehouse": "DEPOT"}]
		)
		update_child_qty_rate("Sales Order", trans, "SO-1")
		original.assert_called_once()
		sync.assert_called_once()
		self.assertTrue(frappe.flags.sales_order_items_changed)

	@patch("log.order_change_ops.sync_pick_lists_after_order_change")
	@patch("erpnext.controllers.accounts_controller.update_child_qty_rate")
	@patch("log.order_change_ops.frappe.get_doc")
	def test_wrapper_skips_sync_for_rate_only(self, get_doc, original, sync):
		get_doc.return_value = _so(items=[_item(name="SOI-1", qty=2)])
		trans = json.dumps(
			[{"docname": "SOI-1", "item_code": "ART-1", "qty": 2, "rate": 15, "uom": "Unité", "warehouse": "DEPOT"}]
		)
		update_child_qty_rate("Sales Order", trans, "SO-1")
		sync.assert_not_called()


class TestPickListDriftAndSync(unittest.TestCase):
	def setUp(self):
		frappe.flags.pick_list_sync_done_for = set()
		frappe.flags.in_pick_list_item_sync = False
		frappe.flags.sales_order_items_changed = False

	@patch("log.pick_list_ops._required_pick_qty", side_effect=lambda item: float(item.get("qty") or 0))
	@patch("log.order_change_ops.frappe.get_all")
	@patch("log.order_change_ops._pick_lists_for_order", return_value=["PL-1"])
	def test_drift_when_pick_list_qty_exceeds_remaining(self, _names, get_all, _required):
		so = _so(items=[_item(name="SOI-1", qty=1)])
		get_all.side_effect = [
			["PL-1"],
			[frappe._dict(sales_order_item="SOI-1", qty=2)],
		]
		self.assertTrue(pick_lists_drift_from_order(so))

	@patch("log.pick_list_ops._required_pick_qty", side_effect=lambda item: float(item.get("qty") or 0))
	@patch("log.order_change_ops.frappe.get_all")
	@patch("log.order_change_ops._pick_lists_for_order", return_value=["PL-1"])
	def test_no_drift_when_pick_list_matches_remaining(self, _names, get_all, _required):
		so = _so(items=[_item(name="SOI-1", qty=2)])
		get_all.side_effect = [
			["PL-1"],
			[frappe._dict(sales_order_item="SOI-1", qty=2)],
		]
		self.assertFalse(pick_lists_drift_from_order(so))

	@patch("log.order_change_ops._doctype_has_field", return_value=True)
	@patch("log.order_change_ops._publish_pick_list_changed")
	@patch("log.order_change_ops._mark_sales_order_modified")
	@patch("erpnext.selling.doctype.sales_order.sales_order.create_pick_list")
	@patch("log.pick_list_ops.unreserve_sales_order_stock")
	@patch("log.order_change_ops._pick_list_delivery_note_names", return_value=[])
	@patch("log.order_change_ops._any_delivery_note_departed", return_value=False)
	@patch("log.order_change_ops.frappe.db.exists", return_value=True)
	@patch("log.order_change_ops.frappe.get_doc")
	@patch("log.order_change_ops._pick_lists_for_order", return_value=["PL-1"])
	def test_rebuild_drops_removed_line_and_caps_qty(
		self, _names, get_doc, _exists, _departed, _dns, unreserve, create_pl, mark, _publish, _has_field
	):
		draft = FakePickList(
			locations=[
				frappe._dict(
					sales_order="SO-1",
					sales_order_item="SOI-1",
					item_code="ART-1",
					warehouse="DEPOT",
					qty=2,
					stock_qty=2,
					picked_qty=0,
				),
				frappe._dict(
					sales_order="SO-1",
					sales_order_item="SOI-2",
					item_code="ART-2",
					warehouse="DEPOT",
					qty=1,
					stock_qty=1,
					picked_qty=0,
				),
			]
		)
		create_pl.return_value = FakePickList(
			locations=[
				frappe._dict(
					sales_order="SO-1",
					sales_order_item="SOI-1",
					item_code="ART-1",
					warehouse="DEPOT",
					qty=1,
					stock_qty=1,
					picked_qty=0,
				)
			]
		)
		get_doc.return_value = draft

		sync_pick_lists_after_order_change(_so(items=[_item(name="SOI-1", qty=1)]), reason="test")

		self.assertEqual([loc.item_code for loc in draft.locations], ["ART-1"])
		self.assertEqual(draft.locations[0].qty, 1)
		self.assertTrue(draft.saved)
		self.assertEqual(draft.custom_order_changed, 1)
		mark.assert_called_once()
		unreserve.assert_called_once_with("SO-1")

	@patch("log.order_change_ops._doctype_has_field", return_value=True)
	@patch("log.order_change_ops._publish_pick_list_changed")
	@patch("log.order_change_ops._mark_sales_order_modified")
	@patch("erpnext.selling.doctype.sales_order.sales_order.create_pick_list")
	@patch("log.pick_list_ops.unreserve_sales_order_stock")
	@patch("log.order_change_ops._pick_list_delivery_note_names", return_value=[])
	@patch("log.order_change_ops._any_delivery_note_departed", return_value=False)
	@patch("log.order_change_ops.frappe.db.exists", return_value=True)
	@patch("log.order_change_ops.frappe.get_doc")
	@patch("log.order_change_ops._pick_lists_for_order", return_value=["PL-1"])
	def test_rebuild_adds_new_item_when_stock_allocated(
		self, _names, get_doc, _exists, _departed, _dns, _unreserve, create_pl, mark, _publish, _has_field
	):
		draft = FakePickList(
			locations=[
				frappe._dict(
					sales_order="SO-1",
					sales_order_item="SOI-1",
					item_code="ART-1",
					warehouse="DEPOT",
					qty=2,
					stock_qty=2,
					picked_qty=0,
				)
			]
		)
		create_pl.return_value = FakePickList(
			locations=[
				frappe._dict(
					sales_order="SO-1",
					sales_order_item="SOI-1",
					item_code="ART-1",
					warehouse="DEPOT",
					qty=2,
					stock_qty=2,
					picked_qty=0,
				),
				frappe._dict(
					sales_order="SO-1",
					sales_order_item="SOI-3",
					item_code="ART-3",
					warehouse="DEPOT",
					qty=4,
					stock_qty=4,
					picked_qty=0,
				),
			]
		)
		get_doc.return_value = draft

		sync_pick_lists_after_order_change(
			_so(items=[_item(name="SOI-1", qty=2), _item(name="SOI-3", item_code="ART-3", qty=4)])
		)

		self.assertEqual([loc.item_code for loc in draft.locations], ["ART-1", "ART-3"])
		self.assertTrue(draft.saved)
		mark.assert_called_once()

	@patch("log.order_change_ops._doctype_has_field", return_value=True)
	@patch("log.order_change_ops._publish_pick_list_changed")
	@patch("log.order_change_ops._mark_sales_order_modified")
	@patch("erpnext.selling.doctype.sales_order.sales_order.create_pick_list")
	@patch("log.order_change_ops._set_pick_list_changed")
	@patch("log.order_change_ops._pick_list_delivery_note_names", return_value=[])
	@patch("log.order_change_ops._any_delivery_note_departed", return_value=False)
	@patch("log.order_change_ops.frappe.db.exists", return_value=True)
	@patch("log.order_change_ops.frappe.get_doc")
	@patch("log.order_change_ops._pick_lists_for_order", return_value=["PL-SUB"])
	def test_submitted_pick_list_is_not_rewritten(
		self, _names, get_doc, _exists, _departed, _dns, mark_stale, create_pl, mark, _publish, _has_field
	):
		submitted = FakePickList(
			name="PL-SUB",
			docstatus=1,
			locations=[
				frappe._dict(
					sales_order="SO-1",
					sales_order_item="SOI-2",
					item_code="ART-2",
					warehouse="DEPOT",
					qty=1,
					stock_qty=1,
				)
			],
		)
		get_doc.return_value = submitted

		sync_pick_lists_after_order_change(_so(items=[_item(name="SOI-1", qty=2)]))

		create_pl.assert_not_called()
		self.assertFalse(submitted.saved)
		mark_stale.assert_called_once()
		mark.assert_called_once()

	@patch("log.order_change_ops.frappe.delete_doc")
	@patch("log.pick_list_ops.unreserve_sales_order_stock")
	@patch("erpnext.selling.doctype.sales_order.sales_order.create_pick_list")
	def test_empty_rebuild_deletes_draft(self, create_pl, _unreserve, delete_doc):
		draft = FakePickList(
			locations=[frappe._dict(sales_order="SO-1", sales_order_item="SOI-1", item_code="ART-1")]
		)
		create_pl.return_value = FakePickList(locations=[])
		self.assertIsNone(_rebuild_draft_pick_list(draft, _so(items=[]), "test"))
		delete_doc.assert_called_once_with("Pick List", "PL-1", ignore_permissions=True, force=True)


class TestPreparationModificationAck(unittest.TestCase):
	def test_pending_notice_does_not_clear_flags(self):
		from log.order_change_ops import acknowledge_order_changed, pending_order_change_notice

		doc = FakePickList()
		doc.custom_order_changed = 1
		doc.custom_order_changed_reason = "Quantité changée"
		with patch("log.order_change_ops.clear_order_changed_status") as clear:
			notice = pending_order_change_notice([doc])
			compat = acknowledge_order_changed([doc])
			clear.assert_not_called()
		self.assertEqual(notice, "Quantité changée")
		self.assertEqual(compat, "Quantité changée")

	@patch("log.order_change_ops.frappe.throw", side_effect=Exception("blocked"))
	@patch("log.order_change_ops.sales_order_modification_pending", return_value=True)
	def test_assert_blocks_pending_orders(self, _pending, _throw):
		from log.order_change_ops import assert_preparation_modification_accepted

		with self.assertRaises(Exception) as raised:
			assert_preparation_modification_accepted(["SO-1"])
		self.assertIn("blocked", str(raised.exception))
		_throw.assert_called_once()

	@patch("log.order_change_ops.sales_order_modification_pending", return_value=False)
	def test_assert_allows_when_not_pending(self, _pending):
		from log.order_change_ops import assert_preparation_modification_accepted

		assert_preparation_modification_accepted(["SO-1"])

	@patch("log.order_change_ops._doctype_has_field", return_value=True)
	@patch("log.order_change_ops.clear_order_changed_status")
	@patch("log.order_change_ops._pick_lists_for_order", return_value=["PL-1"])
	@patch("log.pick_list_ops.serialize_sales_order_pick_detail", return_value={"name": "SO-1"})
	@patch("log.pick_list_ops._require_preparation_role")
	@patch("log.order_change_ops.get_fullname", return_value="Préparateur X")
	@patch("log.order_change_ops.now_datetime", return_value="2026-09-02 16:40:00")
	@patch("log.order_change_ops.frappe.db.exists", return_value=True)
	@patch("log.order_change_ops.frappe.db.get_value", return_value="Modifiée")
	@patch("log.order_change_ops.frappe.db.set_value")
	@patch("log.order_change_ops.frappe.get_doc")
	def test_acknowledge_records_user_datetime_and_clears(
		self, get_doc, set_value, _get_value, _exists, _now, _fullname, _role, _serialize, _lists, clear, _has
	):
		from log.order_change_ops import acknowledge_preparation_modification

		so = Mock()
		get_doc.return_value = so
		result = acknowledge_preparation_modification("SO-1")

		set_value.assert_any_call(
			"Sales Order",
			"SO-1",
			{
				"custom_preparation_accepte_par": frappe.session.user,
				"custom_preparation_date_acceptation": "2026-09-02 16:40:00",
			},
			update_modified=False,
		)
		so.add_comment.assert_called_once()
		self.assertIn("pris connaissance", so.add_comment.call_args[0][1])
		clear.assert_called()
		self.assertEqual(result["name"], "SO-1")

	@patch("log.order_change_ops.frappe.throw", side_effect=Exception("no pending"))
	@patch("log.order_change_ops._doctype_has_field", return_value=True)
	@patch("log.pick_list_ops._require_preparation_role")
	@patch("log.order_change_ops.frappe.db.exists", return_value=True)
	@patch("log.order_change_ops.frappe.db.get_value", return_value="")
	def test_acknowledge_refuses_when_not_modified(self, _get_value, _exists, _role, _has, _throw):
		from log.order_change_ops import acknowledge_preparation_modification

		with self.assertRaises(Exception):
			acknowledge_preparation_modification("SO-1")

