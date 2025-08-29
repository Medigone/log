# Copyright (c) 2025, Amine Melizi and contributors
# For license information, please see license.txt

import frappe
from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter
from geopy.distance import geodesic
import requests
import json
import time

# Configuration pour Google Maps API
def get_google_maps_api_key():
	"""Récupère la clé API Google Maps depuis les paramètres de livraison"""
	try:
		params = frappe.get_doc("Parametres Livraison")
		return params.get_google_api_key() if params else ""
	except:
		return ""

GOOGLE_MAPS_API_KEY = get_google_maps_api_key()
GOOGLE_MAPS_BASE_URL = "https://maps.googleapis.com/maps/api/distancematrix/json"

def calculer_distance_route(origine_lat, origine_lon, destination_lat, destination_lon, mode="driving"):
	"""
	Calcule la distance par route en utilisant l'API Google Maps.
	
	Args:
		origine_lat, origine_lon: Coordonnées du point de départ
		destination_lat, destination_lon: Coordonnées du point d'arrivée
		mode: Mode de transport ("driving", "walking", "bicycling", "transit")
	
	Returns:
		dict: {"distance_km": float, "duree_minutes": int, "success": bool, "message": str}
	"""
	if not GOOGLE_MAPS_API_KEY:
		return {
			"success": False,
			"message": "Clé API Google Maps non configurée",
			"distance_km": None,
			"duree_minutes": None
		}
	
	try:
		# Construire l'URL de l'API
		params = {
			"origins": f"{origine_lat},{origine_lon}",
			"destinations": f"{destination_lat},{destination_lon}",
			"mode": mode,
			"key": GOOGLE_MAPS_API_KEY,
			"units": "metric"  # Distances en km
		}
		
		# Appel à l'API
		response = requests.get(GOOGLE_MAPS_BASE_URL, params=params, timeout=10)
		response.raise_for_status()
		
		data = response.json()
		
		if data["status"] == "OK":
			element = data["rows"][0]["elements"][0]
			
			if element["status"] == "OK":
				distance_km = element["distance"]["value"] / 1000  # Convertir mètres en km
				duree_minutes = element["duration"]["value"] / 60  # Convertir secondes en minutes
				
				return {
					"success": True,
					"distance_km": round(distance_km, 2),
					"duree_minutes": round(duree_minutes, 1),
					"message": "Distance calculée avec succès"
				}
			else:
				return {
					"success": False,
					"message": f"Impossible de calculer la route: {element['status']}",
					"distance_km": None,
					"duree_minutes": None
				}
		else:
			return {
				"success": False,
				"message": f"Erreur API Google Maps: {data['status']}",
				"distance_km": None,
				"duree_minutes": None
			}
			
	except requests.exceptions.RequestException as e:
		return {
			"success": False,
			"message": f"Erreur de connexion: {str(e)}",
			"distance_km": None,
			"duree_minutes": None
		}
	except Exception as e:
		return {
			"success": False,
			"message": f"Erreur inattendue: {str(e)}",
			"distance_km": None,
			"duree_minutes": None
		}

def calculer_distance_route_fallback(origine_lat, origine_lon, destination_lat, destination_lon):
	"""
	Calcul approximatif de la distance par route en cas d'échec de l'API
	Utilise un facteur de correction sur la distance géodésique
	"""
	try:
		# Calcul de la distance géodésique
		origine = (origine_lat, origine_lon)
		destination = (destination_lat, destination_lon)
		
		# Distance en ligne droite (km)
		distance_geodesique = geodesic(origine, destination).kilometers
		
		# Facteur de correction pour la route (1.3x plus long que la ligne droite)
		facteur_correction = 1.3
		distance_route = distance_geodesique * facteur_correction
		
		# Calcul de la durée approximative basée sur la distance
		# Vitesse moyenne estimée : 50 km/h en zone rurale, 30 km/h en zone urbaine
		if distance_route < 10:
			# Zone urbaine : 30 km/h
			vitesse_moyenne = 30
		elif distance_route < 50:
			# Zone périurbaine : 40 km/h
			vitesse_moyenne = 40
		else:
			# Zone rurale : 50 km/h
			vitesse_moyenne = 50
		
		# Durée en minutes
		duree_minutes = (distance_route / vitesse_moyenne) * 60
		
		return {
			"success": True,
			"distance_km": round(distance_route, 2),
			"duree_minutes": round(duree_minutes, 1),
			"message": f"Calcul approximatif (facteur {facteur_correction}x, vitesse {vitesse_moyenne} km/h)"
		}
		
	except Exception as e:
		return {
			"success": False,
			"distance_km": 0,
			"duree_minutes": 0,
			"message": f"Erreur calcul fallback: {str(e)}"
		}

