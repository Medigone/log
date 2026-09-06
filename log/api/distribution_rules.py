"""Règles métier pures et testables du module Distribution."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any, Iterable

ROUTE_TRANSITIONS = {
	"Brouillon": {"Publiée", "Annulée"},
	"Publiée": {"Brouillon", "En cours", "Annulée"},
	# Rien à ramener : le dernier arrêt peut sauter le passage dépôt.
	"En cours": {"Retour dépôt", "Contrôle caisse"},
	"Retour dépôt": {"Contrôle caisse"},
	"Contrôle caisse": {"Terminée"},
	"Terminée": set(),
	"Annulée": set(),
}

MAX_CUSTOMER_GPS_ACCURACY_METERS = 50


def parse_gps_value(value: str | None) -> tuple[float | None, float | None]:
	if not value:
		return None, None
	numbers = re.findall(r"-?\d+(?:\.\d+)?", str(value))
	if len(numbers) < 2:
		return None, None
	latitude, longitude = float(numbers[0]), float(numbers[1])
	if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
		return None, None
	if latitude == 0 and longitude == 0:
		return None, None
	return latitude, longitude


def has_any_role(user_roles: Iterable[str], allowed_roles: set[str]) -> bool:
	return bool(set(user_roles) & allowed_roles)


def can_transition_route(current: str, target: str) -> bool:
	return target in ROUTE_TRANSITIONS.get(current, set())


LOADED_STOP_STATUSES = {"Enlevé", "Non Livré"}


def load_verification_error(route_notes: set[str], verified: set[str]) -> str | None:
	if not route_notes:
		return "La tournée ne contient aucun bon de livraison."
	if verified != route_notes:
		return "Vérifiez tous les bons de livraison avant le chargement."
	return None


def start_without_load_error(*, loaded: bool) -> str | None:
	if not loaded:
		return "Chargez la marchandise dans le véhicule avant de démarrer la tournée."
	return None


def complete_stop_gate_error(*, route_state: str, loaded: bool, stop_status: str) -> str | None:
	if route_state != "En cours":
		return "La tournée doit être démarrée avant de valider un arrêt."
	if not loaded:
		return "Chargez la marchandise dans le véhicule avant de livrer."
	if stop_status in {"Livré", "Partiellement Livré"}:
		return None
	if stop_status not in LOADED_STOP_STATUSES:
		return "Ce bon n'a pas été chargé. Vérifiez et chargez la tournée avant de livrer."
	return None


def is_repeated_request(last_request_id: str | None, request_id: str) -> bool:
	return bool(last_request_id and last_request_id == request_id)


def stop_status(*, remaining_quantity: float, delivered_quantity: float, outcome: str) -> str:
	if remaining_quantity <= 0:
		return "Livré"
	if outcome == "failed" and delivered_quantity <= 0:
		return "Non Livré"
	return "Partiellement Livré"


def public_tracking_payload(name: str, status: str, steps: list[dict[str, Any]], articles: list[dict[str, Any]]):
	return {"name": name, "status": status, "steps": steps, "articles": articles}


# Contrôle de charge véhicule désactivé pour le moment.
ENFORCE_VEHICLE_CAPACITY = False


def capacity_error(capacity: int | None, quantity: float) -> str | None:
	if not ENFORCE_VEHICLE_CAPACITY:
		return None
	if capacity is not None and quantity > capacity:
		return f"La capacité du véhicule est dépassée : {quantity:g} articles prévus pour une capacité de {capacity}."
	return None


def capacity_warning(capacity: int | None) -> str | None:
	if not ENFORCE_VEHICLE_CAPACITY:
		return None
	return "La capacité de ce véhicule n'est pas configurée." if capacity is None else None


def has_assignment_conflict(existing_route: str | None) -> bool:
	return bool(existing_route)


def driver_owns_route(route_driver: str | None, user_driver: str | None) -> bool:
	return bool(route_driver and user_driver and route_driver == user_driver)


def intervals_overlap(start: datetime, end: datetime, other_start: datetime, other_end: datetime) -> bool:
	return start < other_end and end > other_start


def next_free_slot(
	occupied: list[tuple[datetime, datetime]],
	preferred_start: datetime,
	preferred_end: datetime,
) -> tuple[datetime, datetime]:
	"""Return the first slot of the same duration that does not overlap occupied intervals.

	If 08:00–12:00 is taken, the next candidate starts when that occupancy ends (12:00–16:00).
	"""
	duration = preferred_end - preferred_start
	if duration.total_seconds() <= 0:
		return preferred_start, preferred_end
	occupied_sorted = sorted(
		((start, end) for start, end in occupied if start and end),
		key=lambda item: item[0],
	)
	candidate_start = preferred_start
	for _ in range(48):
		candidate_end = candidate_start + duration
		conflict = next(
			(
				other
				for other in occupied_sorted
				if intervals_overlap(candidate_start, candidate_end, other[0], other[1])
			),
			None,
		)
		if not conflict:
			return candidate_start, candidate_end
		next_start = conflict[1]
		if next_start <= candidate_start:
			next_start = candidate_start + timedelta(minutes=1)
		candidate_start = next_start
	return candidate_start, candidate_start + duration


def revision_matches(current: int, expected: int | None) -> bool:
	return expected is None or int(current or 0) == int(expected)


def draft_route_delete_error(*, state: str | None, stop_count: int) -> str | None:
	if (state or "Brouillon") != "Brouillon":
		return "Seule une tournée brouillon peut être supprimée."
	if stop_count:
		return "Retirez tous les bons avant de supprimer la tournée."
	return None


def change_reason_required(route_state: str | None) -> bool:
	return route_state == "Publiée"


def planning_status_for_route(route_state: str | None) -> str:
	return {
		"Brouillon": "Planifié",
		"Publiée": "Publié",
		"En cours": "En cours",
		"Retour dépôt": "En attente retour",
		"Contrôle caisse": "Terminé",
		"Terminée": "Terminé",
	}.get(route_state or "", "Non planifié")


def classify_order_change(changed_fields: Iterable[str]) -> str | None:
	fields = set(changed_fields)
	if fields & {"items", "item_code", "qty", "uom", "warehouse", "batch_no"}:
		return "preparation"
	if fields & {
		"delivery_date",
		"shipping_address_name",
		"shipping_address",
		"contact_person",
		"contact_mobile",
		"custom_coordonnées_gps",
		"custom_commune",
		"custom_wilaya",
	}:
		return "routing"
	if fields & {"grand_total", "rounded_total", "currency", "taxes", "discount_amount"}:
		return "financial"
	return None


def completion_errors(
	data: dict[str, Any],
	*,
	balance: float,
	failure_reasons: set[str],
	requires_customer_geolocation: bool = False,
) -> list[str]:
	errors = []
	outcome = data.get("outcome")
	evidence = data.get("evidence") or {}
	latitude, longitude = evidence.get("latitude"), evidence.get("longitude")
	try:
		valid_gps = (
			latitude is not None
			and longitude is not None
			and -90 <= float(latitude) <= 90
			and -180 <= float(longitude) <= 180
			and not (float(latitude) == 0 and float(longitude) == 0)
		)
	except (TypeError, ValueError):
		valid_gps = False
	if not valid_gps:
		errors.append("Une position GPS valide est obligatoire.")
	if requires_customer_geolocation and outcome in {"delivered", "partial"}:
		try:
			accuracy = float(evidence.get("accuracy"))
		except (TypeError, ValueError):
			accuracy = -1
		if accuracy < 0 or accuracy > MAX_CUSTOMER_GPS_ACCURACY_METERS:
			errors.append(
				f"La localisation du client doit avoir une précision de {MAX_CUSTOMER_GPS_ACCURACY_METERS} m ou meilleure."
			)
	if outcome not in {"delivered", "partial", "failed"}:
		errors.append("Résultat d'arrêt invalide.")
	if outcome == "partial":
		items = data.get("items") or []
		if not items or not any(float(item.get("deliveredQuantity") or 0) > 0 for item in items):
			errors.append("Les quantités livrées sont obligatoires pour une livraison partielle.")
	if outcome == "failed":
		if data.get("failureReason") not in failure_reasons:
			errors.append("Un motif d'échec valide est obligatoire.")
		if not str(data.get("failureComment") or "").strip():
			errors.append("Un commentaire est obligatoire en cas d'échec.")

	payment = data.get("payment")
	if payment:
		if outcome == "failed":
			errors.append("Aucun encaissement ne peut être déclaré pour un arrêt en échec.")
		try:
			amount = float(payment.get("amount") or 0)
		except (TypeError, ValueError):
			amount = 0
		if amount <= 0:
			errors.append("Le paiement doit être positif.")
		if payment.get("method") not in {"cash", "cheque"}:
			errors.append("Moyen de paiement invalide.")
		if payment.get("method") == "cheque" and not (
			payment.get("chequePhotoData") and payment.get("collectionDate") and str(payment.get("chequeNumber") or "").strip()
		):
			errors.append("La photo, le numéro et la date d'encaissement du chèque sont obligatoires.")
	return errors
