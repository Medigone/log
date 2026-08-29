"""Ajoute les options d'affichage store / prix sur la fiche Article."""

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

import frappe


def execute():
	create_custom_fields(
		{
			"Item": [
				{
					"fieldname": "custom_afficher_dans_store",
					"label": "Afficher dans le store",
					"fieldtype": "Check",
					"default": "1",
					"insert_after": "is_sales_item",
					"in_list_view": 1,
					"in_standard_filter": 1,
					"description": "Si décoché, l'article n'apparaît plus dans le portail client.",
				},
				{
					"fieldname": "custom_afficher_prix_store",
					"label": "Afficher le prix dans le store",
					"fieldtype": "Check",
					"default": "1",
					"insert_after": "custom_afficher_dans_store",
					"depends_on": "custom_afficher_dans_store",
					"description": "Si décoché, l'article reste visible mais son tarif est masqué.",
				},
			],
		},
		update=True,
	)
	if frappe.db.has_column("Item", "custom_afficher_dans_store"):
		frappe.db.sql(
			"""
			UPDATE `tabItem`
			SET custom_afficher_dans_store = 1
			WHERE IFNULL(custom_afficher_dans_store, 0) = 0
			"""
		)
	if frappe.db.has_column("Item", "custom_afficher_prix_store"):
		frappe.db.sql(
			"""
			UPDATE `tabItem`
			SET custom_afficher_prix_store = 1
			WHERE IFNULL(custom_afficher_prix_store, 0) = 0
			"""
		)
