# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

import frappe

_MARKERS = (
	"can_create_colis",
	"create_colis",
	"get_colis_for_delivery_note",
	"get_unpacked_items",
	"log.delivery_note_hooks",
	"Créer Colis",
)


def execute():
	"""Disable leftover Desk Client Scripts that still call the removed Colis APIs."""
	if not frappe.db.table_exists("Client Script"):
		return

	scripts = frappe.get_all(
		"Client Script",
		filters={"dt": "Delivery Note"},
		fields=["name", "script", "enabled"],
	)
	for script in scripts:
		body = script.script or ""
		if not any(marker in body for marker in _MARKERS):
			continue
		if script.enabled:
			frappe.db.set_value("Client Script", script.name, "enabled", 0)
		print(f"Disabled Client Script '{script.name}' (Colis)")

	frappe.clear_cache()
