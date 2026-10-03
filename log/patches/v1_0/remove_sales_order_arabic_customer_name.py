# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

import json

import frappe


DOCTYPE = "Sales Order"
FIELDNAME = "customer_name_in_arabic"


def execute():
	_remove_field_property_setters()
	_remove_custom_field()
	_remove_field_from_order()
	frappe.clear_cache(doctype=DOCTYPE)


def _remove_field_property_setters():
	property_setters = frappe.get_all(
		"Property Setter",
		filters={"doc_type": DOCTYPE, "field_name": FIELDNAME},
		pluck="name",
	)
	for name in property_setters:
		frappe.delete_doc("Property Setter", name, force=1, ignore_permissions=True)


def _remove_custom_field():
	name = f"{DOCTYPE}-{FIELDNAME}"
	if frappe.db.exists("Custom Field", name):
		frappe.delete_doc("Custom Field", name, force=1, ignore_permissions=True)


def _remove_field_from_order():
	property_setters = frappe.get_all(
		"Property Setter",
		filters={
			"doc_type": DOCTYPE,
			"doctype_or_field": "DocType",
			"property": "field_order",
		},
		fields=["name", "value"],
	)
	for property_setter in property_setters:
		field_order = json.loads(property_setter.value or "[]")
		if FIELDNAME not in field_order:
			continue
		field_order.remove(FIELDNAME)
		frappe.db.set_value(
			"Property Setter",
			property_setter.name,
			"value",
			json.dumps(field_order),
			update_modified=False,
		)
