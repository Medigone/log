# Copyright (c) 2026, IntraPro and contributors

import frappe

LOGO_URL = "/assets/log/images/intrapro-mark.png"


def execute():
	"""Aligne le raccourci Desk et le logo d'app sur le pictogramme IntraPro."""
	for name in frappe.get_all(
		"Desktop Icon",
		filters={"label": "IntraPro Distribution"},
		pluck="name",
	):
		frappe.db.set_value("Desktop Icon", name, "logo_url", LOGO_URL, update_modified=False)