@frappe.whitelist()
def geocoder_communes():
	"""Géocode toutes les communes sans coordonnées (respect RateLimiter)."""
	geolocator = Nominatim(user_agent="log_erpnext")
	geocode = RateLimiter(geolocator.geocode, min_delay_seconds=1)

	communes = frappe.get_all("Commune",
		filters=[["latitude","is","not set"]],
		fields=["name", "nom", "wilaya"]
	)
	
	for c in communes:
		try:
			q = f"{c.nom}, {c.wilaya}, Algérie"
			loc = geocode(q)
			if loc:
				frappe.db.set_value("Commune", c.name, {
					"latitude": loc.latitude,
					"longitude": loc.longitude
				})
				frappe.log_error(f"Géocodage réussi pour {c.nom}: {loc.latitude}, {loc.longitude}")
		except Exception as e:
			frappe.log_error(f"Erreur géocodage {c.nom}: {e}")
	
	frappe.db.commit()
	return {"success": True, "message": f"Géocodage terminé pour {len(communes)} communes"}


@frappe.whitelist()
def geocoder_communes_par_wilaya(wilaya_name):
	"""Géocode toutes les communes d'une wilaya spécifique sans coordonnées."""
	geolocator = Nominatim(user_agent="log_erpnext")
	geocode = RateLimiter(geolocator.geocode, min_delay_seconds=1)

	# Récupérer toutes les communes de la wilaya sans coordonnées
	communes = frappe.get_all("Commune",
		filters=[
			["wilaya", "=", wilaya_name],
			["latitude", "is", "not set"]
		],
		fields=["name", "nom", "wilaya"]
	)
	
	if not communes:
		return {"success": True, "message": f"Aucune commune à géocoder pour la wilaya {wilaya_name}"}
	
	success_count = 0
	error_count = 0
	
	for c in communes:
		try:
			q = f"{c.nom}, {c.wilaya}, Algérie"
			loc = geocode(q)
			if loc:
				frappe.db.set_value("Commune", c.name, {
					"latitude": loc.latitude,
					"longitude": loc.longitude
				})
				success_count += 1
				frappe.log_error(f"Géocodage réussi pour {c.nom}: {loc.latitude}, {loc.longitude}")
			else:
				error_count += 1
				frappe.log_error(f"Aucun résultat trouvé pour {c.nom}, {c.wilaya}")
		except Exception as e:
			error_count += 1
			frappe.log_error(f"Erreur géocodage {c.nom}: {e}")
	
	frappe.db.commit()
	
	return {
		"success": True, 
		"message": f"Géocodage terminé pour la wilaya {wilaya_name}. "
				   f"Succès: {success_count}, Erreurs: {error_count}, "
				   f"Total traité: {len(communes)}"
	}


@frappe.whitelist()
def calculer_distances_depot():
	"""Calcule la distance (km) du dépôt par défaut jusqu'à chaque commune géocodée."""
	try:
		depot = frappe.get_doc("Depot Distribution", {"is_default": 1})
	except frappe.DoesNotExistError:
		frappe.throw("Aucun dépôt principal configuré")
	
	if not depot.latitude_depot or not depot.longitude_depot:
		frappe.throw("Le dépôt principal n'a pas de coordonnées GPS")
	
	depot_coords = (depot.latitude_depot, depot.longitude_depot)

	communes = frappe.get_all("Commune",
		filters=[["latitude","is","set"]],
		fields=["name", "latitude", "longitude"]
	)
	
	for c in communes:
		if c.latitude and c.longitude:
			d = geodesic(depot_coords, (c.latitude, c.longitude)).km
			frappe.db.set_value("Commune", c.name, "distance_depot", round(d, 2))
	
	frappe.db.commit()
	return {"success": True, "message": f"Distances calculées pour {len(communes)} communes"}


