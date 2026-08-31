"""Convertit les campagnes Hero et les CTA Rayon vers le modèle store."""

import frappe


def execute():
	if not frappe.db.table_exists("Campagne Portail"):
		return
	if frappe.db.has_column("Campagne Portail", "placement"):
		frappe.db.sql(
			"UPDATE `tabCampagne Portail` SET placement = %s WHERE placement = %s",
			("Bandeau", "Hero"),
		)
	if frappe.db.has_column("Campagne Portail", "cta_type"):
		frappe.db.sql(
			"UPDATE `tabCampagne Portail` SET cta_type = %s WHERE cta_type = %s",
			("Catalogue", "Rayon"),
		)
	from log.services.portal_merchandising import clear_storefront_cache

	clear_storefront_cache()
