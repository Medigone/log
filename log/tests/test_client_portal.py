import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import frappe

from log.api import client_portal


def _raise(message, exc=frappe.ValidationError, **_kwargs):
	raise exc(message)


class TestClientPortalSecurity(unittest.TestCase):
	def test_customer_is_resolved_only_from_authenticated_portal_user(self):
		db = Mock()
		db.get_value.side_effect = [frappe._dict(name="client@example.com", enabled=1, user_type="Website User", full_name="Client", email="client@example.com"), 0]
		fake = SimpleNamespace(
			session=SimpleNamespace(user="client@example.com"),
			db=db,
			get_roles=lambda _user: ["Customer"],
			get_all=Mock(return_value=["CUST-1"]),
		)
		with patch.object(client_portal, "frappe", fake):
			customer, user = client_portal._current_portal_customer()
		self.assertEqual(customer, "CUST-1")
		self.assertEqual(user.name, "client@example.com")
		self.assertEqual(fake.get_all.call_args.args[0], "Portal User")

	def test_order_from_another_customer_is_rejected(self):
		fake = SimpleNamespace(
			db=SimpleNamespace(exists=lambda *_args: True),
			get_doc=lambda *_args: frappe._dict(name="SO-1", customer="CUST-OTHER"),
			throw=_raise,
			PermissionError=frappe.PermissionError,
			DoesNotExistError=frappe.DoesNotExistError,
		)
		with patch.object(client_portal, "frappe", fake), patch.object(client_portal, "_", lambda value: value), self.assertRaises(frappe.PermissionError):
			client_portal._owned_order("SO-1", "CUST-1")

	def test_only_portal_drafts_are_editable(self):
		self.assertTrue(client_portal._can_edit_order(frappe._dict(docstatus=0, custom_origine_commande="Portail client")))
		self.assertFalse(client_portal._can_edit_order(frappe._dict(docstatus=1, custom_origine_commande="Portail client")))
		self.assertFalse(client_portal._can_edit_order(frappe._dict(docstatus=0, custom_origine_commande="Interne")))

	def test_modified_timestamp_prevents_overwrite(self):
		client_portal._assert_modified(frappe._dict(modified="2026-08-28 10:00:00"), "2026-08-28 10:00:00")
		with patch.object(client_portal, "_", lambda value: value), patch.object(client_portal.frappe, "throw", side_effect=_raise), self.assertRaises(frappe.ValidationError):
			client_portal._assert_modified(frappe._dict(modified="new"), "old")

	def test_initial_password_change_verifies_current_password_and_clears_guard(self):
		user = frappe._dict(name="client@example.com", custom_portal_password_change_required=1)
		db = Mock()
		db.has_column.return_value = True
		with patch.object(client_portal, "_current_portal_customer", return_value=("CUST-1", user)), patch.object(
			client_portal.frappe, "db", db
		), patch.object(client_portal, "update_password") as update:
			result = client_portal.change_initial_password(
				{"currentPassword": "Temporary#123", "newPassword": "PermanentPassword#456"}
			)
		update.assert_called_once_with(
			new_password="PermanentPassword#456",
			old_password="Temporary#123",
			logout_all_sessions=1,
		)
		db.set_value.assert_called_once_with(
			"User",
			"client@example.com",
			"custom_portal_password_change_required",
			0,
			update_modified=False,
		)
		self.assertTrue(result["success"])

	def test_initial_password_change_is_refused_when_guard_is_not_set(self):
		user = frappe._dict(name="client@example.com", custom_portal_password_change_required=0)
		db = Mock()
		db.has_column.return_value = True
		with patch.object(client_portal, "_current_portal_customer", return_value=("CUST-1", user)), patch.object(
			client_portal.frappe, "db", db
		), patch.object(client_portal.frappe, "throw", side_effect=_raise), self.assertRaises(
			frappe.ValidationError
		):
			client_portal.change_initial_password(
				{"currentPassword": "Temporary#123", "newPassword": "PermanentPassword#456"}
			)

	def test_permission_checks_are_bypassed_only_inside_portal_write(self):
		def deny(*_args, **_kwargs):
			return False

		with patch.object(client_portal.frappe, "has_permission", deny):
			self.assertFalse(client_portal.frappe.has_permission("Account", "read", "Debtors"))
			with client_portal._ignore_permission_checks():
				self.assertTrue(client_portal.frappe.has_permission("Account", "read", "Debtors"))
			self.assertFalse(client_portal.frappe.has_permission("Account", "read", "Debtors"))

	def test_permission_checks_are_restored_after_a_failed_portal_write(self):
		def deny(*_args, **_kwargs):
			return False

		with patch.object(client_portal.frappe, "has_permission", deny):
			with self.assertRaises(RuntimeError):
				with client_portal._ignore_permission_checks():
					raise RuntimeError("insert failed")
			self.assertFalse(client_portal.frappe.has_permission("Account", "read", "Debtors"))


