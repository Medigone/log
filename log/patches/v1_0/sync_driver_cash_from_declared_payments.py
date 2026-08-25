"""Impute les encaissements espèces déjà déclarés sur la caisse livreur."""

import frappe


def execute():
	if not frappe.db.table_exists("Mouvement Caisse Livreur"):
		return
	if not frappe.db.has_column("Mouvement Caisse Livreur", "paiement"):
		return
	from log.services.distribution_driver_cash import sync_all_declared_cash

	sync_all_declared_cash()
