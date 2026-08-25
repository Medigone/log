"""Initialise le routage sans modifier les ordres historiques des tournees."""

import frappe


def execute():
	settings = frappe.get_single("Parametres Livraison")
	if not settings.get("url_openrouteservice"):
		settings.url_openrouteservice = "https://api.openrouteservice.org"
	if not settings.get("profil_routage"):
		settings.profil_routage = "driving-car"
	settings.optimisation_routage_active = settings.get("optimisation_routage_active") or 0
	settings.save(ignore_permissions=True)

	depot = frappe.db.get_value("Depot Distribution", {"is_default": 1}, "name")
	if depot and frappe.db.has_column("Livraison", "depot"):
		frappe.db.sql("UPDATE `tabLivraison` SET depot = %s WHERE COALESCE(depot, '') = ''", (depot,))
