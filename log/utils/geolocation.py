# Copyright (c) 2025, Amine Melizi and contributors
# For license information, please see license.txt

import frappe
from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter
from geopy.distance import geodesic


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