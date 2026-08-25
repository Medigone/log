"""Integration serveur avec OpenRouteService pour les tournees Distribution."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import frappe
import requests
from frappe import _
from frappe.utils import cint
from frappe.utils.password import get_decrypted_password

DEFAULT_BASE_URL = "https://api.openrouteservice.org"
DEFAULT_PROFILE = "driving-car"
DEFAULT_STOP_DURATION_MINUTES = 15
REQUEST_TIMEOUT_SECONDS = 20


class RoutingConfigurationError(Exception):
	"""Configuration locale incomplete ou invalide."""


class RoutingProviderError(Exception):
	"""Erreur distante OpenRouteService traduite pour l'interface."""


@dataclass(frozen=True)
class RoutingSettings:
	base_url: str
	profile: str
	api_key: str | None
	optimization_enabled: bool
	stop_duration_minutes: int


def _normalized_base_url(value: str | None) -> str:
	url = str(value or DEFAULT_BASE_URL).strip().rstrip("/")
	parsed = urlparse(url)
	if parsed.scheme not in {"http", "https"} or not parsed.netloc:
		raise RoutingConfigurationError(_("L'URL OpenRouteService est invalide."))
	return url


def get_routing_settings(*, include_secret: bool = False) -> RoutingSettings:
	settings = frappe.get_single("Parametres Livraison")
	configured_stop_duration = settings.get("duree_arret_defaut_minutes")
	if configured_stop_duration in (None, ""):
		configured_stop_duration = DEFAULT_STOP_DURATION_MINUTES
	api_key = None
	if include_secret:
		api_key = get_decrypted_password(
			"Parametres Livraison",
			"Parametres Livraison",
			"cle_api_openrouteservice",
			raise_exception=False,
		)
	return RoutingSettings(
		base_url=_normalized_base_url(settings.get("url_openrouteservice")),
		profile=str(settings.get("profil_routage") or DEFAULT_PROFILE),
		api_key=api_key,
		optimization_enabled=bool(cint(settings.get("optimisation_routage_active"))),
		stop_duration_minutes=max(cint(configured_stop_duration), 0),
	)


def route_duration_summary(
	driving_seconds: float,
	stop_count: int,
	stop_duration_minutes: int,
) -> dict[str, float | int]:
	"""Détaille la conduite, les arrêts et leur durée totale sans altérer le cache ORS."""
	driving = max(float(driving_seconds or 0), 0)
	count = max(cint(stop_count), 0)
	minutes = max(cint(stop_duration_minutes), 0)
	stops = count * minutes * 60
	return {
		"durationSeconds": driving,
		"stopDurationMinutes": minutes,
		"stopDurationSeconds": stops,
		"totalDurationSeconds": driving + stops,
	}


def parse_coordinate(value: Any, *, minimum: float, maximum: float, label: str) -> float:
	try:
		coordinate = float(value)
	except (TypeError, ValueError):
		raise RoutingConfigurationError(_("La coordonnee {0} est invalide.").format(label))
	if not minimum <= coordinate <= maximum:
		raise RoutingConfigurationError(_("La coordonnee {0} est hors limites.").format(label))
	return coordinate


def get_depot_snapshot(depot_name: str | None = None) -> dict[str, Any]:
	name = depot_name or frappe.db.get_value("Depot Distribution", {"is_default": 1}, "name")
	if not name:
		raise RoutingConfigurationError(_("Aucun depot principal n'est configure."))
	depot = frappe.db.get_value(
		"Depot Distribution",
		name,
		["name", "nom", "adresse", "latitude_depot", "longitude_depot", "is_default"],
		as_dict=True,
	)
	if not depot:
		raise RoutingConfigurationError(_("Le depot {0} est introuvable.").format(name))
	latitude = parse_coordinate(depot.latitude_depot, minimum=-90, maximum=90, label=_("latitude du depot"))
	longitude = parse_coordinate(depot.longitude_depot, minimum=-180, maximum=180, label=_("longitude du depot"))
	return {
		"name": depot.name,
		"label": depot.nom or depot.name,
		"address": depot.adresse,
		"latitude": latitude,
		"longitude": longitude,
		"isDefault": bool(depot.is_default),
	}


