# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Autorise les clés OpenAI (~164 caractères) sur les champs Password de Flow."""

import frappe

API_KEY_LENGTH = "512"
DOCTYPES = ("Flow Model", "Flow Provider")


def execute():
	for doctype in DOCTYPES:
		if not frappe.db.exists("DocType", doctype):
			continue
		if not frappe.db.exists("DocField", {"parent": doctype, "fieldname": "api_key"}):
			continue
		_set_api_key_length(doctype)
		frappe.clear_cache(doctype=doctype)


def _set_api_key_length(doctype: str) -> None:
	existing = frappe.db.exists(
		"Property Setter",
		{"doc_type": doctype, "field_name": "api_key", "property": "length"},
	)
	if existing:
		frappe.db.set_value("Property Setter", existing, "value", API_KEY_LENGTH)
		return

	frappe.make_property_setter(
		{
			"doctype": doctype,
			"doctype_or_field": "DocField",
			"fieldname": "api_key",
			"property": "length",
			"value": API_KEY_LENGTH,
			"property_type": "Int",
		},
		validate_fields_for_doctype=False,
		is_system_generated=False,
		module="Log",
	)
