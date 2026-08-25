# Copyright (c) 2025, Amine Melizi and contributors
# For license information, please see license.txt

import re
from urllib.parse import urlparse

import frappe
from frappe.model.document import Document
from frappe.utils import cint

DEFAULT_STOP_DURATION_MINUTES = 15


class ParametresLivraison(Document):
	def validate(self):
		"""Validation des paramètres de livraison"""
		self.validate_routing()
		self.validate_seuils_distance()
		self.validate_rate_limit()
		self.validate_google_api_key()

	def validate_routing(self):
		url = str(self.url_openrouteservice or "").strip().rstrip("/")
		parsed = urlparse(url)
		if parsed.scheme not in {"http", "https"} or not parsed.netloc:
			frappe.throw("L'URL OpenRouteService est invalide")
		self.url_openrouteservice = url
		if self.profil_routage != "driving-car":
			frappe.throw("Le profil routier doit être driving-car")
		if self.get("duree_arret_defaut_minutes") in (None, ""):
			self.duree_arret_defaut_minutes = DEFAULT_STOP_DURATION_MINUTES
		if cint(self.duree_arret_defaut_minutes) < 0:
			frappe.throw("Le temps d'arrêt par livraison ne peut pas être négatif")
	
	def validate_seuils_distance(self):
		"""Valide que les seuils de distance sont cohérents"""
		if self.seuil_local_km and self.seuil_regional_km:
			if self.seuil_local_km >= self.seuil_regional_km:
				frappe.throw(
					"Le seuil local doit être strictement inférieur au seuil régional. "
					f"Actuellement: Local={self.seuil_local_km}km, Régional={self.seuil_regional_km}km"
				)
			
			if self.seuil_local_km <= 0:
				frappe.throw("Le seuil local doit être strictement positif")
			
			if self.seuil_regional_km <= 0:
				frappe.throw("Le seuil régional doit être strictement positif")
	
	def validate_rate_limit(self):
		"""Valide le rate limit pour le géocodage"""
		if self.rate_limit_geocoding and self.rate_limit_geocoding <= 0:
			frappe.throw("Le rate limit de géocodage doit être strictement positif")
		
		if self.rate_limit_geocoding and self.rate_limit_geocoding > 10:
			frappe.msgprint(
				"Attention: Un rate limit élevé peut causer des blocages temporaires de l'API de géolocalisation",
				indicator="yellow"
			)
	
	def validate_google_api_key(self):
		"""Valide la clé API Google Maps"""
		if self.cle_api_google:
			# Vérifier le format de la clé API Google
			if not re.match(r'^AIza[0-9A-Za-z-_]{35}$', self.cle_api_google):
				frappe.throw(
					"Format de clé API Google invalide. "
					"Une clé API Google Maps commence par 'AIza' et fait 39 caractères."
				)
			
			# Vérifier que la clé n'est pas exposée dans les logs
			if frappe.local.conf.developer_mode:
				frappe.msgprint(
					"Mode développeur activé - La clé API sera visible dans les logs",
					indicator="red"
				)
		
		# Si l'API Google est sélectionnée mais pas de clé
		if self.api_geolocation == "google_maps" and not self.cle_api_google:
			frappe.throw(
				"Une clé API Google est requise quand l'API Google Maps est sélectionnée"
			)
	
	def on_update(self):
		"""Actions après mise à jour"""
		# Mettre à jour la configuration globale si la clé API change
		if self.cle_api_google:
			# Optionnel: Mettre à jour la configuration du site
			# frappe.db.set_value("Site Config", None, "google_maps_api_key", self.cle_api_google)
			pass
	
	def get_google_api_key(self):
		"""Récupère la clé API Google de manière sécurisée"""
		if self.cle_api_google:
			return self.cle_api_google
		return None
