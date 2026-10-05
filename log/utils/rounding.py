"""Arrondi des totaux : les documents de vente suivent le réglage « Disable Rounded Total » global."""

import frappe
from frappe.utils import cint


def rounding_disabled() -> int:
	return cint(frappe.db.get_single_value("Global Defaults", "disable_rounded_total"))
