# Copyright (c) 2025, Amine Melizi and contributors
# For license information, please see license.txt

import frappe

def execute():
	"""Ajoute les index de performance pour optimiser les requêtes de répartition."""
	
	# Index pour Livreur
	frappe.db.add_index("Livreur", ["active"])
	
	# Index pour Commune
	frappe.db.add_index("Commune", ["wilaya"])
	frappe.db.add_index("Commune", ["distance_depot"])
	frappe.db.add_index("Commune", ["latitude", "longitude"])
	
	# Les index pour Livraison Colis sont supprimés car le DocType n'existe plus
	
	# Index pour Livraison
	frappe.db.add_index("Livraison", ["batch_id"])
	frappe.db.add_index("Livraison", ["date_liv", "livreur"])
	
	# Les index pour les tables enfants Livreur Wilaya, Livreur Commune et Vehicule Wilaya
	# ont été supprimés car ces DocTypes ne sont plus utilisés après simplification
	
	# Index pour Depot Distribution
	frappe.db.add_index("Depot Distribution", ["is_default"])
	
	frappe.db.commit()
	print("Index de performance ajoutés avec succès")