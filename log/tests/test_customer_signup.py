import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import frappe

from log.api import customer_signup


def _raise(message, exc=frappe.ValidationError, **_kwargs):
	raise exc(message)


class TestCustomerSignupValidation(unittest.TestCase):
	def setUp(self):
		self.patches = [
			patch.object(customer_signup, "_", lambda value: value),
			patch.object(customer_signup.frappe, "throw", _raise),
		]
		for item in self.patches:
			item.start()

	def tearDown(self):
		for item in self.patches:
			item.stop()

	def test_required_fields_are_rejected_when_blank(self):
		with self.assertRaises(frappe.ValidationError):
			customer_signup._required_text("  ", "Le nom commercial est obligatoire.")
		with self.assertRaises(frappe.ValidationError):
			customer_signup._normalise_phone("")
		with self.assertRaises(frappe.ValidationError):
			customer_signup._normalise_phone("12 34")

	def test_phone_keeps_the_typed_value_when_valid(self):
		self.assertEqual(customer_signup._normalise_phone("0550 12 34 56"), "0550 12 34 56")

	def test_invalid_commune_is_rejected(self):
		fake_db = SimpleNamespace(get_value=lambda *_args, **_kwargs: None)
		with patch.object(customer_signup.frappe, "db", fake_db), self.assertRaises(frappe.ValidationError):
			customer_signup._resolve_commune("COM-MISSING")

	def test_commune_without_wilaya_is_rejected(self):
		fake_db = SimpleNamespace(
			get_value=lambda *_args, **_kwargs: {"name": "COM-1", "nom": "Oran", "wilaya": None, "region": None}
		)
		with patch.object(customer_signup.frappe, "db", fake_db), self.assertRaises(frappe.ValidationError):
			customer_signup._resolve_commune("COM-1")

	def test_group_category_is_rejected(self):
		fake_db = SimpleNamespace(get_value=lambda *_args, **_kwargs: {"name": "All Customer Groups", "is_group": 1})
		with patch.object(customer_signup.frappe, "db", fake_db), self.assertRaises(frappe.ValidationError):
			customer_signup._resolve_customer_group("All Customer Groups")

	def test_existing_email_on_user_is_rejected(self):
		fake_db = SimpleNamespace(exists=lambda doctype, *_args, **_kwargs: doctype == "User")
		with patch.object(customer_signup.frappe, "db", fake_db), self.assertRaises(frappe.ValidationError):
			customer_signup._assert_email_available("deja@example.com")

	def test_existing_email_on_contact_is_rejected(self):
		fake_db = SimpleNamespace(exists=lambda doctype, *_args, **_kwargs: doctype == "Contact Email")
		with patch.object(customer_signup.frappe, "db", fake_db), self.assertRaises(frappe.ValidationError):
			customer_signup._assert_email_available("deja@example.com")


class TestCustomerSignupSubmit(unittest.TestCase):
	def test_creates_prospect_customer_and_contact_without_user(self):
		customer = SimpleNamespace(
			name="CUST-NEW",
			meta=SimpleNamespace(has_field=lambda _field: True),
			flags=SimpleNamespace(ignore_permissions=False),
			insert=Mock(),
			db_set=Mock(),
		)
		contact = SimpleNamespace(name="CONTACT-NEW", user=None, insert=Mock())
		inserted = []

		def get_doc(value):
			inserted.append(value)
			contact.insert = Mock()
			return contact

		commune = SimpleNamespace(name="COM-1", nom="Oran", wilaya="Oran", region="Algeria")
		with patch.object(customer_signup, "_payload", return_value={
			"commercialName": "Pharmacie Test",
			"firstName": "Amina",
			"lastName": "Benali",
			"phone": "0550123456",
			"email": "amina@example.com",
			"commune": "COM-1",
			"category": "Commercial",
		}), patch.object(customer_signup, "_resolve_commune", return_value=commune), patch.object(
			customer_signup, "_resolve_customer_group", return_value="Commercial"
		), patch.object(customer_signup, "_assert_email_available"), patch.object(
			customer_signup, "_create_customer", return_value=customer
		), patch.object(customer_signup, "_create_contact", return_value=contact) as create_contact, patch.object(
			customer_signup, "_", lambda value: value
		):
			result = customer_signup._submit_signup({})

		self.assertTrue(result["success"])
		self.assertIn("Demande envoyée", result["message"])
		create_contact.assert_called_once_with("CUST-NEW", "Amina", "Benali", "amina@example.com", "0550123456")
		customer.db_set.assert_any_call("customer_primary_contact", "CONTACT-NEW")
		self.assertIsNone(contact.user)

	def test_create_customer_sets_prospect_status(self):
		created = SimpleNamespace(
			customer_name=None,
			customer_type=None,
			customer_group=None,
			territory=None,
			custom_status=None,
			custom_commune=None,
			custom_wilaya=None,
			flags=SimpleNamespace(),
			meta=SimpleNamespace(has_field=lambda _field: True),
			insert=Mock(),
		)
		commune = SimpleNamespace(name="COM-1", wilaya="Oran", region="Algeria")
		with patch.object(customer_signup.frappe, "new_doc", return_value=created), patch.object(
			customer_signup, "_territory_for", return_value="Algeria"
		), patch.object(customer_signup, "_ignore_permission_checks"):
			customer_signup._create_customer("Pharmacie Test", "Commercial", commune)
		self.assertEqual(created.custom_status, "Prospect")
		self.assertEqual(created.customer_type, "Company")
		self.assertEqual(created.custom_commune, "COM-1")
		self.assertEqual(created.custom_wilaya, "Oran")
		created.insert.assert_called_once()

	def test_create_contact_does_not_attach_a_user(self):
		captured = {}

		def get_doc(value):
			captured.update(value)
			return SimpleNamespace(name="CONTACT-1", insert=Mock())

		with patch.object(customer_signup.frappe, "get_doc", side_effect=get_doc):
			customer_signup._create_contact("CUST-1", "Amina", "Benali", "amina@example.com", "0550123456")
		self.assertNotIn("user", captured)
		self.assertEqual(captured["first_name"], "Amina")
		self.assertEqual(captured["links"][0]["link_name"], "CUST-1")

	def test_signup_options_are_guest_readable(self):
		with patch.object(
			customer_signup,
			"_commune_items",
			return_value=[{"name": "COM-1", "nom": "Oran", "wilaya": "Oran", "wilayaName": "Oran"}],
		), patch.object(
			customer_signup,
			"_category_items",
			return_value=[{"name": "Commercial", "label": "Commercial"}],
		):
			result = customer_signup.signup_options()
		self.assertEqual(result["communes"][0]["name"], "COM-1")
		self.assertEqual(result["categories"][0]["name"], "Commercial")