class TestClientPortalValidation(unittest.TestCase):
	def test_valid_gps_is_accepted(self):
		self.assertEqual(client_portal._validate_gps({"latitude": 36.75, "longitude": 3.05, "accuracy": 25})["accuracy"], 25)

	def test_inaccurate_or_invalid_gps_is_rejected(self):
		with patch.object(client_portal, "_", lambda value: value), patch.object(client_portal.frappe, "throw", side_effect=_raise):
			with self.assertRaises(frappe.ValidationError):
				client_portal._validate_gps({"latitude": 36.75, "longitude": 3.05, "accuracy": 51})
			with self.assertRaises(frappe.ValidationError):
				client_portal._validate_gps({"latitude": 0, "longitude": 0, "accuracy": 1})
			with self.assertRaises(frappe.ValidationError):
				client_portal._resolve_gps({"source": "device", "latitude": 36.75, "longitude": 3.05, "accuracy": 80})

	def test_map_pin_is_accepted_without_accuracy_limit(self):
		result = client_portal._resolve_gps({"source": "map", "latitude": 36.75, "longitude": 3.05})
		self.assertEqual(result, {"latitude": 36.75, "longitude": 3.05, "accuracy": 0.0})
		self.assertEqual(
			client_portal._resolve_gps({"source": "map", "latitude": 36.75, "longitude": 3.05, "accuracy": 80})["accuracy"],
			80,
		)

	def test_gps_context_exposes_coordinates_and_audit(self):
		context = client_portal._gps_context(
			frappe._dict(custom_gps="36.75000000,3.05000000", custom_gps_precision_m=18, custom_gps_capture_date="2026-08-28 10:00:00")
		)
		self.assertEqual(
			context,
			{
				"gpsConfigured": True,
				"gpsLatitude": 36.75,
				"gpsLongitude": 3.05,
				"gpsAccuracy": 18.0,
				"gpsCapturedAt": "2026-08-28 10:00:00",
			},
		)

	def test_update_customer_gps_saves_a_map_pin(self):
		with patch.object(client_portal, "_current_portal_customer", return_value=("CUST-1", frappe._dict())), patch.object(
			client_portal, "_save_customer_gps"
		) as save, patch.object(client_portal, "now_datetime", return_value="2026-08-28 11:00:00"):
			result = client_portal.update_customer_gps({"source": "map", "latitude": 36.75, "longitude": 3.05})
		save.assert_called_once_with("CUST-1", {"latitude": 36.75, "longitude": 3.05, "accuracy": 0.0})
		self.assertEqual(result["gpsLatitude"], 36.75)
		self.assertTrue(result["gpsConfigured"])

	def test_update_customer_gps_requires_authentication(self):
		fake = SimpleNamespace(
			session=SimpleNamespace(user="Guest"),
			throw=_raise,
			PermissionError=frappe.PermissionError,
		)
		with patch.object(client_portal, "frappe", fake), patch.object(client_portal, "_", lambda value: value), self.assertRaises(
			frappe.PermissionError
		):
			client_portal.update_customer_gps({"source": "map", "latitude": 36.75, "longitude": 3.05})

	def test_past_delivery_date_is_rejected(self):
		with patch.object(client_portal, "today", return_value="2026-08-28"), patch.object(client_portal, "_", lambda value: value), patch.object(client_portal.frappe, "throw", side_effect=_raise), self.assertRaises(frappe.ValidationError):
			client_portal._validate_delivery_date("2026-08-27")

	def test_today_delivery_date_is_accepted(self):
		with patch.object(client_portal, "today", return_value="2026-09-06"):
			self.assertEqual(client_portal._validate_delivery_date("2026-09-06"), "2026-09-06")

	def test_delivery_date_uses_calendar_day_from_iso_datetime(self):
		with patch.object(client_portal, "today", return_value="2026-09-06"):
			self.assertEqual(client_portal._validate_delivery_date("2026-09-06T00:00:00.000Z"), "2026-09-06")

	def test_catalog_lines_exclude_disabled_and_non_sales_items(self):
		fake = SimpleNamespace(
			get_all=Mock(return_value=[frappe._dict(name="ART-1", stock_uom="Unité")]),
			throw=frappe.throw,
		)
		with patch.object(client_portal, "frappe", fake):
			lines = client_portal._normalise_lines([{"itemCode": "ART-1", "quantity": 2}])
		self.assertEqual(
			lines,
			[{"item_code": "ART-1", "qty": 2.0, "uom": "Unité", "campaign": None, "placement": None}],
		)
		self.assertEqual(fake.get_all.call_args.kwargs["filters"]["is_sales_item"], 1)
		self.assertEqual(fake.get_all.call_args.kwargs["filters"]["disabled"], 0)

	def test_catalog_lines_keep_last_touch_campaign_attribution(self):
		fake = SimpleNamespace(
			get_all=Mock(return_value=[frappe._dict(name="ART-1", stock_uom="Unité")]),
			throw=frappe.throw,
		)
		with patch.object(client_portal, "frappe", fake):
			lines = client_portal._normalise_lines(
				[
					{"itemCode": "ART-1", "quantity": 1, "campaign": "CAMP-1", "placement": "Hero"},
					{"itemCode": "ART-1", "quantity": 1, "campaign": "CAMP-2", "placement": "Rayon produits"},
				]
			)
		self.assertEqual(lines[0]["qty"], 2.0)
		self.assertEqual(lines[0]["campaign"], "CAMP-2")
		self.assertEqual(lines[0]["placement"], "Rayon produits")

	def test_storefront_uses_authenticated_customer_only(self):
		user = frappe._dict(name="client@example.com")
		with patch.object(client_portal, "_current_portal_customer", return_value=("CUST-1", user)), patch(
			"log.services.portal_merchandising.build_storefront", return_value={"banners": [], "rails": []}
		) as build:
			client_portal.get_storefront()
		build.assert_called_once_with("CUST-1", "client@example.com")

	def test_preview_campaign_requires_write_permission(self):
		with patch.object(client_portal.frappe, "has_permission", return_value=False), patch.object(
			client_portal, "_", lambda value: value
		), patch.object(client_portal.frappe, "throw", side_effect=_raise), self.assertRaises(frappe.PermissionError):
			client_portal.preview_campaign("CAMP-1", "CUST-OTHER")

	def test_promotion_event_ignores_client_identity_in_payload(self):
		user = frappe._dict(name="client@example.com")
		with patch.object(client_portal, "_current_portal_customer", return_value=("CUST-1", user)), patch(
			"log.services.portal_promotion_events.log_event", return_value={"recorded": True, "duplicate": False}
		) as log_event:
			client_portal.log_promotion_event(
				{"eventType": "view_promotion", "campaign": "CAMP-1", "customer": "HACKED"}
			)
		self.assertEqual(log_event.call_args.kwargs["customer"], "CUST-1")

	def test_catalog_filters_require_store_visibility_when_the_field_exists(self):
		db = SimpleNamespace(has_column=lambda doctype, field: doctype == "Item" and field == "custom_afficher_dans_store")
		with patch.object(client_portal.frappe, "db", db):
			filters = client_portal._catalog_item_filters()
		self.assertEqual(filters[client_portal.STORE_VISIBLE_FIELD], 1)
		self.assertEqual(filters["is_sales_item"], 1)

	def test_catalog_text_search_includes_item_group(self):
		user = frappe._dict(name="client@example.com")
		captured = {}

		def fake_get_all(doctype, **kwargs):
			if doctype == "Item":
				captured["or_filters"] = kwargs.get("or_filters")
				return []
			return []

		with patch.object(client_portal, "_current_portal_customer", return_value=("CUST-1", user)), patch.object(
			client_portal, "_catalog_item_filters", return_value={"disabled": 0}
		), patch.object(client_portal, "_item_has_column", return_value=False), patch.object(
			client_portal, "_customer_data", return_value=frappe._dict()
		), patch.object(client_portal, "_company", return_value="IntraPro"), patch.object(
			client_portal, "_currency", return_value="DZD"
		), patch.object(client_portal.frappe, "get_all", side_effect=fake_get_all), patch(
			"log.services.portal_merchandising.campaigns_by_item", return_value={}
		), patch("log.services.portal_merchandising.apply_prices"):
			client_portal.get_catalog(search="Boissons")

		self.assertIn(["item_group", "like", "%Boissons%"], captured["or_filters"])

	def test_catalog_sort_uses_allowed_clauses_only(self):
		user = frappe._dict(name="client@example.com")
		captured = {}

		def fake_get_all(doctype, **kwargs):
			if doctype == "Item" and kwargs.get("fields"):
				captured["order_by"] = kwargs.get("order_by")
			return []

		db = SimpleNamespace(count=lambda *_args, **_kwargs: 0, has_column=lambda *_args: False)
		patches = [
			patch.object(client_portal, "_current_portal_customer", return_value=("CUST-1", user)),
			patch.object(client_portal, "_catalog_item_filters", return_value={"disabled": 0}),
			patch.object(client_portal, "_item_has_column", return_value=False),
			patch.object(client_portal, "_customer_data", return_value=frappe._dict()),
			patch.object(client_portal, "_company", return_value="IntraPro"),
			patch.object(client_portal, "_currency", return_value="DZD"),
			patch.object(client_portal.frappe, "get_all", side_effect=fake_get_all),
			patch.object(client_portal.frappe, "db", db),
			patch("log.services.portal_merchandising.campaigns_by_item", return_value={}),
			patch("log.services.portal_merchandising.apply_prices"),
		]
		with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8], patches[9]:
			result = client_portal.get_catalog(order_by="name_desc")
			self.assertEqual(captured["order_by"], client_portal.CATALOG_SORT_CLAUSES["name_desc"])
			self.assertEqual(result["total"], 0)
			client_portal.get_catalog(order_by="unknown")
			self.assertEqual(captured["order_by"], client_portal.CATALOG_SORT_CLAUSES["relevance"])
			client_portal.get_catalog(order_by="recent")
			self.assertEqual(captured["order_by"], client_portal.CATALOG_SORT_CLAUSES["recent"])

	def test_catalog_campaign_filter_keeps_display_order_and_rejects_ineligible(self):
		user = frappe._dict(name="client@example.com")
		live = frappe._dict(name="CAMP-1", placement="Bandeau", title="Promo")
		captured = {}

		def fake_get_all(doctype, **kwargs):
			if doctype == "Item" and kwargs.get("fields"):
				captured["filters"] = kwargs.get("filters")
				return [
					frappe._dict(name="ART-B", item_name="B", description="", item_group="Nutrition", stock_uom="Unité", image=None),
					frappe._dict(name="ART-A", item_name="A", description="", item_group="Nutrition", stock_uom="Unité", image=None),
				]
			if doctype == "Item Group":
				return ["Nutrition"]
			return []

		patches = [
			patch.object(client_portal, "_current_portal_customer", return_value=("CUST-1", user)),
			patch.object(client_portal, "_catalog_item_filters", return_value={"disabled": 0}),
			patch.object(client_portal, "_item_has_column", return_value=False),
			patch.object(client_portal, "_customer_data", return_value=frappe._dict()),
			patch.object(client_portal, "_company", return_value="IntraPro"),
			patch.object(client_portal, "_currency", return_value="DZD"),
			patch.object(client_portal.frappe, "get_all", side_effect=fake_get_all),
			patch("log.services.portal_merchandising.campaigns_by_item", return_value={}),
			patch("log.services.portal_merchandising.get_live_campaign", return_value=live),
			patch("log.services.portal_merchandising.campaign_visible_item_codes", return_value=["ART-A", "ART-B"]),
			patch("log.services.portal_merchandising.serialize_item_row", side_effect=lambda row, **_kwargs: {"itemCode": row.name}),
			patch("log.services.portal_merchandising.apply_prices"),
		]
		with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8], patches[9], patches[10], patches[11]:
			result = client_portal.get_catalog(campaign="CAMP-1")
		self.assertEqual(captured["filters"]["name"], ["in", ["ART-A", "ART-B"]])
		self.assertEqual([item["itemCode"] for item in result["items"]], ["ART-A", "ART-B"])

		with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patch(
			"log.services.portal_merchandising.get_live_campaign", return_value=None
		), patches[9], patches[10], patches[11]:
			empty = client_portal.get_catalog(campaign="CAMP-SECRET")
		self.assertEqual(empty["items"], [])
		self.assertEqual(empty["total"], 0)

	def test_recent_order_items_are_scoped_to_the_authenticated_customer(self):
		user = frappe._dict(name="client@example.com")
		captured = {}

		def fake_get_all(doctype, **kwargs):
			captured.setdefault(doctype, []).append(kwargs)
			if doctype == "Sales Order":
				return ["SO-1"]
			if doctype == "Sales Order Item":
				return [
					frappe._dict(item_code="ART-1", item_name="Article", qty=4, uom="Unité", parent="SO-1", idx=1),
					frappe._dict(item_code="ART-FREE", item_name="Cadeau", qty=1, uom="Unité", parent="SO-1", idx=2, is_free_item=1),
				]
			return []

		item_row = frappe._dict(name="ART-1", item_name="Article", description="", item_group="Boissons", stock_uom="Unité", image=None)
		with patch.object(client_portal, "_current_portal_customer", return_value=("CUST-1", user)), patch.object(
			client_portal, "_customer_data", return_value=frappe._dict()
		), patch.object(client_portal, "_company", return_value="IntraPro"), patch.object(
			client_portal, "_currency", return_value="DZD"
		), patch.object(client_portal.frappe, "get_all", side_effect=fake_get_all), patch.object(
			client_portal.frappe.db, "has_column", return_value=True
		), patch("log.services.portal_merchandising.fetch_item_rows", return_value={"ART-1": item_row}), patch(
			"log.services.portal_merchandising.campaigns_by_item", return_value={}
		), patch("log.services.portal_merchandising.serialize_item_row", return_value={"itemCode": "ART-1", "itemName": "Article", "currency": "DZD", "showPrice": True, "unitPriceTtc": 10}), patch(
			"log.services.portal_merchandising.apply_prices"
		):
			result = client_portal.get_recent_order_items()

		self.assertEqual(captured["Sales Order"][0]["filters"]["customer"], "CUST-1")
		self.assertEqual(result["items"][0]["itemCode"], "ART-1")
		self.assertEqual(result["items"][0]["lastQuantity"], 4)
		self.assertEqual(len(result["items"]), 1)

	def test_store_price_is_hidden_when_the_item_flag_is_off(self):
		with patch.object(
			client_portal, "_item_has_column", side_effect=lambda field: field == client_portal.STORE_SHOW_PRICE_FIELD
		):
			self.assertFalse(client_portal._shows_store_price(frappe._dict(custom_afficher_prix_store=0)))
			self.assertTrue(client_portal._shows_store_price(frappe._dict(custom_afficher_prix_store=1)))
		with patch.object(client_portal, "_item_has_column", return_value=False):
			self.assertTrue(client_portal._shows_store_price(frappe._dict(custom_afficher_prix_store=0)))

	def test_order_preview_includes_item_images(self):
		order = frappe._dict(
			items=[frappe._dict(item_code="ART-1", item_name="Article", qty=2, uom="Unité", amount=200, net_amount=200)],
			total_qty=2,
			rounded_total=200,
			grand_total=200,
			currency="DZD",
			delivery_date="2026-08-28",
		)
		with patch.object(client_portal, "_item_totals_ttc", return_value={"ART-1": 200.0}), patch.object(
			client_portal, "_item_images", return_value={"ART-1": "/files/art.png"}
		):
			preview = client_portal._preview(order)
		self.assertEqual(preview["items"][0]["image"], "/files/art.png")
		self.assertEqual(preview["items"][0]["itemCode"], "ART-1")

	def test_customer_gps_audit_fields_are_saved(self):
		db = Mock()
		db.has_column.return_value = True
		fake = SimpleNamespace(db=db, session=SimpleNamespace(user="client@example.com"))
		with patch.object(client_portal, "frappe", fake), patch.object(client_portal, "now_datetime", return_value="2026-08-28 10:00:00"):
			coordinates = client_portal._save_customer_gps("CUST-1", {"latitude": 36.75, "longitude": 3.05, "accuracy": 20})
		self.assertEqual(coordinates, "36.75000000,3.05000000")
		values = db.set_value.call_args.args[2]
		self.assertEqual(values["custom_gps_precision_m"], 20)
		self.assertEqual(values["custom_gps_capture_user"], "client@example.com")

	def test_portal_customer_payload_falls_back_to_user_contact(self):
		customer = frappe._dict(name="CUST-1", customer_name="Client test")
		user = frappe._dict(name="client@example.com", email="client@example.com", mobile_no="0550123456")
		with patch.object(client_portal, "_commune_label", return_value=None):
			payload = client_portal._portal_customer_payload(customer, user)
		self.assertEqual(payload["email"], "client@example.com")
		self.assertEqual(payload["phone"], "0550123456")

	def test_profile_update_copies_wilaya_from_commune(self):
		user = frappe._dict(name="client@example.com", email="client@example.com")
		customer = SimpleNamespace(
			meta=SimpleNamespace(has_field=lambda _field: True),
			flags=SimpleNamespace(),
			save=Mock(),
		)
		updated = frappe._dict(
			name="CUST-1",
			customer_name="CLIENT 2",
			mobile_no="0550000000",
			email_id="client@test.com",
			custom_commune="COM-1",
			custom_wilaya="Alger",
		)
		with patch.object(client_portal, "_current_portal_customer", return_value=("CUST-1", user)), patch.object(
			client_portal, "_resolve_commune", return_value=frappe._dict(name="COM-1", nom="Alger Centre", wilaya="Alger")
		), patch.object(client_portal.frappe, "get_doc", return_value=customer), patch.object(
			client_portal.frappe.db, "set_value"
		) as set_value, patch.object(client_portal, "_customer_data", return_value=updated), patch.object(
			client_portal, "_commune_label", return_value="Alger Centre"
		):
			result = client_portal.update_customer_profile(
				{
					"fullName": "Amine Test",
					"email": "client@test.com",
					"phone": "0550000000",
					"commune": "COM-1",
					"wilaya": "Oran",
					"name": "HACKED",
				}
			)
		self.assertEqual(customer.custom_commune, "COM-1")
		self.assertEqual(customer.custom_wilaya, "Alger")
		self.assertEqual(customer.mobile_no, "0550000000")
		self.assertNotEqual(getattr(customer, "name", None), "HACKED")
		set_value.assert_called_once_with("User", "client@example.com", "full_name", "Amine Test", update_modified=False)
		self.assertEqual(result["customer"]["wilaya"], "Alger")
		self.assertEqual(result["customer"]["communeName"], "Alger Centre")

	def test_customer_image_attaches_to_customer_not_contact(self):
		user = frappe._dict(name="client@example.com", email="client@example.com")
		file_doc = Mock()
		file_doc.file_url = "/files/shop.jpg"
		file_doc.insert.return_value = file_doc
		updated = frappe._dict(name="CUST-1", customer_name="CLIENT 2", image="/files/shop.jpg")
		with patch.object(client_portal, "_current_portal_customer", return_value=("CUST-1", user)), patch.object(
			client_portal.frappe, "get_doc", return_value=file_doc
		) as get_doc, patch.object(client_portal.frappe.db, "set_value") as set_value, patch.object(
			client_portal, "_customer_data", return_value=updated
		), patch.object(client_portal, "_commune_label", return_value=None):
			result = client_portal.update_customer_image(
				{"imageData": "data:image/jpeg;base64,QQ==", "filename": "shop.jpg"}
			)
		payload = get_doc.call_args.args[0]
		self.assertEqual(payload["doctype"], "File")
		self.assertEqual(payload["attached_to_doctype"], "Customer")
		self.assertEqual(payload["attached_to_name"], "CUST-1")
		self.assertEqual(payload["attached_to_field"], "image")
		self.assertNotEqual(payload["attached_to_doctype"], "Contact")
		set_value.assert_called_once_with("Customer", "CUST-1", "image", "/files/shop.jpg")
		self.assertEqual(result["customer"]["image"], "/files/shop.jpg")

	def test_profile_update_rejects_unknown_commune(self):
		user = frappe._dict(name="client@example.com", email="client@example.com")
		db = Mock()
		db.get_value.return_value = None
		with patch.object(client_portal, "_current_portal_customer", return_value=("CUST-1", user)), patch.object(
			client_portal.frappe, "db", db
		), patch.object(client_portal, "_", lambda value: value), patch.object(
			client_portal.frappe, "throw", side_effect=_raise
		), self.assertRaises(frappe.ValidationError):
			client_portal.update_customer_profile({"fullName": "Amine", "commune": "UNKNOWN"})


