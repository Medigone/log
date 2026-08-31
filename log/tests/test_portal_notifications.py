import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import frappe

from log.services import portal_notifications as service


def _raise(message, exc=frappe.ValidationError, **_kwargs):
	raise exc(message)


def _order(**kwargs):
	doc = frappe._dict({"customer": "CUST-1", "name": "SO-1", "status": "To Deliver and Bill", **kwargs})
	doc.has_value_changed = kwargs.get("has_value_changed") or (lambda _field: True)
	return doc


class TestPortalNotificationPreferences(unittest.TestCase):
	def test_defaults_enable_transactional_and_disable_promotions(self):
		fake_db = SimpleNamespace(table_exists=lambda _name: False)
		with patch.object(service.frappe, "db", fake_db):
			values = service.get_preference_values("CUST-1")
			self.assertEqual(values["commandes"], 1)
			self.assertEqual(values["livraisons"], 1)
			self.assertEqual(values["paiements"], 1)
			self.assertEqual(values["demandes"], 1)
			self.assertEqual(values["promotions"], 0)
			self.assertTrue(service.category_enabled("CUST-1", "commandes"))
			self.assertFalse(service.category_enabled("CUST-1", "promotions"))

	def test_stored_preferences_override_defaults(self):
		fake_db = SimpleNamespace(
			table_exists=lambda _name: True,
			exists=lambda *_args, **_kwargs: "CUST-1",
			get_value=lambda *_args, **_kwargs: {
				"commandes": 0,
				"livraisons": 1,
				"paiements": 1,
				"demandes": 1,
				"promotions": 1,
			},
		)
		with patch.object(service.frappe, "db", fake_db):
			self.assertFalse(service.category_enabled("CUST-1", "commandes"))
			self.assertTrue(service.category_enabled("CUST-1", "promotions"))


class TestPortalNotificationDelivery(unittest.TestCase):
	def test_deliver_skips_when_preference_disabled(self):
		with patch.object(service, "category_enabled", return_value=False), patch.object(
			service, "portal_users_for_customer", return_value=["client@example.com"]
		) as users:
			created = service._deliver(
				"CUST-1",
				category="commandes",
				event_type="order_confirmed",
				title="Commande validée",
				document_type="Sales Order",
				document_name="SO-1",
			)
		self.assertEqual(created, [])
		users.assert_not_called()

	def test_deliver_skips_without_portal_users(self):
		fake_db = SimpleNamespace(table_exists=lambda _name: True, exists=lambda *_args, **_kwargs: False)
		with patch.object(service, "category_enabled", return_value=True), patch.object(
			service, "portal_users_for_customer", return_value=[]
		), patch.object(service.frappe, "db", fake_db), patch.object(service.frappe, "get_doc") as get_doc:
			created = service._deliver(
				"CUST-1",
				category="commandes",
				event_type="order_confirmed",
				title="Commande validée",
				document_type="Sales Order",
				document_name="SO-1",
			)
		self.assertEqual(created, [])
		get_doc.assert_not_called()

	def test_deliver_dedupes_same_event_and_document(self):
		inserted = []

		def get_doc(values):
			doc = SimpleNamespace(**values, insert=lambda **_kwargs: inserted.append(values["for_user"]))
			doc.name = f"N-{values['for_user']}"
			return doc

		fake_db = SimpleNamespace(
			table_exists=lambda _name: True,
			exists=lambda *_args, **_kwargs: True,
		)
		with patch.object(service, "category_enabled", return_value=True), patch.object(
			service, "portal_users_for_customer", return_value=["a@example.com", "b@example.com"]
		), patch.object(service.frappe, "db", fake_db), patch.object(service.frappe, "get_doc", side_effect=get_doc):
			created = service._deliver(
				"CUST-1",
				category="commandes",
				event_type="order_confirmed",
				title="Commande validée",
				document_type="Sales Order",
				document_name="SO-1",
			)
		self.assertEqual(created, [])
		self.assertEqual(inserted, [])

	def test_deliver_creates_one_row_per_portal_user(self):
		inserted = []

		def get_doc(values):
			doc = SimpleNamespace(name=f"N-{len(inserted)+1}")

			def insert(**_kwargs):
				inserted.append(values["for_user"])

			doc.insert = insert
			return doc

		fake_db = SimpleNamespace(table_exists=lambda _name: True, exists=lambda *_args, **_kwargs: False)
		with patch.object(service, "category_enabled", return_value=True), patch.object(
			service, "portal_users_for_customer", return_value=["a@example.com", "b@example.com"]
		), patch.object(service.frappe, "db", fake_db), patch.object(service.frappe, "get_doc", side_effect=get_doc):
			created = service._deliver(
				"CUST-1",
				category="livraisons",
				event_type="delivered",
				title="Livraison effectuée",
				document_type="Delivery Note",
				document_name="DN-1",
				link="/deliveries/DN-1",
			)
		self.assertEqual(created, ["N-1", "N-2"])
		self.assertEqual(inserted, ["a@example.com", "b@example.com"])

	def test_owned_notification_rejects_another_customer(self):
		doc = frappe._dict(customer="CUST-OTHER", for_user="client@example.com", name="N-1")
		fake = SimpleNamespace(
			db=SimpleNamespace(exists=lambda *_args: True),
			get_doc=lambda *_args: doc,
			throw=_raise,
			PermissionError=frappe.PermissionError,
			DoesNotExistError=frappe.DoesNotExistError,
		)
		with patch.object(service, "frappe", fake), patch.object(service, "_", lambda value: value), self.assertRaises(
			frappe.PermissionError
		):
			service.owned_notification("N-1", "CUST-1", "client@example.com")


