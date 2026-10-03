import json
import unittest
from unittest.mock import patch

import frappe

from log import receipt_ops
from log.api.distribution import RECEIPT_ROLES, RECEIPT_VALIDATION_ROLES, ROLE_PRIORITY
from log.receipt_ops import (
	_default_buying_rate,
	barcode_type_for,
	create_receipt,
	create_receipt_item,
	receipt_blocking_issues,
	receipt_status,
	save_receipt_lines,
	scan_receipt_item,
	submit_receipt,
)


def _raise_throw(msg, *args, **kwargs):
	raise Exception(str(msg))


class _Row(frappe._dict):
	pass


class TestReceiptStatus(unittest.TestCase):
	def test_status_from_docstatus_and_ready_flag(self):
		self.assertEqual(receipt_status(0, 0), "en_cours")
		self.assertEqual(receipt_status(0, 1), "a_valider")
		self.assertEqual(receipt_status(1, 0), "valide")
		self.assertEqual(receipt_status(2, 1), "annule")

	def test_magasinier_role_is_distribution_role(self):
		self.assertIn("Magasinier", RECEIPT_ROLES)
		self.assertNotIn("Magasinier", RECEIPT_VALIDATION_ROLES)
		self.assertIn(({"Magasinier"}, "magasinier"), ROLE_PRIORITY)


class TestBarcodeType(unittest.TestCase):
	def test_valid_ean13_and_ean8(self):
		self.assertEqual(barcode_type_for("3017620422003"), "EAN")
		self.assertEqual(barcode_type_for("96385074"), "EAN")

	def test_valid_upc_a(self):
		self.assertEqual(barcode_type_for("036000291452"), "UPC-A")

	def test_invalid_or_free_codes_have_no_type(self):
		self.assertEqual(barcode_type_for("3017620422004"), "")
		self.assertEqual(barcode_type_for("ABC-123"), "")
		self.assertEqual(barcode_type_for("12345"), "")
		self.assertEqual(barcode_type_for(""), "")


class TestDefaultBuyingRate(unittest.TestCase):
	@patch("log.receipt_ops.frappe.db.get_value", return_value=50)
	@patch("log.receipt_ops.frappe.get_all")
	def test_supplier_price_wins_over_generic_price(self, get_all, _get_value):
		get_all.return_value = [
			frappe._dict(price_list_rate=100, supplier=None, uom="N°"),
			frappe._dict(price_list_rate=90, supplier="SUP-1", uom="N°"),
		]
		self.assertEqual(_default_buying_rate("ART-1", "SUP-1", "Achat standard", "N°"), 90)

	@patch("log.receipt_ops.frappe.db.get_value", return_value=50)
	@patch("log.receipt_ops.frappe.get_all")
	def test_generic_price_ignores_other_uom(self, get_all, _get_value):
		get_all.return_value = [
			frappe._dict(price_list_rate=1200, supplier=None, uom="Carton"),
			frappe._dict(price_list_rate=100, supplier=None, uom=None),
		]
		self.assertEqual(_default_buying_rate("ART-1", "SUP-2", "Achat standard", "N°"), 100)

	@patch("log.receipt_ops.frappe.db.get_value", return_value=50)
	@patch("log.receipt_ops.frappe.get_all", return_value=[])
	def test_falls_back_to_last_purchase_rate(self, _get_all, get_value):
		self.assertEqual(_default_buying_rate("ART-1", "SUP-1", "Achat standard", "N°"), 50)
		get_value.assert_called_once_with("Item", "ART-1", "last_purchase_rate")