class TestClientPortalStatuses(unittest.TestCase):
	def test_order_status_hides_billing_and_uses_delivery_progress(self):
		self.assertEqual(
			client_portal._portal_order_status(frappe._dict(docstatus=0, status="Draft", per_delivered=0)),
			"En attente de validation",
		)
		self.assertEqual(
			client_portal._portal_order_status(frappe._dict(docstatus=1, status="To Deliver and Bill", per_delivered=0)),
			"À livrer",
		)
		self.assertEqual(
			client_portal._portal_order_status(frappe._dict(docstatus=1, status="To Deliver and Bill", per_delivered=40)),
			"Partiellement Livré",
		)
		self.assertEqual(
			client_portal._portal_order_status(frappe._dict(docstatus=1, status="To Bill", per_delivered=100)),
			"Livré",
		)
		self.assertEqual(
			client_portal._portal_order_status(frappe._dict(docstatus=1, status="Completed", per_delivered=100)),
			"Livré",
		)
		self.assertEqual(
			client_portal._portal_order_status(frappe._dict(docstatus=2, status="Cancelled", per_delivered=0)),
			"Annulé",
		)
		self.assertEqual(
			client_portal._portal_order_status(frappe._dict(docstatus=1, status="Closed", per_delivered=50)),
			"Clôturé",
		)
		self.assertEqual(
			client_portal._portal_order_status(frappe._dict(docstatus=1, status="On Hold", per_delivered=0)),
			"En pause",
		)
		self.assertEqual(
			client_portal._portal_order_status(
				frappe._dict(docstatus=1, status="To Deliver and Bill", per_delivered=0),
				in_progress=True,
			),
			"Livraison en cours",
		)

	def test_delivery_status_shows_in_progress_when_driver_started_the_route(self):
		db = Mock()
		db.get_value.return_value = "En cours"
		doc = frappe._dict(
			custom_statut="Enlevé",
			custom_statut_planification="En cours",
			custom_tournee="LIV-1",
			status="Draft",
			docstatus=0,
		)
		with patch.object(client_portal.frappe, "db", db):
			self.assertEqual(client_portal._portal_delivery_status(doc), "Livraison en cours")
		db.get_value.assert_called_once_with("Livraison", "LIV-1", "etat_planification")

	def test_delivery_status_keeps_operational_status_before_route_start(self):
		db = Mock()
		db.get_value.return_value = "Publiée"
		doc = frappe._dict(
			custom_statut="Enlevé",
			custom_statut_planification="En cours",
			custom_tournee="LIV-1",
			status="Draft",
			docstatus=0,
		)
		with patch.object(client_portal.frappe, "db", db):
			self.assertEqual(client_portal._portal_delivery_status(doc), "Enlevé")

	def test_in_progress_orders_come_from_started_routes(self):
		db = Mock()
		db.exists.return_value = True
		db.sql.return_value = [("SAL-ORD-2026-00005",), ("SAL-ORD-2026-00006",)]
		with patch.object(client_portal.frappe, "db", db):
			self.assertEqual(
				client_portal._in_progress_order_ids("CUST-1"),
				["SAL-ORD-2026-00005", "SAL-ORD-2026-00006"],
			)

	def test_serialized_order_exposes_portal_status_not_erpnext_billing_status(self):
		order = frappe._dict(
			name="SO-1",
			transaction_date="2026-08-20",
			delivery_date="2026-08-22",
			status="To Deliver and Bill",
			docstatus=1,
			per_delivered=35,
			total_qty=10,
			rounded_total=1000,
			grand_total=1000,
			currency="DZD",
			modified="2026-08-22 10:00:00",
			custom_origine_commande="Portail client",
		)
		serialized = client_portal._serialize_order(order)
		self.assertEqual(serialized["status"], "Partiellement Livré")
		self.assertNotIn("factur", serialized["status"].lower())

	def test_serialized_order_exposes_quantities_actually_delivered(self):
		order = frappe._dict(
			name="SO-PARTIAL",
			customer="CUST-1",
			transaction_date="2026-08-20",
			delivery_date="2026-08-22",
			status="To Deliver and Bill",
			docstatus=1,
			per_delivered=50,
			total_qty=12,
			rounded_total=11232,
			grand_total=11232,
			currency="DZD",
			modified="2026-08-22 10:00:00",
			custom_origine_commande="Portail client",
			items=[
				frappe._dict(
					item_code="ART-1",
					item_name="Biomil",
					qty=12,
					delivered_qty=6,
					uom="N°",
					amount=9600,
					net_amount=9600,
				)
			],
		)
		with patch.object(client_portal, "_item_totals_ttc", return_value={"ART-1": 11232.0}), patch.object(
			client_portal, "_item_images", return_value={}
		), patch.object(
			client_portal, "_linked_delivery_notes", return_value=[{"name": "MAT-DN-1", "status": "Partiellement Livré"}]
		):
			serialized = client_portal._serialize_order(order, include_items=True)
		item = serialized["items"][0]
		self.assertEqual(item["quantity"], 12)
		self.assertEqual(item["deliveredQuantity"], 6)
		self.assertEqual(item["remainingQuantity"], 6)
		self.assertEqual(item["deliveredLineTotalTtc"], 5616.0)
		self.assertEqual(serialized["deliveredQuantity"], 6)
		self.assertEqual(serialized["remainingQuantity"], 6)
		self.assertEqual(serialized["deliveredTotalTtc"], 5616.0)
		self.assertEqual(serialized["deliveries"][0]["name"], "MAT-DN-1")

	def test_linked_delivery_notes_keep_same_customer_only(self):
		order = frappe._dict(name="SO-1", customer="CUST-1")
		own_note = frappe._dict(name="DN-OWN", customer="CUST-1")
		other_note = frappe._dict(name="DN-OTHER", customer="CUST-2")
		db = Mock()
		db.sql_list.return_value = ["DN-OWN", "DN-OTHER"]
		with patch.object(client_portal.frappe, "db", db), patch.object(
			client_portal.frappe, "get_doc", side_effect=[own_note, other_note]
		), patch.object(
			client_portal, "_serialize_delivery_note", side_effect=lambda doc: {"name": doc.name}
		):
			notes = client_portal._linked_delivery_notes(order)
		self.assertEqual(notes, [{"name": "DN-OWN"}])

	def test_delivery_status_prefers_operational_status_and_hides_billing(self):
		self.assertEqual(
			client_portal._portal_delivery_status(frappe._dict(custom_statut="Partiellement Livré", status="To Bill", docstatus=1)),
			"Partiellement Livré",
		)
		self.assertEqual(
			client_portal._portal_delivery_status(frappe._dict(custom_statut=None, status="To Bill", docstatus=1)),
			"Livré",
		)
		self.assertEqual(
			client_portal._portal_delivery_status(frappe._dict(custom_statut=None, status="Completed", docstatus=1)),
			"Livré",
		)
		self.assertEqual(
			client_portal._portal_delivery_status(frappe._dict(custom_statut="Livré", custom_tournee="LIV-1", status="To Bill", docstatus=1)),
			"Livré",
		)

	def test_serialized_delivery_note_omits_invoice(self):
		doc = frappe._dict(
			name="DN-1",
			posting_date="2026-08-22",
			custom_date_de_livraison="2026-08-22",
			custom_statut="Livré",
			status="To Bill",
			docstatus=1,
			total_qty=4,
			rounded_total=400,
			grand_total=400,
			currency="DZD",
			custom_sales_invoice="SINV-1",
		)
		serialized = client_portal._serialize_delivery_note(doc)
		self.assertEqual(serialized["status"], "Livré")
		self.assertNotIn("salesInvoice", serialized)

	def test_serialized_delivery_note_exposes_linked_sales_orders(self):
		doc = frappe._dict(
			name="DN-1",
			posting_date="2026-08-22",
			custom_statut="Partiellement Livré",
			status="To Bill",
			docstatus=1,
			total_qty=6,
			rounded_total=5616,
			grand_total=5616,
			currency="DZD",
			items=[
				frappe._dict(against_sales_order="SAL-ORD-2026-00003", item_code="ART-1"),
				frappe._dict(against_sales_order="SAL-ORD-2026-00003", item_code="ART-2"),
				frappe._dict(against_sales_order="SAL-ORD-2026-00004", item_code="ART-3"),
			],
		)
		serialized = client_portal._serialize_delivery_note(doc)
		self.assertEqual(serialized["salesOrders"], ["SAL-ORD-2026-00003", "SAL-ORD-2026-00004"]		)


