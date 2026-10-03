# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

import json

import frappe


DOCTYPE = "Sales Order Item"
FIELDNAMES = ("tax_code", "tax_rate", "tax_amount", "total_amount")


def execute():
	_remove_field_property_setters()
	_remove_custom_fields()
	_remove_fields_from_order()
	frappe.clear_cache(doctype=DOCTYPE)


def _remove_field_property_setters():
	property_setters = frappe.get_all(
		"Property Setter",
		filters={"doc_type": DOCTYPE, "field_name": ["in", FIELDNAMES]},
		pluck="name",
	)
	for name in property_setters:
		frappe.delete_doc("Property Setter", name, force=1, ignore_permissions=True)


def _remove_custom_fields():
	custom_fields = frappe.get_all(
		"Custom Field",
		filters={"dt": DOCTYPE, "fieldname": ["in", FIELDNAMES]},
		pluck="name",
	)
	for name in custom_fields:
		frappe.delete_doc("Custom Field", name, force=1, ignore_permissions=True)


def _remove_fields_from_order():
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
		cleaned_field_order = [field for field in field_order if field not in FIELDNAMES]
		if cleaned_field_order == field_order:
			continue
		frappe.db.set_value(
			"Property Setter",
			property_setter.name,
			"value",
			json.dumps(cleaned_field_order),
			update_modified=False,
		)
