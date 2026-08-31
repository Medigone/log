# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe.utils import cstr

from log.api.client_portal import _current_portal_customer, _page_args, _payload
from log.services import catalog_requests as service


@frappe.whitelist(methods=["POST"])
def create_catalog_request(payload):
	customer, user = _current_portal_customer()
	return service.create_request(customer, user.name, _payload(payload))


@frappe.whitelist()
def get_catalog_requests(
	page=1,
	page_length=20,
	status=None,
	search=None,
	from_date=None,
	to_date=None,
	order_by=None,
):
	customer, _user = _current_portal_customer()
	page_number, length, _offset = _page_args(page, page_length)
	return service.list_requests(
		customer,
		page=page_number,
		page_length=length,
		status=status,
		search=search,
		from_date=from_date,
		to_date=to_date,
		order_by=order_by,
	)


@frappe.whitelist()
def get_catalog_request(request_id):
	customer, _user = _current_portal_customer()
	doc = service.owned_request(cstr(request_id), customer)
	return service.serialize_request(doc, include_items=True)


@frappe.whitelist(methods=["POST"])
def cancel_catalog_request(payload):
	customer, _user = _current_portal_customer()
	data = _payload(payload)
	return service.cancel_request(customer, cstr(data.get("requestId") or data.get("name")))


@frappe.whitelist()
def create_sales_order_from_request(name):
	return service.create_sales_order(cstr(name))


@frappe.whitelist()
def refuse_catalog_request(name, reason):
	return service.refuse_request(cstr(name), reason)