class TestClientPortalOrderList(unittest.TestCase):
	def test_order_sort_clause_whitelists_known_keys(self):
		self.assertEqual(client_portal._order_sort_clause(None), "transaction_date desc, creation desc")
		self.assertEqual(client_portal._order_sort_clause("date_asc"), "transaction_date asc, creation asc")
		self.assertEqual(client_portal._order_sort_clause("delivery_desc"), "delivery_date desc, transaction_date desc")
		self.assertEqual(client_portal._order_sort_clause("delivery_asc"), "delivery_date asc, transaction_date asc")
		self.assertEqual(client_portal._order_sort_clause("amount_desc"), "grand_total desc, transaction_date desc")
		self.assertEqual(client_portal._order_sort_clause("amount_asc"), "grand_total asc, transaction_date asc")
		self.assertEqual(client_portal._order_sort_clause("injection"), "transaction_date desc, creation desc")

	def test_order_status_filters_match_portal_labels(self):
		self.assertEqual(client_portal._order_status_filters("En attente de validation", []), {"docstatus": 0})
		self.assertEqual(client_portal._order_status_filters("Annulé", []), {"docstatus": 2})
		self.assertIsNone(client_portal._order_status_filters("Livraison en cours", []))
		in_progress = client_portal._order_status_filters("Livraison en cours", ["SO-1"])
		self.assertEqual(in_progress["name"], ["in", ["SO-1"]])
		partial = client_portal._order_status_filters("Partiellement Livré", ["SO-9"])
		self.assertEqual(partial["per_delivered"], ["between", [0.0001, 99.9999]])
		self.assertEqual(partial["name"], ["not in", ["SO-9"]])
		to_deliver = client_portal._order_status_filters("À livrer", [])
		self.assertEqual(to_deliver["per_delivered"], 0)
		self.assertNotIn("name", to_deliver)

	def test_order_list_filters_combine_search_source_and_dates(self):
		db = SimpleNamespace(has_column=lambda doctype, field: doctype == "Sales Order" and field == "custom_origine_commande")
		with patch.object(client_portal.frappe, "db", db):
			query = client_portal._order_list_filters(
				"CUST-1",
				search="SAL-ORD",
				status="Livré",
				source="Portail client",
				from_date="2026-08-01",
				to_date="2026-08-31",
			)
		self.assertIsNotNone(query)
		filters, or_filters = query
		self.assertEqual(filters["customer"], "CUST-1")
		self.assertEqual(filters["custom_origine_commande"], "Portail client")
		self.assertEqual(filters["docstatus"], 1)
		self.assertEqual(or_filters, [["name", "like", "%SAL-ORD%"]])
		self.assertEqual(filters["transaction_date"][0], "between")

	def test_interne_source_includes_blank_desk_origin(self):
		db = SimpleNamespace(has_column=lambda doctype, field: doctype == "Sales Order" and field == "custom_origine_commande")
		with patch.object(client_portal.frappe, "db", db):
			query = client_portal._order_list_filters("CUST-1", source="Interne")
		self.assertIsNotNone(query)
		filters, _or_filters = query
		self.assertEqual(filters["custom_origine_commande"], ["in", ["Interne", ""]])

	def test_get_orders_passes_filters_and_sort_to_query(self):
		user = frappe._dict(name="client@example.com")
		captured = {}

		def fake_get_all(doctype, **kwargs):
			captured.update(kwargs)
			return []

		db = SimpleNamespace(has_column=lambda *_args: True)
		with patch.object(client_portal, "_current_portal_customer", return_value=("CUST-1", user)), patch.object(
			client_portal, "_in_progress_order_ids", return_value=["SO-LIVE"]
		), patch.object(client_portal.frappe, "db", db), patch.object(
			client_portal.frappe, "get_all", side_effect=fake_get_all
		):
			result = client_portal.get_orders(
				search="SAL",
				status="À livrer",
				source="Interne",
				from_date="2026-08-01",
				order_by="amount_desc",
			)
		self.assertEqual(result["items"], [])
		self.assertFalse(result["hasNext"])
		self.assertEqual(captured["order_by"], "grand_total desc, transaction_date desc")
		self.assertEqual(captured["filters"]["custom_origine_commande"], ["in", ["Interne", ""]])
		self.assertEqual(captured["filters"]["name"], ["not in", ["SO-LIVE"]])
		self.assertEqual(captured["or_filters"], [["name", "like", "%SAL%"]])

	def test_get_orders_returns_empty_when_in_progress_status_has_no_match(self):
		user = frappe._dict(name="client@example.com")
		with patch.object(client_portal, "_current_portal_customer", return_value=("CUST-1", user)), patch.object(
			client_portal, "_in_progress_order_ids", return_value=[]
		), patch.object(client_portal.frappe, "get_all") as get_all:
			result = client_portal.get_orders(status="Livraison en cours")
		get_all.assert_not_called()
		self.assertEqual(result["items"], [])
		self.assertFalse(result["hasNext"])


