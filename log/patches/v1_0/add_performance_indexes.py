# Copyright (c) 2025, Amine Melizi and contributors
# For license information, please see license.txt

import frappe

def execute():
	"""Ajoute les index de performance pour optimiser les requêtes."""
	
	# Index pour Livreur
	if frappe.db.table_exists("tabLivreur"):
		frappe.db.add_index("Livreur", ["active"])
	
	# Index pour Commune
	if frappe.db.table_exists("tabCommune"):
		frappe.db.add_index("Commune", ["wilaya"])
		frappe.db.add_index("Commune", ["distance_depot"])
		frappe.db.add_index("Commune", ["latitude", "longitude"])
	
	# Index pour Depot Distribution
	if frappe.db.table_exists("tabDepot Distribution"):
		frappe.db.add_index("Depot Distribution", ["is_default"])
	
	frappe.db.commit()
	print("Index de performance ajoutés avec succès")