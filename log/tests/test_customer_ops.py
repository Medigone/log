import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import frappe

from log import customer_ops
from log.api import customer_portal_admin
from log.api.distribution import ORDER_ROLES


def _raise_throw(msg, *args, **kwargs):
	raise Exception(str(msg))


class _Doc(frappe._dict):
	"""Customer minimal : champs présents, `append`/`set` comme un Document."""

	meta = SimpleNamespace(has_field=lambda _field: True)

	def is_new(self):
		return False

	def append(self, table, row):
		self.setdefault(table, []).append(frappe._dict(row))

	def set(self, key, value):
		self[key] = value


@patch("log.customer_ops.frappe.throw", side_effect=_raise_throw)
class TestRoleGuards(unittest.TestCase):
	ENDPOINTS = (
		("get_customer_options", ()),
		("list_customers", ()),
		("export_customers", ()),
		("get_customer", ("CUST-1",)),
		("update_customer", ("{}",)),
		("create_customer", ("{}",)),
		("set_customer_file", ("CUST-1", "rc")),
		("bulk_update_customers", ("{}",)),
		("save_contact", ("{}",)),
		("delete_contact", ("C-1", "CUST-1")),
		("save_address", ("{}",)),
		("delete_address", ("A-1", "CUST-1")),
		("get_customer_activity", ("CUST-1",)),
		("get_portal_access", ("CUST-1",)),
		("create_portal_user", ("{}",)),
	)

	def test_every_endpoint_requires_order_roles(self, _throw):
		for name, args in self.ENDPOINTS:
			with (
				self.subTest(endpoint=name),
				patch(
					"log.customer_ops._require",
					side_effect=Exception("Vous n'avez pas accès à cette opération."),
				) as require,
			):
				with self.assertRaises(Exception):
					getattr(customer_ops, name)(*args)
				require.assert_called_once_with(ORDER_ROLES)


@patch("log.customer_ops.frappe.throw", side_effect=_raise_throw)
class TestApplyChanges(unittest.TestCase):
	def test_unknown_fields_are_rejected(self, _throw):
		with self.assertRaises(Exception) as raised:
			customer_ops.apply_customer_changes(_Doc(name="CUST-1"), {"owner": "x", "naming_series": "y"})
		self.assertIn("naming_series", str(raised.exception))
		self.assertIn("owner", str(raised.exception))

	@patch("log.order_entry_ops.frappe.throw", side_effect=_raise_throw)
	def test_phone_is_mirrored_on_mobile(self, _oe_throw, _throw):
		doc = _Doc(name="CUST-1")
		customer_ops.apply_customer_changes(doc, {"phone": "0550 12 34 56", "key_account": True})
		self.assertEqual(doc["custom_téléphone"], "0550123456")
		self.assertEqual(doc.mobile_no, "0550123456")
		self.assertEqual(doc.custom_grand_compte, 1)

	def test_invalid_status_is_rejected(self, _throw):
		with self.assertRaises(Exception) as raised:
			customer_ops.apply_customer_changes(_Doc(name="CUST-1"), {"status": "Inconnu"})
		self.assertIn("Statut client invalide", str(raised.exception))

	@patch("log.customer_ops.frappe.db.get_value", return_value="CUST-2")
	def test_rename_to_existing_name_is_rejected(self, _get_value, _throw):
		with self.assertRaises(Exception) as raised:
			customer_ops.apply_customer_changes(_Doc(name="CUST-1"), {"customer_name": "Pharmacie X"})
		self.assertIn("existe déjà", str(raised.exception))

	@patch("log.customer_ops.frappe.db.get_value", return_value="CUST-1")
	def test_keeping_own_name_is_allowed(self, _get_value, _throw):
		doc = _Doc(name="CUST-1")
		customer_ops.apply_customer_changes(doc, {"customer_name": "PHARMACIE X"})
		self.assertEqual(doc.customer_name, "PHARMACIE X")

	@patch("log.customer_ops.frappe.db.exists", return_value=True)
	def test_credit_limits_replace_rows(self, _exists, _throw):
		doc = _Doc(name="CUST-1", credit_limits=[frappe._dict(company="OLD", credit_limit=5)])
		customer_ops.apply_customer_changes(
			doc,
			{
				"credit_limits": [
					{"company": "Medigo", "credit_limit": "150000", "bypass_credit_limit_check": True}
				]
			},
		)
		self.assertEqual(
			doc.credit_limits,
			[{"company": "Medigo", "credit_limit": 150000.0, "bypass_credit_limit_check": 1}],
		)

	@patch("log.customer_ops.frappe.db.exists", return_value=True)
	def test_credit_limits_reject_duplicates_and_negatives(self, _exists, _throw):
		with self.assertRaises(Exception):
			customer_ops.apply_customer_changes(
				_Doc(name="CUST-1"),
				{"credit_limits": [{"company": "A", "credit_limit": 1}, {"company": "A", "credit_limit": 2}]},
			)
		with self.assertRaises(Exception):
			customer_ops.apply_customer_changes(
				_Doc(name="CUST-1"), {"credit_limits": [{"company": "A", "credit_limit": -1}]}
			)

	@patch("log.customer_ops.now_datetime", return_value="2026-10-04 10:00:00")
	@patch("log.customer_ops.frappe.session", SimpleNamespace(user="commercial@example.com"))
	def test_gps_is_normalised_with_audit(self, _now, _throw):
		doc = _Doc(name="CUST-1", custom_gps=None, custom_gps_source_bl="DN-1")
		customer_ops.apply_customer_changes(doc, {"gps": "35.69, -0.63"})
		self.assertEqual(doc.custom_gps, "35.69000000,-0.63000000")
		self.assertEqual(doc.custom_gps_capture_user, "commercial@example.com")
		self.assertIsNone(doc.custom_gps_source_bl)

	def test_invalid_gps_is_rejected_and_empty_clears(self, _throw):
		with self.assertRaises(Exception):
			customer_ops.apply_customer_changes(_Doc(name="CUST-1"), {"gps": "pas de gps"})
		doc = _Doc(name="CUST-1", custom_gps="35,0")
		customer_ops.apply_customer_changes(doc, {"gps": ""})
		self.assertIsNone(doc.custom_gps)