class OpenRouteServiceClient:
	def __init__(self, settings: RoutingSettings, *, timeout: int = REQUEST_TIMEOUT_SECONDS):
		if not settings.api_key:
			raise RoutingConfigurationError(
				_("Renseignez la cle OpenRouteService dans Parametres Livraison avant de calculer l'itineraire.")
			)
		self.settings = settings
		self.timeout = timeout

	def _post(
		self,
		path: str,
		payload: dict[str, Any],
		*,
		accept: str = "application/json",
	) -> dict[str, Any]:
		url = f"{self.settings.base_url}{path}"
		try:
			response = requests.post(
				url,
				headers={
					"Authorization": self.settings.api_key or "",
					"Accept": accept,
					"Content-Type": "application/json",
				},
				json=payload,
				timeout=self.timeout,
			)
		except requests.Timeout:
			raise RoutingProviderError(_("OpenRouteService n'a pas repondu dans le delai imparti."))
		except requests.RequestException:
			raise RoutingProviderError(_("OpenRouteService est actuellement injoignable."))

		try:
			data = response.json()
		except ValueError:
			data = {}
		if not response.ok:
			message = data.get("error") if isinstance(data, dict) else None
			if isinstance(message, dict):
				message = message.get("message")
			raise RoutingProviderError(
				str(message or _("OpenRouteService a refuse la demande (HTTP {0}).").format(response.status_code))
			)
		if not isinstance(data, dict):
			raise RoutingProviderError(_("La reponse OpenRouteService est invalide."))
		return data

	def directions(self, coordinates: list[list[float]]) -> dict[str, Any]:
		if len(coordinates) < 2:
			raise RoutingConfigurationError(_("Deux points au minimum sont necessaires pour calculer un itineraire."))
		data = self._post(
			f"/v2/directions/{self.settings.profile}/geojson",
			{"coordinates": coordinates, "instructions": False, "preference": "fastest"},
			accept="application/geo+json",
		)
		features = data.get("features") or []
		if not features or not isinstance(features[0], dict):
			raise RoutingProviderError(_("OpenRouteService n'a retourne aucun itineraire."))
		feature = features[0]
		geometry = feature.get("geometry") or {}
		summary = (feature.get("properties") or {}).get("summary") or {}
		if geometry.get("type") != "LineString" or not geometry.get("coordinates"):
			raise RoutingProviderError(_("La geometrie retournee par OpenRouteService est incomplete."))
		return {
			"geometry": geometry,
			"distanceMeters": float(summary.get("distance") or 0),
			"durationSeconds": float(summary.get("duration") or 0),
		}

	def optimize(self, depot: list[float], jobs: list[dict[str, Any]]) -> dict[str, Any]:
		if not jobs:
			raise RoutingConfigurationError(_("La tournee ne contient aucun arret a optimiser."))
		payload = {
			"jobs": [
				{"id": index, "location": job["location"], "description": job["deliveryNote"]}
				for index, job in enumerate(jobs, start=1)
			],
			"vehicles": [
				{
					"id": 1,
					"profile": self.settings.profile,
					"start": depot,
					"end": depot,
				}
			],
		}
		data = self._post("/optimization", payload)
		routes = data.get("routes") or []
		if not routes:
			raise RoutingProviderError(_("OpenRouteService n'a propose aucun ordre d'arrets."))
		route = routes[0]
		ids = [step.get("id") for step in route.get("steps") or [] if step.get("type") == "job"]
		if len(ids) != len(jobs) or len(set(ids)) != len(jobs):
			raise RoutingProviderError(_("La proposition OpenRouteService ne contient pas tous les arrets."))
		by_id = {index: job for index, job in enumerate(jobs, start=1)}
		return {
			"orderedDeliveryNotes": [by_id[int(job_id)]["deliveryNote"] for job_id in ids],
			"distanceMeters": float(route.get("distance") or 0),
			"durationSeconds": float(route.get("duration") or 0),
		}
