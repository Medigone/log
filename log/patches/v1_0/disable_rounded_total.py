"""Désactive l'arrondi des totaux (commandes, BL, factures) : le TTC reste au centime."""

import frappe


def execute():
	global_defaults = frappe.get_single("Global Defaults")
	if global_defaults.disable_rounded_total:
		return
	global_defaults.disable_rounded_total = 1
	global_defaults.flags.ignore_permissions = True
	global_defaults.save()