@patch("log.receipt_ops._require")
class TestScanReceiptItem(unittest.TestCase):
	@patch("log.receipt_ops._item_exists", return_value=False)
	@patch("log.receipt_ops._scan_barcode", return_value={})
	@patch("log.receipt_ops.frappe.db.get_value", return_value=("SUP-1", "Achat standard"))
	def test_unknown_barcode_is_not_an_error(self, _get_value, _scan, _exists, _require):
		self.assertEqual(scan_receipt_item("PR-1", " 123 "), {"found": False, "barcode": "123"})

	@patch("log.receipt_ops._item_exists", return_value=False)
	@patch("log.receipt_ops._scan_barcode", return_value={"item_code": "DELETED", "barcode": "123"})
	@patch("log.receipt_ops.frappe.db.get_value", return_value=("SUP-1", "Achat standard"))
	def test_cached_scan_of_deleted_item_is_unknown(self, _get_value, _scan, _exists, _require):
		self.assertFalse(scan_receipt_item("PR-1", "123")["found"])

	@patch("log.receipt_ops._scanned_item_payload", return_value={"found": True})
	@patch("log.receipt_ops._item_exists", return_value=True)
	@patch("log.receipt_ops._scan_barcode", return_value={"item_code": "ART-1", "barcode": "CARTON", "uom": "Carton"})
	@patch("log.receipt_ops.frappe.db.get_value", return_value=("SUP-1", "Achat standard"))
	def test_known_barcode_passes_pack_uom(self, _get_value, _scan, _exists, payload, _require):
		scan_receipt_item("PR-1", "CARTON")
		payload.assert_called_once_with("ART-1", "CARTON", "Carton", "SUP-1", "Achat standard")

	@patch("log.receipt_ops.frappe.throw", side_effect=_raise_throw)
	@patch("log.receipt_ops._scan_barcode", return_value={"warehouse": "Magasins - MP"})
	@patch("log.receipt_ops.frappe.db.get_value", return_value=("SUP-1", "Achat standard"))
	def test_warehouse_barcode_raises(self, _get_value, _scan, _throw, _require):
		with self.assertRaises(Exception) as raised:
			scan_receipt_item("PR-1", "WH")
		self.assertIn("entrepôt", str(raised.exception))

	@patch("log.receipt_ops._uom_conversion_factor", create=True)
	@patch("log.receipt_ops._default_buying_rate", return_value=75)
	@patch("log.receipt_ops._barcode_increment", return_value=12)
	@patch("log.receipt_ops.frappe.db.get_value")
	def test_payload_uses_pack_increment_and_rate(self, get_value, _increment, _rate, _factor, _require):
		get_value.return_value = frappe._dict(
			item_name="Lait", stock_uom="N°", disabled=0, has_batch_no=1, has_expiry_date=1, is_stock_item=1
		)
		result = receipt_ops._scanned_item_payload("ART-1", "CARTON", "Carton", "SUP-1", "Achat standard")
		self.assertEqual(result["increment"], 12)
		self.assertEqual(result["rate"], 75)
		self.assertTrue(result["has_batch_no"])


@patch("log.receipt_ops.frappe.throw", side_effect=_raise_throw)
@patch("log.receipt_ops._require")
class TestReceiptWrites(unittest.TestCase):
	@patch("log.receipt_ops.frappe.db.get_single_value", return_value="Yes")
	def test_create_receipt_refuses_when_po_required(self, _settings, _require, _throw):
		with self.assertRaises(Exception) as raised:
			create_receipt(json.dumps({"supplier": "SUP-1"}))
		self.assertIn("Commande d'Achat", str(raised.exception))

	@patch("log.receipt_ops._get_draft")
	def test_save_lines_refuses_purchase_order_receipt(self, get_draft, _require, _throw):
		get_draft.return_value = frappe._dict(items=[_Row(purchase_order="PO-1")])
		with self.assertRaises(Exception) as raised:
			save_receipt_lines("PR-1", "[]")
		self.assertIn("commande d'achat", str(raised.exception))

	@patch("log.receipt_ops.frappe.db.exists", return_value=True)
	@patch("log.receipt_ops.frappe.get_doc")
	def test_submitted_receipt_is_not_editable(self, get_doc, _exists, _require, _throw):
		get_doc.return_value = frappe._dict(docstatus=1, items=[])
		with self.assertRaises(Exception) as raised:
			save_receipt_lines("PR-1", "[]")
		self.assertIn("déjà validée", str(raised.exception))

	@patch("log.receipt_ops._save_draft")
	@patch("log.receipt_ops._has_ready_field", return_value=True)
	@patch("log.receipt_ops._ensure_batch")
	@patch("log.receipt_ops._item_flags")
	@patch("log.receipt_ops._get_draft")
	@patch("log.receipt_ops.serialize_receipt", return_value={})
	def test_save_lines_rebuilds_items_and_creates_batches(
		self, _serialize, get_draft, item_flags, ensure_batch, _ready, save_draft, _require, _throw
	):
		doc = frappe.get_doc({"doctype": "Purchase Receipt", "set_warehouse": "Magasins - MP"})
		get_draft.return_value = doc
		item_flags.return_value = {
			"ART-1": frappe._dict(stock_uom="N°", has_batch_no=1, has_expiry_date=1),
			"ART-2": frappe._dict(stock_uom="N°", has_batch_no=0, has_expiry_date=0),
		}
		lines = [
			{"item_code": "ART-1", "qty": 4, "rate": 10, "batch_no": "L1", "expiry_date": "2028-01-31"},
			{"item_code": "ART-2", "qty": 2, "rate": 5},
			{"item_code": "ART-2", "qty": 0, "rate": 5},
		]
		save_receipt_lines("PR-1", json.dumps(lines))

		self.assertEqual(len(doc.items), 2)
		self.assertEqual(doc.items[0].batch_no, "L1")
		self.assertEqual(doc.items[0].use_serial_batch_fields, 1)
		self.assertEqual(doc.items[0].warehouse, "Magasins - MP")
		self.assertEqual(doc.items[1].received_qty, 2)
		self.assertEqual(doc.custom_saisie_terminee, 0)
		ensure_batch.assert_called_once_with("ART-1", "L1", "2028-01-31")
		save_draft.assert_called_once_with(doc)

	@patch("log.receipt_ops._item_flags", return_value={"ART-2": frappe._dict(has_batch_no=0)})
	@patch("log.receipt_ops._get_draft")
	def test_save_lines_refuses_batch_on_non_batch_item(self, get_draft, _flags, _require, _throw):
		get_draft.return_value = frappe._dict(items=[], set_warehouse="W", set=lambda *a: None)
		with self.assertRaises(Exception) as raised:
			save_receipt_lines("PR-1", json.dumps([{"item_code": "ART-2", "qty": 1, "batch_no": "L1"}]))
		self.assertIn("pas géré par lot", str(raised.exception))

	@patch("log.receipt_ops.receipt_blocking_issues", return_value=["Lait : numéro de lot manquant."])
	@patch("log.receipt_ops._get_draft")
	def test_submit_blocks_on_missing_batch(self, get_draft, _issues, _require, _throw):
		get_draft.return_value = frappe._dict(items=[])
		with self.assertRaises(Exception) as raised:
			submit_receipt("PR-1")
		self.assertIn("lot manquant", str(raised.exception))

	def test_submit_requires_validation_role(self, require, _throw):
		require.side_effect = Exception("Vous n'avez pas accès à cette opération.")
		with self.assertRaises(Exception):
			submit_receipt("PR-1")
		require.assert_called_once_with(RECEIPT_VALIDATION_ROLES)


