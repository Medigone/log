# Copyright (c) 2026, IntraPro and contributors

import frappe


def execute():
	"""Supprime uniquement l'ancien raccourci Desk Log qui pointait vers /Colis."""
	legacy = frappe.db.get_value("Desktop Icon", "Log", ["name", "link"], as_dict=True)
	if legacy and str(legacy.link or "").lower().startswith("/colis"):
		frappe.delete_doc("Desktop Icon", legacy.name, ignore_permissions=True, force=True)
