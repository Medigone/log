import string
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import frappe

from log.api import customer_portal_admin


def _raise(message, exc=frappe.ValidationError, **_kwargs):
	raise exc(message)


class TestCustomerPortalAdminSecurity(unittest.TestCase):
	def test_customer_requires_an_authenticated_editor(self):
		customer = SimpleNamespace(
			name="CUST-1",
			disabled=0,
			meta=SimpleNamespace(has_field=lambda _field: True),
			get=lambda field: "Actif" if field == "custom_status" else None,
		)
		fake = SimpleNamespace(
			session=SimpleNamespace(user="editor@example.com"),
			db=SimpleNamespace(exists=lambda *_args: True),
			get_doc=lambda *_args: customer,
			has_permission=lambda *_args, **_kwargs: False,
			throw=_raise,
			PermissionError=frappe.PermissionError,
			DoesNotExistError=frappe.DoesNotExistError,
		)
		with patch.object(customer_portal_admin, "frappe", fake), patch.object(
			customer_portal_admin, "_", lambda value: value
		), self.assertRaises(frappe.PermissionError):
			customer_portal_admin._customer_for_access("CUST-1")

	def test_inactive_customer_is_rejected(self):
		customer = SimpleNamespace(
			name="CUST-1",
			disabled=1,
			meta=SimpleNamespace(has_field=lambda _field: True),
			get=lambda _field: "Actif",
		)
		fake = SimpleNamespace(
			session=SimpleNamespace(user="editor@example.com"),
			db=SimpleNamespace(exists=lambda *_args: True),
			get_doc=lambda *_args: customer,
			has_permission=lambda *_args, **_kwargs: True,
			throw=_raise,
			PermissionError=frappe.PermissionError,
			DoesNotExistError=frappe.DoesNotExistError,
		)
		with patch.object(customer_portal_admin, "frappe", fake), patch.object(
			customer_portal_admin, "_", lambda value: value
		), self.assertRaises(frappe.ValidationError):
			customer_portal_admin._customer_for_access("CUST-1")

	def test_temporary_password_has_all_required_character_classes(self):
		password = customer_portal_admin._generate_temporary_password()
		self.assertGreaterEqual(len(password), 18)
		self.assertTrue(any(character in string.ascii_uppercase for character in password))
		self.assertTrue(any(character in string.ascii_lowercase for character in password))
		self.assertTrue(any(character in string.digits for character in password))
		self.assertTrue(any(character in "!@#$%&*+-_=?.." for character in password))

	def test_new_account_type_role_and_rotation_are_imposed_by_server(self):
		customer = SimpleNamespace(name="CUST-1")
		contact = SimpleNamespace(name="CONTACT-1", first_name="Alice", last_name="Client", full_name="Alice Client", user=None)
		created_user = SimpleNamespace(name="alice@example.com", flags=SimpleNamespace(), insert=Mock())
		user_values = {}

		def get_doc(value, *_args):
			if isinstance(value, dict) and value.get("doctype") == "User":
				user_values.update(value)
				return created_user
			raise AssertionError(value)

		with patch.object(customer_portal_admin, "_customer_for_access", return_value=customer), patch.object(
			customer_portal_admin, "_linked_contact", return_value=(contact, "alice@example.com")
		), patch.object(customer_portal_admin.frappe.db, "get_value", return_value=None), patch.object(
			customer_portal_admin.frappe, "get_doc", side_effect=get_doc
		), patch.object(customer_portal_admin, "_generate_temporary_password", return_value="StrongTemporary#1234"), patch.object(
			customer_portal_admin, "_link_contact"
		), patch.object(customer_portal_admin, "_ensure_portal_link"):
			result = customer_portal_admin.create_customer_portal_user(
				{
					"customer": "CUST-1",
					"contact": "CONTACT-1",
					"role": "System Manager",
					"user_type": "System User",
				}
			)

		self.assertEqual(user_values["user_type"], "Website User")
		self.assertEqual(user_values["roles"], [{"role": "Customer"}])
		self.assertEqual(user_values["send_welcome_email"], 0)
		self.assertEqual(user_values[customer_portal_admin.PASSWORD_CHANGE_FIELD], 1)
		self.assertEqual(result["temporaryPassword"], "StrongTemporary#1234")
		created_user.insert.assert_called_once_with(ignore_permissions=True)

	def test_existing_account_for_same_customer_is_idempotent_without_password_reset(self):
		customer = SimpleNamespace(name="CUST-1")
		contact = SimpleNamespace(name="CONTACT-1", first_name="Alice", last_name="", full_name="Alice", user="alice@example.com")
		user = SimpleNamespace(name="alice@example.com", enabled=1, user_type="Website User")
		with patch.object(customer_portal_admin, "_customer_for_access", return_value=customer), patch.object(
			customer_portal_admin, "_linked_contact", return_value=(contact, "alice@example.com")
		), patch.object(customer_portal_admin.frappe.db, "get_value", return_value="alice@example.com"), patch.object(
			customer_portal_admin.frappe, "get_doc", return_value=user
		), patch.object(customer_portal_admin, "_customer_parents", return_value=["CUST-1"]), patch.object(
			customer_portal_admin, "_safe_access_result", return_value={"status": "already_linked", "temporaryPassword": None}
		), patch.object(customer_portal_admin, "_generate_temporary_password") as generate:
			result = customer_portal_admin.create_customer_portal_user(
				{"customer": "CUST-1", "contact": "CONTACT-1"}
			)
		self.assertEqual(result["status"], "already_linked")
		self.assertIsNone(result["temporaryPassword"])
		generate.assert_not_called()

	def test_existing_account_for_another_customer_is_rejected(self):
		customer = SimpleNamespace(name="CUST-1")
		contact = SimpleNamespace(name="CONTACT-1", first_name="Alice", last_name="", full_name="Alice", user="alice@example.com")
		user = SimpleNamespace(name="alice@example.com", enabled=1, user_type="Website User")
		with patch.object(customer_portal_admin, "_customer_for_access", return_value=customer), patch.object(
			customer_portal_admin, "_linked_contact", return_value=(contact, "alice@example.com")
		), patch.object(customer_portal_admin.frappe.db, "get_value", return_value="alice@example.com"), patch.object(
			customer_portal_admin.frappe, "get_doc", return_value=user
		), patch.object(customer_portal_admin, "_customer_parents", return_value=["CUST-OTHER"]), self.assertRaises(
			frappe.PermissionError
		):
			customer_portal_admin.create_customer_portal_user(
				{"customer": "CUST-1", "contact": "CONTACT-1"}
			)

	def test_manual_entry_creates_a_linked_contact(self):
		contact = SimpleNamespace(name="CONTACT-NEW")
		with patch.object(customer_portal_admin.frappe, "get_doc") as get_doc:
			get_doc.return_value = SimpleNamespace(insert=Mock(), name="CONTACT-NEW")
			created = customer_portal_admin._create_contact(
				"CUST-1", "Alice", "Client", "alice@example.com"
			)
		values = get_doc.call_args.args[0]
		self.assertEqual(values["user"], "alice@example.com")
		self.assertEqual(values["links"], [{"link_doctype": "Customer", "link_name": "CUST-1"}])
		self.assertEqual(values["email_ids"][0]["email_id"], "alice@example.com")
		self.assertEqual(created.name, contact.name)


if __name__ == "__main__":
	unittest.main()