class TestBlockingIssues(unittest.TestCase):
	@patch("log.receipt_ops._batch_expiry", return_value={"L1": None})
	@patch("log.receipt_ops._item_flags")
	def test_reports_missing_batch_and_expiry(self, item_flags, _expiry):
		item_flags.return_value = {
			"ART-1": {"has_batch_no": 1, "has_expiry_date": 1},
			"ART-2": {"has_batch_no": 1, "has_expiry_date": 1},
			"ART-3": {"has_batch_no": 0, "has_expiry_date": 0},
		}
		doc = frappe._dict(
			items=[
				_Row(item_code="ART-1", item_name="Lait", qty=2, batch_no=None),
				_Row(item_code="ART-2", item_name="Crème", qty=1, batch_no="L1"),
				_Row(item_code="ART-3", item_name="Gaze", qty=3, batch_no=None),
			]
		)
		issues = receipt_blocking_issues(doc)
		self.assertEqual(len(issues), 2)
		self.assertIn("Lait", issues[0])
		self.assertIn("péremption", issues[1])

	def test_empty_receipt_is_blocking(self):
		self.assertEqual(len(receipt_blocking_issues(frappe._dict(items=[]))), 1)


@patch("log.receipt_ops.frappe.throw", side_effect=_raise_throw)
@patch("log.receipt_ops._require")
class TestCreateReceiptItem(unittest.TestCase):
	@patch("log.catalog_ops.frappe.db.exists", return_value=False)
	@patch("log.catalog_ops._barcode_owner", return_value="ART-9")
	def test_duplicate_barcode_is_refused_in_french(self, _owner, _exists, _require, _throw):
		with self.assertRaises(Exception) as raised:
			create_receipt_item(json.dumps({"barcode": "3017620422003", "item_name": "Lait"}))
		self.assertIn("déjà utilisé par l'article ART-9", str(raised.exception))

	@patch("log.catalog_ops.frappe.db.exists", return_value=True)
	def test_existing_item_code_is_refused(self, _exists, _require, _throw):
		with self.assertRaises(Exception) as raised:
			create_receipt_item(json.dumps({"barcode": "123", "item_name": "Lait"}))
		self.assertIn("existe déjà", str(raised.exception))

	def test_name_is_required(self, _require, _throw):
		with self.assertRaises(Exception) as raised:
			create_receipt_item(json.dumps({"barcode": "123"}))
		self.assertIn("désignation", str(raised.exception))


if __name__ == "__main__":
	unittest.main()
