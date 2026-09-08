# Copyright (c) 2026, IntraPro and contributors

import frappe

from log.auth import SITE_TITLE


def execute():
	"""Aligne le nom affiché du site (onglet, login, Desk) sur Modern Pharma."""
	if frappe.db.get_single_value("Website Settings", "app_name") != SITE_TITLE:
		frappe.db.set_single_value("Website Settings", "app_name", SITE_TITLE)
	if frappe.db.get_single_value("System Settings", "app_name") != SITE_TITLE:
		frappe.db.set_single_value("System Settings", "app_name", SITE_TITLE)
