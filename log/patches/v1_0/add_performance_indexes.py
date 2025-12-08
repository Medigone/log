# Copyright (c) 2025, Amine Melizi and contributors
# For license information, please see license.txt

import frappe

def execute():
	"""Ajoute les index de performance pour optimiser les requêtes de répartition."""
	
	# Index pour Livreur
	frappe.db.add_index("Livreur", ["active", "type_couverture"])
	frappe.db.add_index("Livreur", ["specialisation"])
	frappe.db.add_index("Livreur", ["charge_actuelle", "capacite_max_articles"])
	
	# Index pour Commune
	frappe.db.add_index("Commune", ["wilaya"])
	frappe.db.add_index("Commune", ["distance_depot"])
	frappe.db.add_index("Commune", ["latitude", "longitude"])
	
	# Les index pour Livraison Colis sont supprimés car le DocType n'existe plus
	
	# Index pour Livraison
	frappe.db.add_index("Livraison", ["batch_id"])
	frappe.db.add_index("Livraison", ["date_liv", "livreur"])
	
	# Index pour Child Tables
	frappe.db.add_index("Livreur Wilaya", ["wilaya"])
	frappe.db.add_index("Livreur Commune", ["commune"])
	frappe.db.add_index("Vehicule Wilaya", ["wilaya"])
	
	# Index pour Depot Distribution
	frappe.db.add_index("Depot Distribution", ["is_default"])
	
	frappe.db.commit()
	print("Index de performance ajoutés avec succès")