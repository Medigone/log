# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Supprime les clés API tronquées restées sur Flow Model quand un Provider est lié."""

import frappe
from frappe.utils.password import remove_encrypted_password


def execute():
	if not frappe.db.exists("DocType", "Flow Model"):
		return

	for row in frappe.get_all("Flow Model", fields=["name", "provider"]):
		if not row.provider:
			continue
		remove_encrypted_password("Flow Model", row.name, "api_key")
		if frappe.db.has_column("Flow Model", "api_key"):
			frappe.db.set_value("Flow Model", row.name, "api_key", None, update_modified=False)

	frappe.clear_cache(doctype="Flow Model")
	frappe.clear_cache(doctype="Flow Provider")
