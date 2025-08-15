# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Livreur(Document):
	def validate(self):
		"""Validation du document Livreur"""
		self.auto_populate_communes_from_wilayas()
	
	@frappe.whitelist()
	def auto_populate_communes_from_wilayas_api(self):
		"""Méthode publique pour synchroniser les communes depuis l'interface utilisateur"""
		self.auto_populate_communes_from_wilayas()
		self.save()
		return {"status": "success", "message": "Communes synchronisées avec succès"}
	
	def auto_populate_communes_from_wilayas(self):
		"""Remplit automatiquement les communes autorisées basées sur les wilayas sélectionnées"""
		if not self.wilayas_autorisees:
			return
		
		# Récupérer les wilayas actuellement sélectionnées
		wilayas_selectionnees = [row.wilaya for row in self.wilayas_autorisees if row.wilaya]
		
		if not wilayas_selectionnees:
			return
		
		# Récupérer toutes les communes pour ces wilayas
		communes = frappe.get_all(
			"Commune",
			filters={"wilaya": ["in", wilayas_selectionnees]},
			fields=["name", "nom", "wilaya"]
		)
		
		# Récupérer les communes déjà présentes pour éviter les doublons
		communes_existantes = [row.commune for row in self.communes_autorisees if row.commune]
		
		# Ajouter les nouvelles communes
		for commune in communes:
			if commune.name not in communes_existantes:
				self.append("communes_autorisees", {
					"commune": commune.name
				})
		
		# Supprimer les communes qui ne correspondent plus aux wilayas sélectionnées
		communes_a_supprimer = []
		for i, row in enumerate(self.communes_autorisees):
			if row.commune:
				commune_doc = frappe.get_doc("Commune", row.commune)
				if commune_doc.wilaya not in wilayas_selectionnees:
					communes_a_supprimer.append(i)
		
		# Supprimer les communes en ordre inverse pour éviter les problèmes d'index
		for i in reversed(communes_a_supprimer):
			del self.communes_autorisees[i]