class TestClientPortalDeliveryList(unittest.TestCase):
	def test_delivery_sort_clause_whitelists_known_keys(self):
		self.assertEqual(client_portal._delivery_sort_clause(None), "posting_date desc, creation desc")
		self.assertEqual(client_portal._delivery_sort_clause("qty_asc"), "total_qty asc, posting_date asc")
		self.assertEqual(client_portal._delivery_sort_clause("amount_desc"), "grand_total desc, posting_date desc")
		self.assertEqual(client_portal._delivery_sort_clause("injection"), "posting_date desc, creation desc")

	def test_delivery_status_filters_match_portal_labels(self):
		db = SimpleNamespace(has_column=lambda doctype, field: doctype == "Delivery Note" and field == "custom_statut")
		with patch.object(client_portal.frappe, "db", db):
			self.assertIsNone(client_portal._delivery_status_filters("Livraison en cours", []))
			in_progress = client_portal._delivery_status_filters("Livraison en cours", ["DN-1"])
			self.assertEqual(in_progress["name"], ["in", ["DN-1"]])
			enleve = client_portal._delivery_status_filters("Enlevé", ["DN-LIVE"])
			self.assertEqual(enleve["custom_statut"], "Enlevé")
			self.assertEqual(enleve["name"], ["not in", ["DN-LIVE"]])
			livre = client_portal._delivery_status_filters("Livré", ["DN-LIVE"])
			self.assertEqual(livre["custom_statut"], "Livré")
			self.assertNotIn("name", livre)

	def test_delivery_list_filters_combine_search_and_dates(self):
		db = SimpleNamespace(
			has_column=lambda *_args: True,
			sql_list=lambda *_args, **_kwargs: ["DN-SO"],
		)
		with patch.object(client_portal.frappe, "db", db):
			query = client_portal._delivery_list_filters(
				"CUST-1",
				search="SAL-ORD",
				status="Livré",
				from_date="2026-08-01",
				to_date="2026-08-31",
			)
		self.assertIsNotNone(query)
		filters, or_filters = query
		self.assertEqual(filters["customer"], "CUST-1")
		self.assertEqual(filters["custom_statut"], "Livré")
		self.assertEqual(filters["posting_date"][0], "between")
		self.assertEqual(or_filters[0], ["name", "like", "%SAL-ORD%"])
		self.assertEqual(or_filters[1], ["name", "in", ["DN-SO"]])

	def test_get_delivery_notes_passes_filters_and_sort_to_query(self):
		user = frappe._dict(name="client@example.com")
		captured = {}

		def fake_get_all(doctype, **kwargs):
			captured.update(kwargs)
			return []

		db = SimpleNamespace(has_column=lambda *_args: True, exists=lambda *_args: True, sql_list=lambda *_args, **_kwargs: [])
		with patch.object(client_portal, "_current_portal_customer", return_value=("CUST-1", user)), patch.object(
			client_portal, "_in_progress_delivery_ids", return_value=["DN-LIVE"]
		), patch.object(client_portal.frappe, "db", db), patch.object(
			client_portal.frappe, "get_all", side_effect=fake_get_all
		):
			result = client_portal.get_delivery_notes(
				search="MAT",
				status="Enlevé",
				from_date="2026-08-01",
				order_by="qty_desc",
			)
		self.assertEqual(result["items"], [])
		self.assertEqual(captured["order_by"], "total_qty desc, posting_date desc")
		self.assertEqual(captured["filters"]["custom_statut"], "Enlevé")
		self.assertEqual(captured["filters"]["name"], ["not in", ["DN-LIVE"]])
		self.assertEqual(captured["or_filters"], [["name", "like", "%MAT%"]])


class TestClientPortalAccounting(unittest.TestCase):
	def test_balance_preserves_debit_zero_and_credit(self):
		for raw, expected in ((500, 500.0), (0, 0.0), (-120, -120.0)):
			db = Mock()
			db.sql.return_value = [frappe._dict(company="IntraPro", currency="DZD", balance=raw)]
			with patch.object(client_portal.frappe, "db", db):
				rows = client_portal._balance_rows("CUST-1")
			self.assertEqual(rows[0]["amount"], expected)


if __name__ == "__main__":
	unittest.main()
