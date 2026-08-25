# Copyright (c) 2026, IntraPro and contributors

import frappe

LOGO_URL = "/assets/log/images/intrapro-mark.png"


def execute():
	"""Pointe le raccourci Desk vers le pictogramme PNG IntraPro."""
	for name in frappe.get_all(
		"Desktop Icon",
		filters={"label": "IntraPro Distribution"},
		pluck="name",
	):
		frappe.db.set_value("Desktop Icon", name, "logo_url", LOGO_URL, update_modified=False)
