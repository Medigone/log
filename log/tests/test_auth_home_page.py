import unittest
from types import SimpleNamespace
from unittest.mock import patch

import frappe

from log import auth
from log.compat import desk_home_route, desk_root


class TestAuthHomePage(unittest.TestCase):
	def _run_home_page(self, user, user_type, roles):
		session = SimpleNamespace(user=user)
		db = SimpleNamespace(get_value=lambda *_args, **_kwargs: user_type)
		with (
			patch.object(auth.frappe, "session", session),
			patch.object(auth.frappe, "db", db),
			patch.object(auth.frappe, "get_roles", lambda _user: list(roles)),
		):
			return auth.get_home_page(user)

	def test_guest_goes_to_client(self):
		self.assertEqual(self._run_home_page("Guest", None, ["Guest"]), "client")
		self.assertEqual(auth.get_home_page("Guest"), "client")
		self.assertEqual(auth.LANDING_PATH, "/")
		self.assertEqual(auth.SITE_TITLE, "Modern Pharma")

	def test_website_user_customer_goes_to_client(self):
		self.assertEqual(
			self._run_home_page("client@example.com", "Website User", ["Customer", "All"]),
			"client",
		)

	def test_administrator_goes_to_desk_even_with_customer_role(self):
		self.assertEqual(
			self._run_home_page(
				"Administrator",
				"System User",
				["Administrator", "Customer", "Livreur", "Responsable", "System Manager", "All"],
			),
			desk_home_route(),
		)

	def test_system_user_with_customer_role_is_not_sent_to_client(self):
		self.assertEqual(
			self._run_home_page("mixed@example.com", "System User", ["Customer", "All"]),
			desk_home_route(),
		)

	def test_livreur_goes_to_distribution(self):
		self.assertEqual(
			self._run_home_page("driver@example.com", "System User", ["Livreur", "All"]),
			"distribution",
		)

	def test_cashier_goes_to_distribution(self):
		self.assertEqual(
			self._run_home_page("cashier@example.com", "System User", ["Caissier", "All"]),
			"distribution",
		)

	def test_responsable_goes_to_distribution(self):
		self.assertEqual(
			self._run_home_page("boss@example.com", "System User", ["Responsable", "System Manager", "All"]),
			"distribution",
		)

	def test_system_manager_without_distribution_role_goes_to_desk(self):
		self.assertEqual(
			self._run_home_page("admin@example.com", "System User", ["System Manager", "All"]),
			desk_home_route(),
		)

	def test_distribution_app_is_hidden_from_website_users(self):
		session = SimpleNamespace(user="client@example.com")
		with (
			patch.object(auth.frappe, "session", session),
			patch.object(auth, "is_website_user", return_value=True),
		):
			self.assertFalse(auth.can_show_distribution_app())

	def test_distribution_app_is_hidden_from_guest(self):
		with patch.object(auth.frappe, "session", SimpleNamespace(user="Guest")):
			self.assertFalse(auth.can_show_distribution_app())

	def test_distribution_app_is_shown_to_system_users(self):
		session = SimpleNamespace(user="planner@example.com")
		with (
			patch.object(auth.frappe, "session", session),
			patch.object(auth, "is_website_user", return_value=False),
		):
			self.assertTrue(auth.can_show_distribution_app())

	def test_administrator_on_client_is_redirected_to_desk(self):
		flags = SimpleNamespace(redirect_location=None)
		with (
			patch.object(auth, "get_home_page", return_value="desk"),
			patch.object(auth.frappe, "session", SimpleNamespace(user="Administrator")),
			patch.object(auth.frappe, "local", SimpleNamespace(flags=flags)),
			self.assertRaises(frappe.Redirect),
		):
			auth.redirect_if_wrong_app("client")
		self.assertEqual(flags.redirect_location, desk_root())
		flags = SimpleNamespace(redirect_location=None)
		with (
			patch.object(auth, "get_home_page", return_value="distribution"),
			patch.object(auth.frappe, "session", SimpleNamespace(user="boss@example.com")),
			patch.object(auth.frappe, "local", SimpleNamespace(flags=flags)),
			self.assertRaises(frappe.Redirect),
		):
			auth.redirect_if_wrong_app("client")
		self.assertEqual(flags.redirect_location, "/distribution")

	def test_customer_on_distribution_is_redirected_to_client(self):
		flags = SimpleNamespace(redirect_location=None)
		with (
			patch.object(auth, "get_home_page", return_value="client"),
			patch.object(auth.frappe, "session", SimpleNamespace(user="client@example.com")),
			patch.object(auth.frappe, "local", SimpleNamespace(flags=flags)),
			self.assertRaises(frappe.Redirect),
		):
			auth.redirect_if_wrong_app("distribution")
		self.assertEqual(flags.redirect_location, "/client")

	def test_guest_is_not_redirected_from_either_spa(self):
		with patch.object(auth.frappe, "session", SimpleNamespace(user="Guest")):
			auth.redirect_if_wrong_app("client")
			auth.redirect_if_wrong_app("distribution")

	def test_staff_can_stay_on_distribution(self):
		flags = SimpleNamespace(redirect_location=None)
		with (
			patch.object(auth, "get_home_page", return_value="distribution"),
			patch.object(auth.frappe, "session", SimpleNamespace(user="boss@example.com")),
			patch.object(auth.frappe, "local", SimpleNamespace(flags=flags)),
		):
			auth.redirect_if_wrong_app("distribution")
		self.assertIsNone(flags.redirect_location)