@frappe.whitelist()
def calculer_distances_depot_par_wilaya(wilaya_name):
	"""Calcule la distance (km) du dépôt jusqu'à chaque commune géocodée d'une wilaya spécifique."""
	try:
		depot = frappe.get_doc("Depot Distribution", {"is_default": 1})
	except frappe.DoesNotExistError:
		frappe.throw("Aucun dépôt principal configuré")
	
	if not depot.latitude_depot or not depot.longitude_depot:
		frappe.throw("Le dépôt principal n'a pas de coordonnées GPS")
	
	depot_coords = (depot.latitude_depot, depot.longitude_depot)

	# Récupérer toutes les communes de la wilaya avec coordonnées
	communes = frappe.get_all("Commune",
		filters=[
			["wilaya", "=", wilaya_name],
			["latitude", "is", "set"]
		],
		fields=["name", "nom", "latitude", "longitude"]
	)
	
	if not communes:
		return {"success": True, "message": f"Aucune commune géocodée trouvée pour la wilaya {wilaya_name}"}
	
	success_count = 0
	for c in communes:
		if c.latitude and c.longitude:
			d = geodesic(depot_coords, (c.latitude, c.longitude)).km
			frappe.db.set_value("Commune", c.name, "distance_depot", round(d, 2))
			success_count += 1
	
	frappe.db.commit()
	
	return {
		"success": True, 
		"message": f"Distances calculées pour {success_count} communes de la wilaya {wilaya_name}"
	}


@frappe.whitelist()
def tester_cle_api_google():
	"""Teste la validité de la clé API Google Maps"""
	api_key = get_google_maps_api_key()
	
	if not api_key:
		return {
			"success": False,
			"message": "Aucune clé API Google Maps configurée"
		}
	
	try:
		# Test simple avec l'API Distance Matrix
		params = {
			"origins": "35.6971,-0.6332",  # Oran
			"destinations": "35.6971,-0.6332",  # Même point (test minimal)
			"key": api_key,
			"mode": "driving"
		}
		
		response = requests.get(GOOGLE_MAPS_BASE_URL, params=params, timeout=10)
		response.raise_for_status()
		
		data = response.json()
		
		if data["status"] == "OK":
			return {
				"success": True,
				"message": "Clé API Google Maps valide",
				"api_name": "Distance Matrix API",
				"daily_limit": "1000 requêtes/jour (gratuit)",
				"status": "Fonctionnelle"
			}
		elif data["status"] == "REQUEST_DENIED":
			return {
				"success": False,
				"message": "Clé API refusée. Vérifiez les restrictions de domaine et les APIs activées."
			}
		elif data["status"] == "OVER_QUERY_LIMIT":
			return {
				"success": False,
				"message": "Limite quotidienne dépassée. Réessayez demain ou passez à un plan payant."
			}
		else:
			return {
				"success": False,
				"message": f"Erreur API: {data['status']}"
			}
			
	except requests.exceptions.RequestException as e:
		return {
			"success": False,
			"message": f"Erreur de connexion: {str(e)}"
		}
	except Exception as e:
		return {
			"success": False,
			"message": f"Erreur inattendue: {str(e)}"
		}


@frappe.whitelist()
def geocoder_commune_specifique(commune_name):
	"""Géocode une commune spécifique."""
	geolocator = Nominatim(user_agent="log_erpnext")
	geocode = RateLimiter(geolocator.geocode, min_delay_seconds=1)
	
	commune = frappe.get_doc("Commune", commune_name)
	
	try:
		q = f"{commune.nom}, {commune.wilaya}, Algérie"
		loc = geocode(q)
		if loc:
			commune.latitude = loc.latitude
			commune.longitude = loc.longitude
			commune.save()
			return {"success": True, "latitude": loc.latitude, "longitude": loc.longitude}
		else:
			return {"success": False, "message": "Aucun résultat trouvé"}
	except Exception as e:
		frappe.log_error(f"Erreur géocodage {commune.nom}: {e}")
		return {"success": False, "message": str(e)}

