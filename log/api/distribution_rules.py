"""Règles métier pures et testables du module Distribution."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable

ROUTE_TRANSITIONS = {
	"Brouillon": {"Publiée", "Annulée"},
	"Publiée": {"Brouillon", "En cours", "Annulée"},
	"En cours": {"Terminée", "Annulée"},
	"Terminée": set(),
	"Annulée": set(),
}


def has_any_role(user_roles: Iterable[str], allowed_roles: set[str]) -> bool:
	return bool(set(user_roles) & allowed_roles)


def can_transition_route(current: str, target: str) -> bool:
	return target in ROUTE_TRANSITIONS.get(current, set())


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


def capacity_error(capacity: int | None, quantity: float) -> str | None:
	if capacity is not None and quantity > capacity:
		return f"La capacité du véhicule est dépassée : {quantity:g} articles prévus pour une capacité de {capacity}."
	return None


def capacity_warning(capacity: int | None) -> str | None:
	return "La capacité de ce véhicule n'est pas configurée." if capacity is None else None


def has_assignment_conflict(existing_route: str | None) -> bool:
	return bool(existing_route)


def driver_owns_route(route_driver: str | None, user_driver: str | None) -> bool:
	return bool(route_driver and user_driver and route_driver == user_driver)


def intervals_overlap(start: datetime, end: datetime, other_start: datetime, other_end: datetime) -> bool:
	return start < other_end and end > other_start


def revision_matches(current: int, expected: int | None) -> bool:
	return expected is None or int(current or 0) == int(expected)


def change_reason_required(route_state: str | None) -> bool:
	return route_state == "Publiée"


def planning_status_for_route(route_state: str | None) -> str:
	return {
		"Brouillon": "Planifié",
		"Publiée": "Publié",
		"En cours": "En cours",
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
) -> list[str]:
	errors = []
	outcome = data.get("outcome")
	evidence = data.get("evidence") or {}
	latitude, longitude = evidence.get("latitude"), evidence.get("longitude")
	try:
		valid_gps = latitude is not None and longitude is not None and -90 <= float(latitude) <= 90 and -180 <= float(longitude) <= 180
	except (TypeError, ValueError):
		valid_gps = False
	if not valid_gps:
		errors.append("Une position GPS valide est obligatoire.")
	if outcome not in {"delivered", "partial", "failed"}:
		errors.append("Résultat d'arrêt invalide.")
	if outcome in {"delivered", "partial"} and not (evidence.get("photoData") or evidence.get("signatureData")):
		errors.append("Une photo ou une signature est obligatoire.")
	if evidence.get("signatureData") and not str(evidence.get("signerName") or "").strip():
		errors.append("Le nom du signataire est obligatoire avec la signature.")
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
		try:
			amount = float(payment.get("amount") or 0)
		except (TypeError, ValueError):
			amount = 0
		if amount <= 0 or amount > balance:
			errors.append(f"Le paiement doit être positif et ne peut pas dépasser le solde de {balance:.2f} DZD.")
		if payment.get("method") not in {"cash", "cheque"}:
			errors.append("Moyen de paiement invalide.")
		if payment.get("method") == "cheque" and not (payment.get("chequePhotoData") and payment.get("collectionDate")):
			errors.append("La photo du chèque et sa date d'encaissement sont obligatoires.")
	return errors
