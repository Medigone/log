"""Enregistre l'affectation actuelle de chaque livreur comme point de départ d'audit."""

import frappe


def execute():
	if not frappe.db.exists("DocType", "Historique Affectation Flotte"):
		return
	if not frappe.db.table_exists("tabLivreur"):
		return
	from log.services.distribution_fleet import seed_current_fleet_assignments

	seed_current_fleet_assignments()
