"""Géocodage des communes via Nominatim, avec cache sur le DocType Commune."""

from __future__ import annotations

import time
from typing import Any

import frappe
import requests
from frappe import _
from frappe.utils import cint, cstr, get_url

NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
DEFAULT_USER_AGENT = "IntraPro-Log-Distribution/1.0 (commune-geocoding)"
DEFAULT_RATE_LIMIT = 1
REQUEST_TIMEOUT_SECONDS = 15

_last_request_at = 0.0


class GeocodingError(Exception):
	"""Erreur Nominatim ou commune inexploitable."""


def _optional_coordinates(latitude: Any, longitude: Any) -> tuple[float, float] | None:
	if latitude in (None, "") or longitude in (None, ""):
		return None
	try:
		lat = float(latitude)
		lng = float(longitude)
	except (TypeError, ValueError):
		return None
	if lat == 0 and lng == 0:
		return None
	if not (-90 <= lat <= 90 and -180 <= lng <= 180):
		return None
	return lat, lng


def _user_agent() -> str:
	try:
		site = cstr(get_url()).strip()
	except Exception:
		site = ""
	if site:
		return f"{DEFAULT_USER_AGENT} ({site})"
	return DEFAULT_USER_AGENT


def _rate_limit_per_second() -> int:
	try:
		settings = frappe.get_single("Parametres Livraison")
		return max(cint(settings.get("rate_limit_geocoding")) or DEFAULT_RATE_LIMIT, 1)
	except Exception:
		return DEFAULT_RATE_LIMIT


def _throttle() -> None:
	global _last_request_at
	minimum_interval = 1 / _rate_limit_per_second()
	elapsed = time.monotonic() - _last_request_at
	if _last_request_at and elapsed < minimum_interval:
		time.sleep(minimum_interval - elapsed)
	_last_request_at = time.monotonic()


def _search_query(nom: str, wilaya: str | None) -> str:
	parts = [part for part in (cstr(nom).strip(), cstr(wilaya).strip(), "Algérie") if part]
	return ", ".join(parts)


def search_nominatim(query: str) -> tuple[float, float] | None:
	"""Interroge Nominatim et retourne (lat, lng) ou None si aucun résultat."""
	_throttle()
	try:
		response = requests.get(
			NOMINATIM_SEARCH_URL,
			params={
				"q": query,
				"format": "json",
				"limit": 1,
				"countrycodes": "dz",
			},
			headers={
				"User-Agent": _user_agent(),
				"Accept": "application/json",
				"Accept-Language": "fr",
			},
			timeout=REQUEST_TIMEOUT_SECONDS,
		)
	except requests.Timeout:
		raise GeocodingError(_("Nominatim n'a pas répondu dans le délai imparti."))
	except requests.RequestException:
		raise GeocodingError(_("Nominatim est actuellement injoignable."))

	if not response.ok:
		raise GeocodingError(_("Nominatim a refusé la demande (HTTP {0}).").format(response.status_code))
	try:
		payload = response.json()
	except ValueError:
		raise GeocodingError(_("La réponse Nominatim est invalide."))
	if not isinstance(payload, list) or not payload:
		return None
	first = payload[0] if isinstance(payload[0], dict) else {}
	return _optional_coordinates(first.get("lat"), first.get("lon"))


def _persist_commune_coordinates(commune_id: str, latitude: float, longitude: float) -> None:
	frappe.db.set_value("Commune", commune_id, "latitude", latitude, update_modified=False)
	frappe.db.set_value("Commune", commune_id, "longitude", longitude, update_modified=False)


def get_commune_coordinates(
	commune_id: str | None,
	*,
	geocode_if_missing: bool = False,
) -> dict[str, Any] | None:
	"""Retourne les coords d'une commune, éventuellement via Nominatim puis cache."""
	name = cstr(commune_id).strip()
	if not name:
		return None
	row = frappe.db.get_value(
		"Commune",
		name,
		["name", "nom", "wilaya", "latitude", "longitude"],
		as_dict=True,
	)
	if not row:
		return None
	stored = _optional_coordinates(row.get("latitude"), row.get("longitude"))
	if stored:
		return {"latitude": stored[0], "longitude": stored[1], "source": "cache"}
	if not geocode_if_missing:
		return None
	query = _search_query(row.get("nom") or name, row.get("wilaya"))
	found = search_nominatim(query)
	if not found:
		return None
	_persist_commune_coordinates(name, found[0], found[1])
	return {"latitude": found[0], "longitude": found[1], "source": "nominatim"}
