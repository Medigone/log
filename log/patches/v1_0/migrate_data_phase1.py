# Copyright (c) 2025, Amine Melizi and contributors
# For license information, please see license.txt
#
# Note: Ce patch a été simplifié après la refactorisation des DocTypes Livreur et Vehicule.
# Les champs capacite_max_colis, charge_actuelle, type_couverture, priorite_attribution
# ont été supprimés des DocTypes.

import frappe

def execute():
	"""Migration des données pour la Phase 1 - Initialisation des nouveaux champs."""
	
	# 1. Initialiser les coûts par km pour les véhicules existants
	vehicules = frappe.get_all("Vehicule", fields=["name"])
	for vehicule in vehicules:
		doc = frappe.get_doc("Vehicule", vehicule.name)
		
		if not doc.cout_km:
			doc.cout_km = 0.0
		
		doc.save()
	
	# 2. Créer un dépôt par défaut si aucun n'existe
	depots = frappe.get_all("Depot Distribution", filters={"is_default": 1})
	if not depots:
		depot = frappe.new_doc("Depot Distribution")
		depot.nom = "Dépôt Principal"
		depot.adresse = "À configurer"
		depot.is_default = 1
		depot.latitude_depot = 36.7538  # Alger par défaut
		depot.longitude_depot = 3.0588
		depot.save()
		print("Dépôt principal créé par défaut")
	
	# 3. Initialiser les paramètres de livraison
	if not frappe.db.exists("Parametres Livraison", "Parametres Livraison"):
		params = frappe.new_doc("Parametres Livraison")
		params.seuil_local_km = 20
		params.seuil_regional_km = 100
		params.api_geolocation = "Nominatim"
		params.rate_limit_geocoding = 1
		params.auto_update_distances = 1
		params.algorithme_repartition = "Optimal"
		params.save()
		print("Paramètres de livraison initialisés")
	
	frappe.db.commit()
	print("Migration Phase 1 terminée avec succès")
