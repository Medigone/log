# Copyright (c) 2026, IntraPro and contributors

import frappe

from log.install import ensure_distribution_roles


def execute():
	"""Initialise le cycle de planification sans modifier les BL ni leurs anciens QR."""
	ensure_distribution_roles()
	if not frappe.db.has_column("Livraison", "etat_planification"):
		return

	for route in frappe.get_all("Livraison", fields=["name", "status", "owner"]):
		if route.status == "Annulé":
			state = "Annulée"
		elif route.status == "Livré":
			state = "Terminée"
		else:
			state = "Brouillon"
		frappe.db.set_value(
			"Livraison",
			route.name,
			{"etat_planification": state, "planificateur": route.owner},
			update_modified=False,
		)
