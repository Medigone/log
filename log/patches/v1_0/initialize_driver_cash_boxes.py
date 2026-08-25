"""Crée une caisse à solde zéro pour chaque livreur existant."""

import frappe


def execute():
	if not frappe.db.table_exists("tabCaisse Livreur") or not frappe.db.table_exists("tabLivreur"):
		return
	from log.services.distribution_driver_cash import ensure_cash_box

	for name in frappe.get_all("Livreur", pluck="name"):
		ensure_cash_box(name)
