import unittest
from types import SimpleNamespace
from unittest.mock import patch

import frappe

from log.pwa import ServiceWorkerRenderer
from log.services import portal_notifications as notif
from log.services import portal_push as push


class TestPortalNotificationUrl(unittest.TestCase):
	def test_hash_route_for_client_portal(self):
		self.assertEqual(push.portal_notification_url("/orders/SO-1"), "/client#/orders/SO-1")
		self.assertEqual(push.portal_notification_url(""), "/client#/")
		self.assertEqual(push.portal_notification_url("deliveries/DN-1"), "/client#/deliveries/DN-1")


class TestVapidKeys(unittest.TestCase):
	def test_ensure_vapid_keys_keeps_existing(self):
		conf = SimpleNamespace(
			get=lambda key, default=None: {
				"portal_vapid_public_key": "pub",
				"portal_vapid_private_key": "priv",
				"portal_vapid_mailto": "mailto:admin@medigo.one",
			}.get(key, default),
		)
		with patch.object(push.frappe, "conf", conf), patch.object(push, "_update_site_config") as update:
			keys = push.ensure_vapid_keys()
		self.assertEqual(keys["public"], "pub")
		self.assertEqual(keys["private"], "priv")
		update.assert_not_called()

	def test_ensure_vapid_keys_generates_when_missing(self):
		store = {}

		def get(key, default=None):
			return store.get(key, default)

		conf = SimpleNamespace(get=get)
		with patch.object(push.frappe, "conf", conf), patch.object(push, "_update_site_config", side_effect=store.__setitem__), patch.object(
			push.frappe, "log_error", lambda *args, **kwargs: None
		):
			keys = push.ensure_vapid_keys()
		self.assertTrue(keys["public"])
		self.assertIn("BEGIN PRIVATE KEY", keys["private"])
		self.assertEqual(store["portal_vapid_public_key"], keys["public"])


class TestPushEnqueue(unittest.TestCase):
	def test_deliver_enqueues_push_for_each_user(self):
		inserted = []

		def get_doc(values):
			doc = SimpleNamespace(name=f"N-{len(inserted)+1}")

			def insert(**_kwargs):
				inserted.append(values["for_user"])

			doc.insert = insert
			return doc

		fake_db = SimpleNamespace(table_exists=lambda _name: True, exists=lambda *_args, **_kwargs: False)
		with patch.object(notif, "category_enabled", return_value=True), patch.object(
			notif, "portal_users_for_customer", return_value=["a@example.com", "b@example.com"]
		), patch.object(notif.frappe, "db", fake_db), patch.object(
			notif.frappe, "get_doc", side_effect=get_doc
		), patch("log.services.portal_push.enqueue_push") as enqueue_push:
			created = notif._deliver(
				"CUST-1",
				category="livraisons",
				event_type="delivered",
				title="Livraison effectuée",
				document_type="Delivery Note",
				document_name="DN-1",
				link="/deliveries/DN-1",
			)
		self.assertEqual(created, ["N-1", "N-2"])
		self.assertEqual(enqueue_push.call_count, 2)
		self.assertEqual(enqueue_push.call_args_list[0].args[0], "a@example.com")
		self.assertEqual(enqueue_push.call_args_list[0].kwargs["title"], "Livraison effectuée")
		self.assertEqual(enqueue_push.call_args_list[0].kwargs["link"], "/deliveries/DN-1")

	def test_deliver_skips_enqueue_when_preference_disabled(self):
		with patch.object(notif, "category_enabled", return_value=False), patch(
			"log.services.portal_push.enqueue_push"
		) as enqueue_push:
			created = notif._deliver(
				"CUST-1",
				category="commandes",
				event_type="order_confirmed",
				title="Commande validée",
			)
		self.assertEqual(created, [])
		enqueue_push.assert_not_called()


class TestSendToUser(unittest.TestCase):
	def test_skips_without_subscription(self):
		with patch.object(push, "ensure_vapid_keys", return_value={"public": "pub", "private": "priv"}), patch.object(
			push, "subscriptions_for_user", return_value=[]
		):
			self.assertEqual(push.send_to_user("client@example.com", "Titre"), 0)

	def test_deletes_gone_endpoint(self):
		import sys

		row = SimpleNamespace(name="SUB-1", endpoint="https://push.example/1", p256dh="p", auth="a")

		class Gone(Exception):
			response = SimpleNamespace(status_code=410)

		def fake_webpush(**_kwargs):
			raise Gone("Gone")

		fake_mod = SimpleNamespace(webpush=fake_webpush)
		with patch.object(push, "ensure_vapid_keys", return_value={"public": "pub", "private": "priv"}), patch.object(
			push, "subscriptions_for_user", return_value=[row]
		), patch.object(
			push.frappe, "conf", SimpleNamespace(get=lambda *_args, **_kwargs: "mailto:admin@medigo.one")
		), patch.dict(sys.modules, {"pywebpush": fake_mod}), patch.object(push.frappe, "delete_doc") as delete_doc, patch.object(
			push.frappe, "log_error"
		):
			sent = push.send_to_user("client@example.com", "Titre", body="msg", link="/orders/SO-1")
		self.assertEqual(sent, 0)
		delete_doc.assert_called_once()
		self.assertEqual(delete_doc.call_args.args[0], "Abonnement Push Portail")
		self.assertEqual(delete_doc.call_args.args[1], "SUB-1")

	def test_upsert_rejects_incomplete_payload(self):
		with patch.object(push.frappe, "throw", side_effect=frappe.ValidationError), self.assertRaises(frappe.ValidationError):
			push.upsert_subscription("client@example.com", "CUST-1", "", "p", "a")


class TestPushApiAuth(unittest.TestCase):
	def test_get_push_config_requires_portal_session(self):
		from log.api import portal_notifications as api

		with patch.object(
			api, "_current_portal_customer", side_effect=frappe.PermissionError("Authentification requise.")
		), self.assertRaises(frappe.PermissionError):
			api.get_push_config()


class TestServiceWorkerRenderer(unittest.TestCase):
	def test_matches_sw_path(self):
		renderer = ServiceWorkerRenderer("sw-client.js")
		self.assertTrue(renderer.can_render())
		other = ServiceWorkerRenderer("client")
		self.assertFalse(other.can_render())