@patch("log.customer_ops.frappe.throw", side_effect=_raise_throw)
@patch("log.customer_ops._require")
class TestBulkAndFilters(unittest.TestCase):
	def test_bulk_rejects_fields_outside_whitelist(self, _require, _throw):
		with self.assertRaises(Exception):
			customer_ops.bulk_update_customers(
				json.dumps({"names": ["CUST-1"], "changes": {"customer_name": "X"}})
			)

	@patch("log.customer_ops.frappe.clear_last_message")
	@patch("log.customer_ops._save")
	@patch("log.customer_ops._get_customer")
	def test_bulk_reports_partial_failures(self, get_customer, save, _clear, _require, _throw):
		docs = {"CUST-1": _Doc(name="CUST-1"), "CUST-2": _Doc(name="CUST-2")}
		get_customer.side_effect = lambda name: docs[name]
		save.side_effect = lambda doc: (
			(_ for _ in ()).throw(Exception("Plafond dépassé")) if doc.name == "CUST-2" else None
		)
		result = customer_ops.bulk_update_customers(
			json.dumps({"names": ["CUST-1", "CUST-2"], "changes": {"status": "Dormant"}})
		)
		self.assertEqual(result["updated"], ["CUST-1"])
		self.assertEqual(result["errors"], [{"name": "CUST-2", "error": "Plafond dépassé"}])
		self.assertEqual(docs["CUST-1"].custom_status, "Dormant")

	def test_list_filter_builds_status_and_gps_clauses(self, _require, _throw):
		clauses, values = customer_ops._list_where("", "", "", "Prospect")
		self.assertIn("c.custom_status = %(status)s", clauses)
		self.assertEqual(values["status"], "Prospect")
		clauses, _values = customer_ops._list_where("", "", "", "sans_gps")
		self.assertIn("ifnull(c.custom_gps, '') = ''", clauses)
		clauses, _values = customer_ops._list_where("", "", "", "desactives")
		self.assertEqual(clauses, ["c.disabled = 1"])
		with self.assertRaises(Exception):
			customer_ops._list_where("", "", "", "n'importe quoi")


class TestPortalAccessBypass(unittest.TestCase):
	def _fake(self, customer):
		return SimpleNamespace(
			session=SimpleNamespace(user="commercial@example.com"),
			db=SimpleNamespace(exists=lambda *_args: True),
			get_doc=lambda *_args: customer,
			has_permission=lambda *_args, **_kwargs: False,
			throw=lambda message, exc=frappe.ValidationError, **_kw: (_ for _ in ()).throw(exc(message)),
			PermissionError=frappe.PermissionError,
			DoesNotExistError=frappe.DoesNotExistError,
		)

	def test_role_gated_caller_skips_desk_permission(self):
		customer = SimpleNamespace(
			name="CUST-1", disabled=0, meta=SimpleNamespace(has_field=lambda _f: True), get=lambda _f: "Actif"
		)
		with (
			patch.object(customer_portal_admin, "frappe", self._fake(customer)),
			patch.object(customer_portal_admin, "_", lambda value: value),
		):
			self.assertIs(
				customer_portal_admin._customer_for_access("CUST-1", check_permission=False), customer
			)
			with self.assertRaises(frappe.PermissionError):
				customer_portal_admin._customer_for_access("CUST-1")

	def test_read_only_setup_accepts_prospects(self):
		customer = SimpleNamespace(
			name="CUST-1",
			disabled=0,
			meta=SimpleNamespace(has_field=lambda _f: True),
			get=lambda _f: "Prospect",
		)
		with (
			patch.object(customer_portal_admin, "frappe", self._fake(customer)),
			patch.object(customer_portal_admin, "_", lambda value: value),
		):
			self.assertIs(
				customer_portal_admin._customer_for_access(
					"CUST-1", check_permission=False, require_active=False
				),
				customer,
			)
			with self.assertRaises(frappe.ValidationError):
				customer_portal_admin._customer_for_access("CUST-1", check_permission=False)


if __name__ == "__main__":
	unittest.main()
