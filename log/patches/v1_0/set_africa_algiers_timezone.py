"""Aligne le fuseau système sur l'Algérie si le défaut Frappe (Kolkata) est encore actif."""

import frappe

FRAPPE_DEFAULT_TIMEZONE = "Asia/Kolkata"
COMPANY_TIMEZONE = "Africa/Algiers"


def execute():
	current = frappe.db.get_single_value("System Settings", "time_zone")
	if current and current != FRAPPE_DEFAULT_TIMEZONE:
		return
	frappe.db.set_single_value("System Settings", "time_zone", COMPANY_TIMEZONE)
	frappe.clear_cache()