class TestPortalNotificationHooks(unittest.TestCase):
	def setUp(self):
		self.patches = [
			patch.object(service, "_", lambda value: value),
			patch.object(service.frappe, "log_error", lambda *args, **kwargs: None),
		]
		for item in self.patches:
			item.start()
			self.addCleanup(item.stop)

	def test_sales_order_submit_notifies_confirmation(self):
		with patch.object(service, "notify_customer") as notify:
			service.on_sales_order_submit(_order())
		notify.assert_called_once()
		self.assertEqual(notify.call_args.kwargs["event_type"], "order_confirmed")
		self.assertEqual(notify.call_args.kwargs["category"], "commandes")
		self.assertEqual(notify.call_args.kwargs["link"], "/orders/SO-1")

	def test_sales_order_cancel_notifies(self):
		with patch.object(service, "notify_customer") as notify:
			service.on_sales_order_cancel(_order())
		self.assertEqual(notify.call_args.kwargs["event_type"], "order_cancelled")

	def test_sales_order_hold_and_close(self):
		closed = _order(status="Closed")
		held = _order(status="On Hold")
		with patch.object(service, "notify_customer") as notify:
			service.on_sales_order_update_after_submit(closed)
			service.on_sales_order_update_after_submit(held)
		events = [call.kwargs["event_type"] for call in notify.call_args_list]
		self.assertEqual(events, ["order_closed", "order_on_hold"])

	def test_delivery_prepared_is_ignored(self):
		doc = frappe._dict(customer="CUST-1", name="DN-1", custom_statut="Préparé")
		doc.has_value_changed = lambda field: field == "custom_statut"
		with patch.object(service, "notify_customer") as notify:
			service.on_delivery_note_update(doc)
		notify.assert_not_called()

	def test_delivery_delivered_notifies(self):
		doc = frappe._dict(customer="CUST-1", name="DN-1", custom_statut="Livré")
		doc.has_value_changed = lambda field: field == "custom_statut"
		with patch.object(service, "notify_customer") as notify:
			service.on_delivery_note_update(doc)
		self.assertEqual(notify.call_args.kwargs["event_type"], "delivered")
		self.assertEqual(notify.call_args.kwargs["document_type"], "Delivery Note")
		self.assertEqual(notify.call_args.kwargs["link"], "/deliveries/DN-1")

	def test_livraison_en_cours_notifies_each_delivery_note(self):
		doc = frappe._dict(
			etat_planification="En cours",
			bons_de_livraison=[
				frappe._dict(bon_de_livraison="DN-1", customer="CUST-1"),
				frappe._dict(bon_de_livraison="DN-2", customer="CUST-2"),
			],
		)
		doc.has_value_changed = lambda field: field == "etat_planification"
		with patch.object(service, "notify_customer") as notify:
			service.on_livraison_update(doc)
		customers = [call.args[0] for call in notify.call_args_list]
		events = [call.kwargs["event_type"] for call in notify.call_args_list]
		self.assertEqual(customers, ["CUST-1", "CUST-2"])
		self.assertEqual(events, ["delivery_in_progress", "delivery_in_progress"])
		self.assertEqual(notify.call_args_list[0].kwargs["document_name"], "DN-1")

	def test_paiement_notifies_only_when_validated(self):
		pending = frappe._dict(client="CUST-1", name="PAY-1", statut_controle="À contrôler")
		pending.has_value_changed = lambda field: field == "statut_controle"
		validated = frappe._dict(client="CUST-1", name="PAY-1", statut_controle="Validé")
		validated.has_value_changed = lambda field: field == "statut_controle"
		with patch.object(service, "notify_customer") as notify:
			service.on_paiement_client_update(pending)
			service.on_paiement_client_update(validated)
		notify.assert_called_once()
		self.assertEqual(notify.call_args.kwargs["event_type"], "payment_validated")
		self.assertEqual(notify.call_args.kwargs["link"], "/payments")

	def test_catalog_request_refused_and_converted(self):
		refused = frappe._dict(client="CUST-1", name="DHC-1", statut="Refusée", motif_refus="Rupture")
		refused.has_value_changed = lambda field: field == "statut"
		converted = frappe._dict(client="CUST-1", name="DHC-1", statut="Commande créée", commande="SO-9")
		converted.has_value_changed = lambda field: field == "statut"
		with patch.object(service, "notify_customer") as notify:
			service.on_demande_hors_catalogue_update(refused)
			service.on_demande_hors_catalogue_update(converted)
		self.assertEqual(notify.call_args_list[0].kwargs["event_type"], "request_refused")
		self.assertIn("Rupture", notify.call_args_list[0].kwargs["body"])
		self.assertEqual(notify.call_args_list[1].kwargs["event_type"], "request_converted")
		self.assertEqual(notify.call_args_list[1].kwargs["link"], "/orders/SO-9")

	def test_campaign_enqueue_only_on_publish(self):
		published = frappe._dict(published=1, enabled=1, name="CAMP-1")
		published.get_doc_before_save = lambda: frappe._dict(published=0)
		already = frappe._dict(published=1, enabled=1, name="CAMP-1")
		already.get_doc_before_save = lambda: frappe._dict(published=1)
		with patch.object(service.frappe, "enqueue") as enqueue:
			service.on_campagne_portail_update(published)
			service.on_campagne_portail_update(already)
		enqueue.assert_called_once()
		self.assertEqual(enqueue.call_args.kwargs["campaign"], "CAMP-1")

	def test_campaign_targets_matching_customers_only(self):
		campaign = frappe._dict(name="CAMP-1", published=1, enabled=1, headline="Promo été", title="Campagne")
		fake_db = SimpleNamespace(exists=lambda *_args, **_kwargs: True, get_value=lambda *_args, **_kwargs: 0)
		with patch.object(service.frappe, "db", fake_db), patch.object(
			service.frappe, "get_doc", return_value=campaign
		), patch.object(service.frappe, "get_all", return_value=["CUST-1", "CUST-2"]), patch(
			"log.services.portal_merchandising.get_customer_segments", return_value={}
		), patch(
			"log.services.portal_merchandising.campaign_matches_segments",
			side_effect=[True, False],
		), patch.object(service, "notify_customer") as notify, patch.object(service, "_", lambda value: value):
			service.notify_campaign_published("CAMP-1")
		notify.assert_called_once()
		self.assertEqual(notify.call_args.args[0], "CUST-1")
		self.assertEqual(notify.call_args.kwargs["category"], "promotions")
		self.assertEqual(notify.call_args.kwargs["event_type"], "campaign_published")


class TestPortalNotificationPermissions(unittest.TestCase):
	def test_query_conditions_restrict_non_staff_to_own_rows(self):
		fake_db = SimpleNamespace(escape=lambda value: f"'{value}'")
		with patch.object(service.frappe, "session", SimpleNamespace(user="client@example.com")), patch.object(
			service.frappe, "get_roles", return_value=["Customer"]
		), patch.object(service.frappe, "db", fake_db):
			clause = service.notification_query_conditions()
		self.assertIn("for_user", clause)
		self.assertIn("client@example.com", clause)

	def test_staff_has_unrestricted_query(self):
		with patch.object(service.frappe, "session", SimpleNamespace(user="admin@example.com")), patch.object(
			service.frappe, "get_roles", return_value=["Responsable"]
		):
			self.assertIsNone(service.notification_query_conditions())
