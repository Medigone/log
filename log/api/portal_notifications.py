# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe.utils import cint, cstr

from log.api.client_portal import _current_portal_customer, _page_args, _payload
from log.services import portal_notifications as service

CATEGORIES = service.CATEGORIES


@frappe.whitelist()
def list_notifications(page=1, page_length=20, only_unread=0):
	customer, user = _current_portal_customer()
	page_number, length, _offset = _page_args(page, page_length)
	return service.list_notifications(
		customer,
		user.name,
		page=page_number,
		page_length=length,
		only_unread=bool(cint(only_unread)),
	)


@frappe.whitelist()
def unread_count():
	customer, user = _current_portal_customer()
	return {"unreadCount": service.unread_count(customer, user.name)}


@frappe.whitelist(methods=["POST"])
def mark_read(payload):
	customer, user = _current_portal_customer()
	data = _payload(payload)
	name = cstr(data.get("name") or data.get("notificationId"))
	item = service.mark_read(customer, user.name, name)
	return {"notification": item, "unreadCount": service.unread_count(customer, user.name)}


@frappe.whitelist(methods=["POST"])
def mark_all_read(payload=None):
	customer, user = _current_portal_customer()
	result = service.mark_all_read(customer, user.name)
	result["unreadCount"] = 0
	return result


@frappe.whitelist()
def get_preferences():
	customer, _user = _current_portal_customer()
	return {"categories": service.get_preference_values(customer)}


@frappe.whitelist(methods=["POST"])
def update_preferences(payload):
	customer, _user = _current_portal_customer()
	data = _payload(payload)
	raw = data.get("categories") if isinstance(data.get("categories"), dict) else data
	doc = service.get_or_create_preferences(customer)
	changed = False
	for category in CATEGORIES:
		if category not in raw:
			continue
		value = 1 if cint(raw.get(category)) else 0
		if cint(doc.get(category)) != value:
			doc.set(category, value)
			changed = True
	if changed:
		doc.save(ignore_permissions=True)
	return {"categories": service.get_preference_values(customer)}


@frappe.whitelist()
def get_push_config():
	_current_portal_customer()
	from log.services.portal_push import get_push_config as config

	return config()


@frappe.whitelist(methods=["POST"])
def subscribe_push(payload):
	customer, user = _current_portal_customer()
	from log.services.portal_push import upsert_subscription

	data = _payload(payload)
	keys = data.get("keys") if isinstance(data.get("keys"), dict) else data
	name = upsert_subscription(
		user.name,
		customer,
		cstr(data.get("endpoint")),
		cstr(keys.get("p256dh") or data.get("p256dh")),
		cstr(keys.get("auth") or data.get("auth")),
		cstr(data.get("userAgent") or data.get("user_agent")),
	)
	return {"success": True, "name": name}


@frappe.whitelist(methods=["POST"])
def unsubscribe_push(payload):
	_customer, user = _current_portal_customer()
	from log.services.portal_push import disable_subscription

	data = _payload(payload)
	return disable_subscription(user.name, cstr(data.get("endpoint")))
