# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Nettoie les Property Setters Flow laissés après désinstallation de l'app."""

import frappe


def execute():
	for name in ("Flow Model-api_key-length", "Flow Provider-api_key-length"):
		if frappe.db.exists("Property Setter", name):
			frappe.delete_doc("Property Setter", name, force=1, ignore_permissions=True)