@frappe.whitelist()
def calculer_distances_depot_par_route(wilaya_name=None, mode_transport="driving", force_api=False):
	"""
	Calcule la distance par route du dépôt jusqu'à chaque commune.
	
	Args:
		wilaya_name: Si spécifié, calcule seulement pour cette wilaya
		mode_transport: Mode de transport ("driving", "walking", "bicycling")
		force_api: Forcer l'utilisation de l'API Google Maps même si fallback disponible
	"""
	try:
		depot = frappe.get_doc("Depot Distribution", {"is_default": 1})
	except frappe.DoesNotExistError:
		frappe.throw("Aucun dépôt principal configuré")
	
	if not depot.latitude_depot or not depot.longitude_depot:
		frappe.throw("Le dépôt principal n'a pas de coordonnées GPS")
	
	depot_coords = (depot.latitude_depot, depot.longitude_depot)
	
	# Construire les filtres
	filters = [["latitude", "is", "set"]]
	if wilaya_name:
		filters.append(["wilaya", "=", wilaya_name])
	
	communes = frappe.get_all("Commune", filters=filters, fields=["name", "nom", "latitude", "longitude"])
	
	if not communes:
		return {
			"success": True, 
			"message": f"Aucune commune géocodée trouvée{f' pour la wilaya {wilaya_name}' if wilaya_name else ''}"
		}
	
	success_count = 0
	api_count = 0
	fallback_count = 0
	error_count = 0
	
	# Vérifier si l'API Google Maps est disponible
	api_available = bool(GOOGLE_MAPS_API_KEY)
		
	for commune in communes:
		# Vérifier que les coordonnées sont valides (pas 0,0 et dans des limites raisonnables)
		if (commune.latitude and commune.longitude and 
			(commune.latitude != 0 or commune.longitude != 0) and
			-90 <= commune.latitude <= 90 and -180 <= commune.longitude <= 180):
			try:
				if api_available:
					# Essayer l'API Google Maps
					result = calculer_distance_route(
						depot.latitude_depot, depot.longitude_depot,
						commune.latitude, commune.longitude,
						mode_transport
					)
					
					if result["success"]:
						# Mettre à jour la base de données
						frappe.db.set_value("Commune", commune.name, {
							"distance_depot": result["distance_km"],
							"duree_depot_minutes": result["duree_minutes"],
							"mode_calcul_distance": "API Google Maps"
						})
						success_count += 1
						api_count += 1
						
						# Log pour traçabilité
						frappe.log_error(
							f"Distance route calculée pour {commune.nom}: "
							f"{result['distance_km']} km, {result['duree_minutes']} min"
						)
						
						# Rate limiting pour éviter de surcharger l'API
						time.sleep(0.1)  # 100ms entre chaque appel
						
					else:
						# Log détaillé de l'erreur API
						frappe.log_error(
							f"Erreur API Google Maps pour {commune.nom} ({commune.name}): "
							f"{result['message']} - Coordonnées: {commune.latitude}, {commune.longitude}"
						)
						
						# Fallback vers le calcul approximatif
						result_fallback = calculer_distance_route_fallback(
							depot.latitude_depot, depot.longitude_depot,
							commune.latitude, commune.longitude
						)
						
						if result_fallback["success"]:
							frappe.db.set_value("Commune", commune.name, {
								"distance_depot": result_fallback["distance_km"],
								"duree_depot_minutes": result_fallback["duree_minutes"],
								"mode_calcul_distance": "Approximatif (fallback API)"
							})
							success_count += 1
							fallback_count += 1
							
							frappe.log_error(
								f"Fallback réussi pour {commune.nom}: "
								f"{result_fallback['distance_km']} km, {result_fallback['duree_minutes']} min"
							)
				else:
					# Utiliser directement le fallback
					result_fallback = calculer_distance_route_fallback(
						depot.latitude_depot, depot.longitude_depot,
						commune.latitude, commune.longitude
					)
					
					if result_fallback["success"]:
						frappe.db.set_value("Commune", commune.name, {
							"distance_depot": result_fallback["distance_km"],
							"duree_depot_minutes": result_fallback["duree_minutes"],
							"mode_calcul_distance": "Approximatif"
						})
						success_count += 1
						fallback_count += 1
					else:
						error_count += 1
						frappe.log_error(
							f"Erreur fallback pour {commune.nom}: "
							f"{result_fallback['message']}"
						)
						
			except Exception as e:
				error_count += 1
				frappe.log_error(
					f"Erreur calcul distance route pour {commune.nom} ({commune.name}): "
					f"{str(e)} - Coordonnées: {commune.latitude}, {commune.longitude}"
				)
	
	frappe.db.commit()
	
	message = f"Distances par route calculées pour {success_count} communes"
	if wilaya_name:
		message += f" de la wilaya {wilaya_name}"
	
	if api_count > 0:
		message += f" (API: {api_count}, Fallback: {fallback_count})"
	elif fallback_count > 0:
		message += f" (Fallback: {fallback_count})"
	
	if error_count > 0:
		message += f" - Erreurs: {error_count}"
	
	return {
		"success": True,
		"message": message,
		"stats": {
			"total": len(communes),
			"success": success_count,
			"api": api_count,
			"fallback": fallback_count,
			"errors": error_count
		}
	}