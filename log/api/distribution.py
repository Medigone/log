"""API transactionnelle du frontend IntraPro Distribution."""

from __future__ import annotations

import base64
import binascii
import json
import uuid
from typing import Any

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, get_datetime, getdate, now_datetime, today

from log.api.distribution_rules import (
	can_transition_route,
	capacity_error,
	capacity_warning,
	change_reason_required,
	complete_stop_gate_error,
	completion_errors,
	draft_route_delete_error,
	driver_owns_route,
	has_assignment_conflict,
	has_any_role,
	is_repeated_request,
	intervals_overlap,
	load_verification_error,
	next_free_slot,
	planning_status_for_route,
	parse_gps_value,
	revision_matches,
	start_without_load_error,
	stop_status,
)
from log.services.geocoding import (
	GeocodingError,
	get_commune_coordinates,
	_optional_coordinates as _optional_geo_coordinates,
)
from log.services.routing import (
	OpenRouteServiceClient,
	RoutingConfigurationError,
	RoutingProviderError,
	get_depot_snapshot,
	get_routing_settings,
	route_duration_summary,
)

PLANNING_ROLES = {"Planificateur", "Responsable", "System Manager"}
DRIVER_ROLES = {"Livreur", "Responsable", "System Manager"}
PREPARATION_ROLES = {"Préparateur", "Responsable", "System Manager"}
CASHIER_ROLES = {"Caissier", "Responsable", "System Manager"}
MANAGER_ROLES = {"Responsable", "System Manager"}
STOCK_ROLES = PLANNING_ROLES | PREPARATION_ROLES
ACTIVITY_ROLES = PLANNING_ROLES | PREPARATION_ROLES
FLEET_ROLES = PLANNING_ROLES
FLEET_WRITE_ROLES = {"Responsable", "System Manager"}
ACTIVE_ROUTE_STATES = ("Brouillon", "Publiée", "En cours", "Retour dépôt", "Contrôle caisse")
TERMINAL_STOP_STATES = {"Livré", "Partiellement Livré", "Non Livré", "Annulé"}
OPEN_PLANNING_FOR_OVERDUE = {"Non planifié", "Planifié", "Publié"}
DELIVERED_STOP_STATES = {"Livré", "Annulé"}
FAILURE_REASONS = {
	"Client absent",
	"Client fermé",
	"Adresse introuvable",
	"Refus client",
	"Paiement refusé",
	"Accès impossible",
	"Autre",
}

ROLE_PRIORITY = (
	({"Responsable", "System Manager"}, "responsable"),
	({"Planificateur"}, "planificateur"),
	({"Préparateur"}, "preparateur"),
	({"Livreur"}, "livreur"),
	({"Caissier"}, "caissier"),
)


def _payload(value: Any) -> dict[str, Any]:
	if isinstance(value, str):
		try:
			value = json.loads(value)
		except json.JSONDecodeError:
			frappe.throw(_("Données JSON invalides."))
	if not isinstance(value, dict):
		frappe.throw(_("Le contenu de la requête est invalide."))
	return value


def _roles() -> set[str]:
	if frappe.session.user == "Administrator":
		return {"System Manager", "Responsable"}
	return set(frappe.get_roles(frappe.session.user))


def _require(allowed: set[str]):
	if frappe.session.user == "Guest" or not has_any_role(_roles(), allowed):
		frappe.throw(_("Vous n'avez pas accès à cette opération."), frappe.PermissionError)


def _require_schema():
	required = (
		("Livraison", "etat_planification"),
		("Livraison", "depart_prevu"),
		("Livraison", "revision"),
		("Vehicule", "capacite_max_articles"),
		("Delivery Note", "custom_last_delivery_request_id"),
		("Delivery Note", "custom_statut_planification"),
		("Delivery Note", "custom_stock_entry_chargement"),
		("Delivery Note", "custom_sales_invoice"),
		("Livraison", "statut_chargement"),
		("Livraison", "statut_caisse"),
		("Paiement Client", "statut_controle"),
	)
	missing = [f"{doctype}.{field}" for doctype, field in required if not frappe.db.has_column(doctype, field)]
	if missing:
		frappe.throw(
			_("Le schéma Distribution n'est pas encore synchronisé ({0}). Lancez la migration Bench manuellement.").format(
				", ".join(missing)
			)
		)


def _require_routing_schema():
	_require_schema()
	required_columns = (
		"depot",
		"routing_geometry",
		"routing_distance_m",
		"routing_duration_s",
		"routing_provider",
		"routing_calculated_at",
		"routing_revision",
	)
	missing = [field for field in required_columns if not frappe.db.has_column("Livraison", field)]
	for field in (
		"url_openrouteservice",
		"profil_routage",
		"cle_api_openrouteservice",
		"optimisation_routage_active",
	):
		if not frappe.db.exists("DocField", {"parent": "Parametres Livraison", "fieldname": field}):
			missing.append(f"Parametres Livraison.{field}")
	if missing:
		frappe.throw(
			_("Le schéma de routage n'est pas synchronisé ({0}). Lancez la migration Bench manuellement.").format(
				", ".join(missing)
			)
		)


@frappe.whitelist()
def get_current_distribution_user():
	if frappe.session.user == "Guest":
		frappe.throw(_("Authentification requise."), frappe.PermissionError)
	roles = _roles()
	role = next((key for candidates, key in ROLE_PRIORITY if roles & candidates), "none")
	full_name, email = frappe.db.get_value("User", frappe.session.user, ["full_name", "email"]) or (
		frappe.session.user,
		frappe.session.user,
	)
	return {
		"name": frappe.session.user,
		"email": email or frappe.session.user,
		"fullName": full_name or email or frappe.session.user,
		"role": role,
	}


def _customer_details(customer: str | None) -> dict[str, Any]:
	if not customer:
		return {}
	data = frappe.db.get_value(
		"Customer",
		customer,
		["customer_name", "custom_gps", "mobile_no", "primary_address"],
		as_dict=True,
	) or {}
	latitude, longitude = parse_gps_value(data.get("custom_gps"))
	has_gps = latitude is not None and longitude is not None
	return {
		"customerName": data.get("customer_name") or customer,
		"phone": data.get("mobile_no"),
		"address": data.get("primary_address"),
		"latitude": latitude,
		"longitude": longitude,
		"customerGpsStatus": "known" if has_gps else "missing",
		"requiresCustomerGeolocation": not has_gps,
	}


def _paid_amount(delivery_note: str) -> float:
	return flt(
		frappe.db.sql(
			"SELECT COALESCE(SUM(montant), 0) FROM `tabPaiement Client` WHERE bon_livraison = %s",
			(delivery_note,),
		)[0][0]
	)


def _payment_summary(delivery_note: str) -> tuple[float, list[dict[str, Any]]]:
	rows = frappe.get_all(
		"Paiement Client",
		filters={"bon_livraison": delivery_note},
		fields=[
			"name", "date", "moyen_paiement", "montant", "date_encaissement",
			"statut_controle", "facture_source", "payment_entry", "numero_cheque",
		],
		order_by="date asc, creation asc",
	)
	payments = [
		{
			"name": row.get("name"),
			"date": str(row.get("date") or "") or None,
			"method": row.get("moyen_paiement") or _("Non renseigné"),
			"amount": flt(row.get("montant")),
			"collectionDate": str(row.get("date_encaissement") or "") or None,
			"status": row.get("statut_controle") or "Déclaré",
			"salesInvoice": row.get("facture_source"),
			"paymentEntry": row.get("payment_entry"),
			"chequeNumber": row.get("numero_cheque"),
		}
		for row in rows
	]
	return sum(payment["amount"] for payment in payments), payments


def _sales_order_for_dn(doc) -> str | None:
	return next((item.against_sales_order for item in (doc.items or []) if item.get("against_sales_order")), None)


def _route_snapshot(route) -> dict[str, Any]:
	if not route:
		return {"route": None, "date": None, "driver": None, "vehicle": None}
	return {
		"route": route.name,
		"date": str(route.date_liv) if route.date_liv else None,
		"driver": route.livreur,
		"vehicle": route.vehicule,
	}


def _record_assignment_history(
	delivery_note: str,
	action: str,
	before: dict[str, Any],
	after: dict[str, Any],
	*,
	reason: str | None = None,
	revision: int | None = None,
	details: dict[str, Any] | None = None,
):
	doc = frappe.get_doc("Delivery Note", delivery_note)
	frappe.get_doc(
		{
			"doctype": "Historique Planification BL",
			"bon_de_livraison": delivery_note,
			"commande_client": _sales_order_for_dn(doc),
			"action": action,
			"tournee_avant": before.get("route"),
			"date_avant": before.get("date"),
			"livreur_avant": before.get("driver"),
			"vehicule_avant": before.get("vehicle"),
			"tournee_apres": after.get("route"),
			"date_apres": after.get("date"),
			"livreur_apres": after.get("driver"),
			"vehicule_apres": after.get("vehicle"),
			"revision_tournee": cint(revision),
			"motif": reason,
			"details_json": details or {},
		}
	).insert(ignore_permissions=True)


def _bump_route_revision(route, reason: str | None = None):
	was_published = _route_state(route) == "Publiée"
	route.revision = max(cint(route.revision), 1) + 1
	route.revision_acceptee = 0
	route.accepte_par = None
	route.date_acceptation = None
	if was_published:
		route.etat_planification = "Brouillon"
		route.a_revalider = 1
		route.motif_reouverture = reason
	_invalidate_route_routing(route)


def _invalidate_route_routing(route):
	for field, value in {
		"routing_geometry": None,
		"routing_distance_m": 0,
		"routing_duration_s": 0,
		"routing_provider": None,
		"routing_calculated_at": None,
		"routing_revision": 0,
	}.items():
		if route.meta.has_field(field):
			route.set(field, value)


def _assign_default_depot(route):
	if not route.meta.has_field("depot") or route.get("depot"):
		return
	try:
		route.depot = get_depot_snapshot()["name"]
	except RoutingConfigurationError:
		# L'absence de dépôt ne doit pas empêcher la planification manuelle.
		return


def _serialized_depot(route) -> dict[str, Any] | None:
	try:
		return get_depot_snapshot(route.get("depot"))
	except RoutingConfigurationError:
		return None


def _serialized_routing(route, stop_count: int) -> dict[str, Any]:
	geometry = None
	if route.get("routing_geometry"):
		try:
			candidate = json.loads(route.get("routing_geometry"))
			if isinstance(candidate, dict) and candidate.get("type") == "LineString":
				geometry = candidate
		except (TypeError, json.JSONDecodeError):
			geometry = None
	try:
		settings = get_routing_settings()
		optimization_enabled = settings.optimization_enabled
		profile = settings.profile
		stop_duration_minutes = settings.stop_duration_minutes
	except Exception:
		optimization_enabled = False
		profile = "driving-car"
		stop_duration_minutes = 15
	routing_revision = cint(route.get("routing_revision"))
	current_revision = max(cint(route.get("revision")), 1)
	status = "ready" if geometry and routing_revision == current_revision else "stale" if geometry else "not_calculated"
	durations = route_duration_summary(
		flt(route.get("routing_duration_s")) if status == "ready" else 0,
		stop_count,
		stop_duration_minutes,
	)
	return {
		"status": status,
		"provider": route.get("routing_provider") or "openrouteservice",
		"profile": profile,
		"optimizationEnabled": optimization_enabled,
		"geometry": geometry if status == "ready" else None,
		"distanceMeters": flt(route.get("routing_distance_m")) if status == "ready" else None,
		"durationSeconds": durations["durationSeconds"] if status == "ready" else None,
		"stopDurationMinutes": durations["stopDurationMinutes"],
		"stopDurationSeconds": durations["stopDurationSeconds"],
		"totalDurationSeconds": durations["totalDurationSeconds"] if status == "ready" else None,
		"calculatedAt": str(route.get("routing_calculated_at") or "") or None,
		"revision": routing_revision or None,
	}


def _set_delivery_note_assignment(doc, route, planning_status: str | None = None):
	values = {
		"custom_tournee": route.name if route else None,
		"custom_date_planifiee": route.date_liv if route else None,
		"custom_livreur": route.livreur if route else None,
		"custom_nom_livreur": route.nom_livreur if route else None,
		"custom_véhicule": route.vehicule if route else None,
		"custom_statut_planification": planning_status
		or (planning_status_for_route(_route_state(route)) if route else "Non planifié"),
	}
	available = {field: value for field, value in values.items() if frappe.db.has_column("Delivery Note", field)}
	frappe.db.set_value("Delivery Note", doc.name, available, update_modified=False)


def _schedule_conflicts(route, *, published_only: bool = False) -> list[str]:
	if not route.depart_prevu or not route.fin_prevue or not route.livreur or not route.vehicule:
		return []
	start, end = get_datetime(route.depart_prevu), get_datetime(route.fin_prevue)
	conflicts = []
	states = ["Publiée", "En cours"] if published_only else ["Brouillon", "Publiée", "En cours"]
	for other in frappe.get_all(
		"Livraison",
		filters={
			"name": ["!=", route.name],
			"etat_planification": ["in", states],
			"docstatus": ["<", 2],
		},
		fields=["name", "livreur", "vehicule", "depart_prevu", "fin_prevue"],
	):
		if not other.depart_prevu or not other.fin_prevue:
			continue
		if not (other.livreur == route.livreur or other.vehicule == route.vehicule):
			continue
		if intervals_overlap(start, end, get_datetime(other.depart_prevu), get_datetime(other.fin_prevue)):
			resource = "livreur" if other.livreur == route.livreur else "véhicule"
			conflicts.append(f"Conflit de {resource} avec la tournée {other.name}.")
	return conflicts


OCCUPIED_SLOT_STATES = ("Brouillon", "Publiée", "En cours")


def _occupied_slots(date_value, driver, vehicle) -> list[tuple]:
	"""Draft and active routes that already occupy this driver or vehicle on the given day."""
	slots = []
	for other in frappe.get_all(
		"Livraison",
		filters={
			"date_liv": date_value,
			"etat_planification": ["in", list(OCCUPIED_SLOT_STATES)],
			"docstatus": ["<", 2],
		},
		fields=["livreur", "vehicule", "depart_prevu", "fin_prevue"],
	):
		if not other.depart_prevu or not other.fin_prevue:
			continue
		if not (other.livreur == driver or other.vehicule == vehicle):
			continue
		slots.append((get_datetime(other.depart_prevu), get_datetime(other.fin_prevue)))
	return slots


def _row_value(row: Any, key: str, default: Any = None) -> Any:
	if isinstance(row, dict):
		return row.get(key, default)
	if hasattr(row, "get"):
		return row.get(key, default)
	return getattr(row, key, default)


def _serialize_note_amounts(doc) -> dict[str, Any]:
	taxes = []
	for tax in doc.get("taxes") or []:
		amount = flt(_row_value(tax, "tax_amount"))
		if abs(amount) < 0.000001:
			continue
		taxes.append(
			{
				"description": str(_row_value(tax, "description") or _row_value(tax, "account_head") or "Taxe").strip(),
				"rate": flt(_row_value(tax, "rate")),
				"taxAmount": amount,
			}
		)
	grand_total = flt(doc.get("grand_total"))
	if not cint(doc.get("disable_rounded_total")) and doc.get("rounded_total") not in (None, ""):
		grand_total = flt(doc.get("rounded_total"))
	return {
		"netTotal": flt(doc.get("net_total")),
		"taxes": taxes,
		"grandTotal": grand_total,
	}


def _stop_completed_at(doc) -> str | None:
	value = doc.get("custom_date_livraison")
	if value:
		return str(value)
	status = doc.get("custom_statut")
	if status not in {"Livré", "Partiellement Livré", "Non Livré"}:
		return None
	posting_date = doc.get("posting_date")
	posting_time = doc.get("posting_time")
	if posting_date and posting_time:
		return f"{posting_date} {posting_time}"
	return None


def _apply_commune_coordinates(stop: dict[str, Any], *, geocode_if_missing: bool = False) -> dict[str, Any]:
	"""Complète lat/lng depuis la commune si le GPS client manque. Ne masque pas l'alerte GPS."""
	if _optional_geo_coordinates(stop.get("latitude"), stop.get("longitude")):
		if not stop.get("geolocationSource"):
			stop["geolocationSource"] = "customer"
		return stop
	commune_id = stop.get("communeId")
	if not commune_id:
		return stop
	try:
		coords = get_commune_coordinates(commune_id, geocode_if_missing=geocode_if_missing)
	except GeocodingError:
		if geocode_if_missing:
			raise
		coords = None
	if not coords:
		return stop
	stop["latitude"] = coords["latitude"]
	stop["longitude"] = coords["longitude"]
	stop["geolocationSource"] = "commune"
	return stop


def _stop_from_dn(doc, sequence: int) -> dict[str, Any]:
	details = _customer_details(doc.customer)
	commune_id = doc.get("custom_commune")
	commune_label = frappe.db.get_value("Commune", commune_id, "nom") if commune_id else None
	paid, payments = _payment_summary(doc.name)
	amounts = _serialize_note_amounts(doc)
	items = []
	for item in doc.items or []:
		delivered = flt(item.get("custom_quantite_livree"))
		items.append(
			{
				"name": item.name,
				"itemCode": item.item_code,
				"itemName": item.item_name,
				"quantity": flt(item.qty),
				"deliveredQuantity": delivered,
				"remainingQuantity": max(flt(item.qty) - delivered, 0),
				"rate": flt(item.rate),
				"amount": flt(item.amount),
			}
		)
	remaining_quantity = sum(item["remainingQuantity"] for item in items)
	payload = {
		"deliveryNote": doc.name,
		"salesOrder": _sales_order_for_dn(doc),
		"customer": doc.customer,
		"customerName": details.get("customerName") or doc.customer_name or doc.customer,
		"commune": commune_label or commune_id,
		"communeId": commune_id,
		"wilaya": doc.get("custom_wilaya"),
		"address": doc.get("shipping_address") or details.get("address"),
		"phone": details.get("phone") or doc.get("contact_mobile"),
		"instructions": doc.get("instructions"),
		"latitude": details.get("latitude"),
		"longitude": details.get("longitude"),
		"geolocationSource": "customer" if details.get("latitude") is not None and details.get("longitude") is not None else None,
		"customerGpsStatus": details.get("customerGpsStatus") or "missing",
		"requiresCustomerGeolocation": bool(details.get("requiresCustomerGeolocation", True)),
		"totalQuantity": remaining_quantity,
		"amountCollected": paid,
		"amountToCollect": max(flt(amounts["grandTotal"]) - paid, 0),
		"netTotal": amounts["netTotal"],
		"grandTotal": amounts["grandTotal"],
		"taxes": amounts["taxes"],
		"payments": payments,
		"salesInvoice": doc.get("custom_sales_invoice"),
		"invoiceStatus": doc.get("custom_statut_facturation") or "Non créée",
		"residualDeliveryNote": doc.get("custom_residual_delivery_note"),
		"status": doc.get("custom_statut") or "Nouveau",
		"planningStatus": doc.get("custom_statut_planification") or "Non planifié",
		"requestedDate": str(doc.get("custom_date_de_livraison") or "") or None,
		"plannedDate": str(doc.get("custom_date_planifiee") or "") or None,
		"routeId": doc.get("custom_tournee"),
		"planningAlert": doc.get("custom_motif_invalidation"),
		"qrCode": doc.get("custom_qr_image"),
		"packageCount": max(cint(doc.get("custom_nombre_colis")), 1),
		"postingDate": str(doc.posting_date) if doc.posting_date else None,
		"completedAt": _stop_completed_at(doc),
		"sequence": sequence,
		"items": items,
		"failureReason": next(
			(
				str(item.get("custom_raison_non_livraison") or "").strip()
				for item in doc.items or []
				if str(item.get("custom_raison_non_livraison") or "").strip()
			),
			None,
		),
	}
	return _apply_commune_coordinates(payload, geocode_if_missing=False)


def _route_state(doc) -> str:
	return doc.get("etat_planification") or "Brouillon"


def _gps_collection_warning(stops: list[dict[str, Any]]) -> str | None:
	missing = [stop for stop in stops if stop.get("requiresCustomerGeolocation")]
	if not missing:
		return None
	return _(
		"{0} client(s) sans GPS : le livreur collectera la position ; l'itinéraire utilise le centre de la commune."
	).format(len(missing))


def _serialize_route(doc) -> dict[str, Any]:
	from log.services.distribution_cashier import reconciliation
	from log.services.distribution_fulfillment import route_stock_summary
	capacity = None
	vehicle_label = None
	if doc.vehicule:
		vehicle = frappe.db.get_value(
			"Vehicule",
			doc.vehicule,
			["nom", "immatriculation", "capacite_max_articles"],
			as_dict=True,
		)
		if vehicle:
			capacity = vehicle.capacite_max_articles
			vehicle_label = " · ".join(filter(None, [vehicle.nom, vehicle.immatriculation])) or doc.vehicule
	stops = []
	for sequence, row in enumerate(doc.bons_de_livraison or [], start=1):
		if not row.bon_de_livraison or not frappe.db.exists("Delivery Note", row.bon_de_livraison):
			continue
		stops.append(_stop_from_dn(frappe.get_doc("Delivery Note", row.bon_de_livraison), sequence))
	gps_warning = _gps_collection_warning(stops)
	return {
		"name": doc.name,
		"date": str(doc.date_liv) if doc.date_liv else "",
		"lifecycle": _route_state(doc),
		"plannedStart": str(doc.get("depart_prevu") or "") or None,
		"plannedEnd": str(doc.get("fin_prevue") or "") or None,
		"revision": max(cint(doc.get("revision")), 1),
		"publishedRevision": cint(doc.get("revision_publiee")),
		"acknowledgedRevision": cint(doc.get("revision_acceptee")),
		"acknowledged": bool(
			cint(doc.get("revision_publiee"))
			and cint(doc.get("revision_acceptee")) == cint(doc.get("revision_publiee"))
		),
		"acknowledgedBy": doc.get("accepte_par"),
		"acknowledgedAt": str(doc.get("date_acceptation") or "") or None,
		"needsReview": bool(doc.get("a_revalider")),
		"reviewReason": doc.get("motif_reouverture"),
		"driver": doc.livreur,
		"driverName": doc.nom_livreur or (frappe.db.get_value("Livreur", doc.livreur, "nom") if doc.livreur else None),
		"vehicle": doc.vehicule,
		"vehicleLabel": vehicle_label,
		"vehicleCapacity": cint(capacity) if capacity not in (None, "", 0) else None,
		"totalQuantity": sum(stop["totalQuantity"] for stop in stops),
		"totalArticles": cint(doc.get("total_articles")),
		"totalCollected": sum(stop["amountCollected"] for stop in stops),
		"totalAmount": sum(stop["amountToCollect"] for stop in stops),
		"stops": stops,
		"depot": _serialized_depot(doc),
		"routing": _serialized_routing(doc, len(stops)),
		"stock": route_stock_summary(doc),
		"cash": reconciliation(doc),
		"publishedAt": str(doc.get("date_publication") or "") or None,
		"startedAt": str(doc.get("date_depart") or "") or None,
		"finishedAt": str(doc.get("date_fin") or "") or None,
		"alerts": [
			*_schedule_conflicts(doc),
			*([capacity_warning(capacity)] if capacity_warning(capacity) else []),
			*([gps_warning] if gps_warning else []),
		],
	}


def _active_assignment(delivery_note: str, except_route: str | None = None) -> str | None:
	params: list[Any] = [delivery_note, *ACTIVE_ROUTE_STATES]
	state_placeholders = ", ".join(["%s"] * len(ACTIVE_ROUTE_STATES))
	exclusion = ""
	if except_route:
		exclusion = " AND l.name != %s"
		params.append(except_route)
	rows = frappe.db.sql(
		f"""
		SELECT l.name
		FROM `tabLivraison Bon de Livraison` child
		JOIN `tabLivraison` l ON l.name = child.parent
		WHERE child.bon_de_livraison = %s
		  AND l.etat_planification IN ({state_placeholders})
		  AND l.docstatus < 2{exclusion}
		LIMIT 1
		""",
		tuple(params),
	)
	return rows[0][0] if rows else None


def _lock_delivery_note(delivery_note: str):
	frappe.db.sql("SELECT name FROM `tabDelivery Note` WHERE name = %s FOR UPDATE", (delivery_note,))


def _lock_customer(customer: str):
	frappe.db.sql("SELECT name FROM `tabCustomer` WHERE name = %s FOR UPDATE", (customer,))


def _lock_route(route_id: str):
	frappe.db.sql("SELECT name FROM `tabLivraison` WHERE name = %s FOR UPDATE", (route_id,))


def _refresh_document_timestamp(doc):
	"""Align in-memory modified so nested Delivery Note saves cannot cause TimestampMismatchError."""
	if not doc.name:
		return
	seen = frappe.db.get_value(doc.doctype, doc.name, ["modified", "modified_by"], as_dict=True)
	if seen:
		doc.modified = seen.modified
		doc.modified_by = seen.modified_by


def _capacity(route) -> tuple[int | None, float]:
	capacity = None
	if route.vehicule:
		value = frappe.db.get_value("Vehicule", route.vehicule, "capacite_max_articles")
		capacity = cint(value) if value not in (None, "", 0) else None
	quantity = 0.0
	for row in route.bons_de_livraison or []:
		if not row.bon_de_livraison:
			continue
		items = frappe.get_all(
			"Delivery Note Item",
			filters={"parent": row.bon_de_livraison},
			fields=["qty", "custom_quantite_livree"],
		)
		quantity += sum(max(flt(item.qty) - flt(item.custom_quantite_livree), 0) for item in items)
	return capacity, quantity


def _validate_capacity(route, *, for_publication: bool):
	capacity, quantity = _capacity(route)
	error = capacity_error(capacity, quantity)
	if error and for_publication:
		frappe.throw(_(error))
	if error:
		return _(error)
	if for_publication:
		warning = capacity_warning(capacity)
		if warning:
			return _(warning)
	return None


def _sync_delivery_note_assignment(route):
	for row in route.bons_de_livraison or []:
		_set_delivery_note_assignment(frappe.get_doc("Delivery Note", row.bon_de_livraison), route)


def _board_date_range(date_from=None, date_to=None, date=None, all_dates=False):
	if all_dates:
		return None, None
	date_from = date_from or None
	date_to = date_to or None
	date = date or None
	if not date_from and not date_to and not date:
		return None, None
	start_date = getdate(date_from or date or date_to)
	end_date = getdate(date_to or date or date_from)
	if end_date < start_date:
		frappe.throw(_("La date de fin doit être postérieure à la date de début."))
	if (end_date - start_date).days > 62:
		frappe.throw(_("La plage de planification ne peut pas dépasser 63 jours."))
	return start_date, end_date


_EXCEPTION_PLANNING_STATUSES = {"À revalider", "À repréparer", "Exception"}


def _unassigned_matches_board(
	requested_date,
	planning_status: str,
	start_date,
	end_date,
	include_backlog: bool = False,
	*,
	requested_start=None,
	requested_end=None,
) -> bool:
	"""Whether an unscheduled Delivery Note belongs on the planning board.

	`start_date` / `end_date` are the route (`date_liv`) window and are ignored
	for unassigned BLs when a dedicated `requested_*` window is provided.
	Kanban backlog (`include_backlog`) lists every eligible unassigned BL
	unless a BL date filter is set. Exception statuses always appear even
	outside the window.
	"""
	if include_backlog and requested_start is None and requested_end is None:
		return True
	if (planning_status or "Non planifié") in _EXCEPTION_PLANNING_STATUSES:
		return True
	window_start = requested_start if requested_start is not None else start_date
	window_end = requested_end if requested_end is not None else end_date
	if not window_start or not window_end:
		return True
	if not requested_date:
		return False
	return window_start <= requested_date <= window_end


def planning_display_status(row: dict[str, Any], day=None) -> str:
	status = row.get("planningStatus") or "Non planifié"
	if status not in OPEN_PLANNING_FOR_OVERDUE:
		return status
	if (row.get("status") or "") in DELIVERED_STOP_STATES:
		return status
	due = row.get("requestedDate") or row.get("plannedDate")
	if due and getdate(due) < getdate(day or today()):
		return "En retard"
	return status


@frappe.whitelist()
def get_planning_board(date_from=None, date_to=None, filters=None, date=None):
	_require(PLANNING_ROLES)
	_require_schema()
	filter_data = _payload(filters) if filters else {}
	start_date, end_date = _board_date_range(
		date_from, date_to, date, all_dates=bool(filter_data.get("allDates"))
	)
	route_filters: dict[str, Any] = {"docstatus": ["<", 2]}
	if start_date and end_date:
		route_filters["date_liv"] = ["between", [start_date, end_date]]
	order_by = (
		"date_liv asc, depart_prevu asc, creation asc"
		if start_date
		else "date_liv desc, depart_prevu desc, creation desc"
	)

	routes = [
		_serialize_route(frappe.get_doc("Livraison", row.name))
		for row in frappe.get_all("Livraison", filters=route_filters, fields=["name"], order_by=order_by)
	]
	assigned = {
		stop["deliveryNote"]
		for route in routes
		if route["lifecycle"] in ACTIVE_ROUTE_STATES
		for stop in route["stops"]
	}

	bl_start, bl_end = _board_date_range(filter_data.get("blDateFrom"), filter_data.get("blDateTo"))
	include_backlog = bool(filter_data.get("includeBacklog")) and not (bl_start or bl_end)
	unassigned = []
	eligible_names = frappe.get_all(
		"Delivery Note",
		filters={
			"docstatus": 0,
			"custom_statut": ["in", ["Préparé", "Non Livré"]],
		},
		pluck="name",
		order_by="custom_date_de_livraison asc, creation asc",
		limit=1000,
	)
	for name in eligible_names:
		if name not in assigned and not _active_assignment(name):
			dn = frappe.get_doc("Delivery Note", name)
			requested = getdate(dn.get("custom_date_de_livraison")) if dn.get("custom_date_de_livraison") else None
			planning_status = dn.get("custom_statut_planification") or "Non planifié"
			if not _unassigned_matches_board(
				requested,
				planning_status,
				start_date,
				end_date,
				include_backlog,
				requested_start=bl_start,
				requested_end=bl_end,
			):
				continue
			unassigned.append(_stop_from_dn(dn, len(unassigned) + 1))

	drivers = [
		{
			"name": row.name,
			"label": row.nom or row.name,
			"active": bool(row.active and row.status not in {"En congé", "Indisponible"}),
			"vehicle": row.vehicule,
		}
		for row in frappe.get_all("Livreur", fields=["name", "nom", "active", "status", "vehicule"], order_by="nom asc")
	]
	vehicles = [
		{
			"name": row.name,
			"label": " · ".join(filter(None, [row.nom, row.immatriculation])) or row.name,
			"active": bool(row.active and row.status == "Disponible"),
			"capacity": cint(row.capacite_max_articles) if row.capacite_max_articles else None,
		}
		for row in frappe.get_all(
			"Vehicule",
			fields=["name", "nom", "immatriculation", "active", "status", "capacite_max_articles"],
			order_by="nom asc",
		)
	]
	assignments = [
		{**stop, "route": route["name"], "driver": route.get("driver"), "vehicle": route.get("vehicle"), "routeLifecycle": route["lifecycle"], "plannedStart": route.get("plannedStart"), "plannedEnd": route.get("plannedEnd"), "routeRevision": route.get("revision")}
		for route in routes
		for stop in route["stops"]
	]
	assignments.extend({**stop, "route": None, "driver": None, "vehicle": None, "routeLifecycle": None, "plannedStart": None, "plannedEnd": None, "routeRevision": 0} for stop in unassigned)
	for row in assignments:
		row["planningStatus"] = planning_display_status(row)

	def matches(row):
		search = str(filter_data.get("search") or "").strip().lower()
		if search and search not in " ".join(
			str(row.get(key) or "").lower() for key in ("deliveryNote", "customerName", "customer", "commune", "wilaya")
		):
			return False
		for key, row_key in (("status", "planningStatus"), ("driver", "driver"), ("vehicle", "vehicle"), ("route", "route"), ("wilaya", "wilaya")):
			if filter_data.get(key) and row.get(row_key) != filter_data[key]:
				return False
		if filter_data.get("alertsOnly") and not (row.get("planningAlert") or row.get("requiresCustomerGeolocation")):
			return False
		return True

	assignments = [row for row in assignments if matches(row)]
	exceptions = frappe.get_all(
		"Exception Distribution",
		filters={"statut": ["in", ["Ouverte", "En traitement"]]},
		fields=["name", "statut", "type_exception", "priorite", "bon_de_livraison", "commande_client", "tournee", "description", "date_signalement"],
		order_by="date_signalement desc",
		limit=100,
	)
	return {
		"dateFrom": str(start_date) if start_date else "",
		"dateTo": str(end_date) if end_date else "",
		"unassigned": unassigned,
		"assignments": assignments,
		"routes": routes,
		"drivers": drivers,
		"vehicles": vehicles,
		"exceptions": exceptions,
	}


@frappe.whitelist()
def get_route_details(route_id):
	_require(PLANNING_ROLES)
	_require_schema()
	route_id = str(route_id or "").strip()
	if not route_id or not frappe.db.exists("Livraison", route_id):
		frappe.throw(_("Tournée introuvable."))
	return _serialize_route(frappe.get_doc("Livraison", route_id))


def _routing_route(route_id: str, expected_revision=None):
	route_id = str(route_id or "").strip()
	if not route_id or not frappe.db.exists("Livraison", route_id):
		frappe.throw(_("Tournée introuvable."))
	doc = frappe.get_doc("Livraison", route_id)
	if expected_revision in (None, ""):
		frappe.throw(_("La révision attendue de la tournée est obligatoire."))
	if not revision_matches(cint(doc.revision), cint(expected_revision)):
		frappe.throw(_("La tournée a été modifiée. Actualisez-la avant de recalculer l'itinéraire."))
	return doc


def _routing_points(doc) -> tuple[dict[str, Any], list[dict[str, Any]], list[list[float]]]:
	depot = get_depot_snapshot(doc.get("depot"))
	stops = _serialize_route(doc)["stops"]
	if not stops:
		raise RoutingConfigurationError(_("La tournée ne contient aucun arrêt."))
	resolved: list[dict[str, Any]] = []
	missing: list[str] = []
	for stop in stops:
		try:
			_apply_commune_coordinates(stop, geocode_if_missing=True)
		except GeocodingError as error:
			raise RoutingConfigurationError(str(error))
		if not _optional_geo_coordinates(stop.get("latitude"), stop.get("longitude")):
			missing.append(f"{stop['customerName']} ({stop['deliveryNote']})")
			continue
		resolved.append(stop)
	if missing:
		raise RoutingConfigurationError(
			_("Aucune coordonnée exploitable (GPS client ou commune) pour : {0}.").format(", ".join(missing))
		)
	coordinates = [[depot["longitude"], depot["latitude"]]]
	coordinates.extend([[stop["longitude"], stop["latitude"]] for stop in resolved])
	coordinates.append([depot["longitude"], depot["latitude"]])
	return depot, resolved, coordinates


def _routing_error(error: Exception):
	frappe.throw(str(error), title=_("Routage indisponible"))


@frappe.whitelist()
def calculate_route_itinerary(route_id, expected_revision=None):
	"""Calcule puis met en cache la boucle dépôt-arrêts-dépôt dans l'ordre officiel idx."""
	_require(PLANNING_ROLES)
	_require_routing_schema()
	doc = _routing_route(route_id, expected_revision)
	revision = cint(doc.revision)
	stop_names = [row.bon_de_livraison for row in doc.bons_de_livraison or []]
	try:
		depot, _stops, coordinates = _routing_points(doc)
		settings = get_routing_settings(include_secret=True)
		result = OpenRouteServiceClient(settings).directions(coordinates)
	except (RoutingConfigurationError, RoutingProviderError) as error:
		return _routing_error(error)

	# L'appel externe est terminé : seulement maintenant on verrouille et revérifie la tournée.
	_lock_route(doc.name)
	current = frappe.get_doc("Livraison", doc.name)
	current_names = [row.bon_de_livraison for row in current.bons_de_livraison or []]
	if cint(current.revision) != revision or current_names != stop_names:
		frappe.throw(_("La tournée a changé pendant le calcul. Aucun itinéraire n'a été enregistré."))
	current.depot = current.get("depot") or depot["name"]
	current.routing_geometry = json.dumps(result["geometry"], separators=(",", ":"))
	current.routing_distance_m = result["distanceMeters"]
	current.routing_duration_s = result["durationSeconds"]
	current.routing_provider = "openrouteservice"
	current.routing_calculated_at = now_datetime()
	current.routing_revision = revision
	current.save(ignore_permissions=True)
	return _serialize_route(current)


@frappe.whitelist()
def propose_route_optimization(route_id, expected_revision=None):
	"""Retourne une proposition d'ordre sans modifier la tournée."""
	_require(PLANNING_ROLES)
	_require_routing_schema()
	doc = _routing_route(route_id, expected_revision)
	if _route_state(doc) != "Brouillon":
		frappe.throw(_("Seule une tournée en brouillon peut être optimisée."))
	try:
		depot, stops, current_coordinates = _routing_points(doc)
		settings = get_routing_settings(include_secret=True)
		if not settings.optimization_enabled:
			raise RoutingConfigurationError(_("L'optimisation du routage est désactivée dans Paramètres Livraison."))
		client = OpenRouteServiceClient(settings)
		current = client.directions(current_coordinates)
		jobs = [
			{
				"deliveryNote": stop["deliveryNote"],
				"location": [stop["longitude"], stop["latitude"]],
			}
			for stop in stops
		]
		optimized = client.optimize([depot["longitude"], depot["latitude"]], jobs)
		by_name = {job["deliveryNote"]: job["location"] for job in jobs}
		optimized_coordinates = [[depot["longitude"], depot["latitude"]]]
		optimized_coordinates.extend(by_name[name] for name in optimized["orderedDeliveryNotes"])
		optimized_coordinates.append([depot["longitude"], depot["latitude"]])
		optimized_route = client.directions(optimized_coordinates)
	except (RoutingConfigurationError, RoutingProviderError) as error:
		return _routing_error(error)
	current_durations = route_duration_summary(
		current["durationSeconds"],
		len(stops),
		settings.stop_duration_minutes,
	)
	optimized_durations = route_duration_summary(
		optimized_route["durationSeconds"],
		len(stops),
		settings.stop_duration_minutes,
	)
	return {
		"routeId": doc.name,
		"revision": cint(doc.revision),
		"currentOrder": [stop["deliveryNote"] for stop in stops],
		"optimizedOrder": optimized["orderedDeliveryNotes"],
		"current": {
			"distanceMeters": current["distanceMeters"],
			**current_durations,
		},
		"optimized": {
			"distanceMeters": optimized_route["distanceMeters"],
			**optimized_durations,
		},
	}


@frappe.whitelist()
def apply_route_optimization(route_id, ordered_delivery_notes, expected_revision=None):
	"""Applique atomiquement une proposition confirmée et invalide l'ancien tracé."""
	_require(PLANNING_ROLES)
	_require_routing_schema()
	ordered = _parse_delivery_note_order(
		ordered_delivery_notes,
		_("L'ordre optimisé est invalide."),
	)

	_lock_route(str(route_id or ""))
	doc = _routing_route(route_id, expected_revision)
	if _route_state(doc) != "Brouillon":
		frappe.throw(_("Seule une tournée en brouillon peut être optimisée."))
	try:
		settings = get_routing_settings()
	except RoutingConfigurationError as error:
		return _routing_error(error)
	if not settings.optimization_enabled:
		frappe.throw(_("L'optimisation du routage est désactivée dans Paramètres Livraison."))
	_apply_stop_order(
		doc,
		ordered,
		mismatch_message=_("La liste des arrêts a changé. Recalculez la proposition."),
	)
	_bump_route_revision(doc)
	doc.save(ignore_permissions=True)
	return _serialize_route(doc)


def _parse_delivery_note_order(ordered_delivery_notes, invalid_message: str) -> list[str]:
	if isinstance(ordered_delivery_notes, str):
		try:
			ordered_delivery_notes = json.loads(ordered_delivery_notes)
		except json.JSONDecodeError:
			frappe.throw(invalid_message)
	if not isinstance(ordered_delivery_notes, list):
		frappe.throw(invalid_message)
	ordered = [str(name or "").strip() for name in ordered_delivery_notes]
	if not ordered or any(not name for name in ordered) or len(ordered) != len(set(ordered)):
		frappe.throw(invalid_message)
	return ordered


def _apply_stop_order(doc, ordered_names: list[str], mismatch_message: str | None = None):
	rows_by_name = {row.bon_de_livraison: row for row in doc.bons_de_livraison or []}
	if len(rows_by_name) != len(doc.bons_de_livraison or []) or set(ordered_names) != set(rows_by_name):
		frappe.throw(mismatch_message or _("La liste des arrêts a changé. Actualisez la tournée."))
	doc.set("bons_de_livraison", [rows_by_name[name] for name in ordered_names])
	for index, row in enumerate(doc.bons_de_livraison, start=1):
		row.idx = index


def _next_remaining_order(current_names: list[str], statuses: dict[str, str], delivery_note: str) -> list[str]:
	if delivery_note not in current_names:
		frappe.throw(_("Ce bon de livraison n'appartient pas à la tournée."), frappe.PermissionError)
	if (statuses.get(delivery_note) or "") in TERMINAL_STOP_STATES:
		frappe.throw(_("Cet arrêt est déjà clôturé."))
	completed = [name for name in current_names if (statuses.get(name) or "") in TERMINAL_STOP_STATES]
	remaining = [name for name in current_names if (statuses.get(name) or "") not in TERMINAL_STOP_STATES]
	return completed + [delivery_note] + [name for name in remaining if name != delivery_note]


@frappe.whitelist()
def reorder_route_stops(route_id, ordered_delivery_notes, expected_revision=None):
	"""Réécrit l'ordre officiel des arrêts d'une tournée brouillon (jugement du planificateur)."""
	_require(PLANNING_ROLES)
	_require_schema()
	ordered = _parse_delivery_note_order(
		ordered_delivery_notes,
		_("L'ordre des arrêts contient un doublon ou un bon invalide."),
	)
	_lock_route(str(route_id or ""))
	doc = _routing_route(route_id, expected_revision)
	if _route_state(doc) != "Brouillon":
		frappe.throw(_("Seule une tournée en brouillon peut être réordonnée."))
	_apply_stop_order(doc, ordered)
	_bump_route_revision(doc)
	doc.save(ignore_permissions=True)
	return _serialize_route(doc)


@frappe.whitelist()
def save_route(route):
	_require(PLANNING_ROLES)
	_require_schema()
	data = _payload(route)
	name = data.get("name")
	if name:
		_lock_route(name)
	doc = frappe.get_doc("Livraison", name) if name else frappe.new_doc("Livraison")
	if name and _route_state(doc) != "Brouillon":
		frappe.throw(_("Seule une tournée en brouillon peut être modifiée."))
	if name and not revision_matches(cint(doc.revision), data.get("expectedRevision")):
		frappe.throw(_("La tournée a été modifiée par un autre utilisateur. Actualisez le planning."), frappe.ValidationError)
	previous_names = {row.bon_de_livraison for row in (doc.bons_de_livraison or []) if row.bon_de_livraison}

	doc.date_liv = getdate(data.get("date") or today())
	doc.depart_prevu = get_datetime(data["plannedStart"]) if data.get("plannedStart") else None
	doc.fin_prevue = get_datetime(data["plannedEnd"]) if data.get("plannedEnd") else None
	if bool(doc.depart_prevu) != bool(doc.fin_prevue):
		frappe.throw(_("Le départ et la fin prévus doivent être renseignés ensemble."))
	if doc.depart_prevu and (doc.fin_prevue <= doc.depart_prevu or getdate(doc.depart_prevu) != doc.date_liv):
		frappe.throw(_("Le créneau de tournée est invalide ou ne correspond pas à la date planifiée."))
	doc.livreur = data.get("driver") or None
	doc.vehicule = data.get("vehicle") or None
	doc.planificateur = frappe.session.user
	doc.etat_planification = "Brouillon"
	doc.batch_id = doc.batch_id or f"distribution:{uuid.uuid4()}"
	doc.revision = max(cint(doc.revision), 1) + (1 if name else 0)
	doc.revision_acceptee = 0
	doc.accepte_par = None
	doc.date_acceptation = None
	_assign_default_depot(doc)
	_invalidate_route_routing(doc)
	doc.set("bons_de_livraison", [])
	seen: set[str] = set()
	for stop in data.get("stops") or []:
		delivery_note = stop.get("deliveryNote") if isinstance(stop, dict) else str(stop)
		if not delivery_note or delivery_note in seen:
			frappe.throw(_("La liste des arrêts contient un doublon ou un bon invalide."))
		if not frappe.db.exists("Delivery Note", delivery_note):
			frappe.throw(_("Bon de livraison {0} introuvable.").format(delivery_note))
		_lock_delivery_note(delivery_note)
		assignment = _active_assignment(delivery_note, doc.name if name else None)
		if has_assignment_conflict(assignment):
			frappe.throw(_("Le bon {0} appartient déjà à la tournée {1}.").format(delivery_note, assignment))
		seen.add(delivery_note)
		dn = frappe.get_doc("Delivery Note", delivery_note)
		doc.append(
			"bons_de_livraison",
			{
				"bon_de_livraison": dn.name,
				"type": dn.get("custom_type"),
				"customer": dn.customer,
				"custom_date_de_livraison": dn.get("custom_date_de_livraison"),
				"custom_commune": dn.get("custom_commune"),
				"custom_wilaya": dn.get("custom_wilaya"),
				"total_qty": dn.total_qty,
				"grand_total": dn.grand_total,
				"status": dn.get("custom_statut"),
			},
		)

	warning = _validate_capacity(doc, for_publication=False)
	doc.save(ignore_permissions=True)
	current_names = {row.bon_de_livraison for row in doc.bons_de_livraison if row.bon_de_livraison}
	for delivery_note in previous_names - current_names:
		dn = frappe.get_doc("Delivery Note", delivery_note)
		_set_delivery_note_assignment(dn, None)
	for delivery_note in current_names:
		dn = frappe.get_doc("Delivery Note", delivery_note)
		_set_delivery_note_assignment(dn, doc, "Planifié")
	return {"route": _serialize_route(doc), "warning": warning or capacity_warning(_capacity(doc)[0])}


@frappe.whitelist()
def delete_draft_route(route_id, expected_revision=None):
	"""Permanently delete an empty draft route."""
	_require(PLANNING_ROLES)
	_require_schema()
	route_id = str(route_id or "").strip()
	if not route_id or not frappe.db.exists("Livraison", route_id):
		frappe.throw(_("Tournée introuvable."))
	_lock_route(route_id)
	doc = frappe.get_doc("Livraison", route_id)
	if not revision_matches(cint(doc.revision), cint(expected_revision) if expected_revision not in (None, "") else None):
		frappe.throw(_("La tournée a été modifiée. Actualisez le planning."))
	error = draft_route_delete_error(state=_route_state(doc), stop_count=len(_route_stop_names(doc)))
	if error:
		frappe.throw(_(error))
	name = doc.name
	frappe.delete_doc("Livraison", name, ignore_permissions=True, force=True)
	return {"success": True, "routeId": name}


@frappe.whitelist()
def publish_route(route_id, expected_revision=None):
	_require(PLANNING_ROLES)
	_require_schema()
	_lock_route(route_id)
	doc = frappe.get_doc("Livraison", route_id)
	if not revision_matches(cint(doc.revision), cint(expected_revision) if expected_revision not in (None, "") else None):
		frappe.throw(_("La tournée a changé. Actualisez-la avant publication."))
	if not can_transition_route(_route_state(doc), "Publiée"):
		frappe.throw(_("Cette tournée n'est plus en brouillon."))
	if not doc.livreur or not doc.vehicule or not doc.bons_de_livraison or not doc.depart_prevu or not doc.fin_prevue:
		frappe.throw(_("Un créneau, un livreur, un véhicule et au moins un arrêt sont requis."))
	conflicts = _schedule_conflicts(doc, published_only=True)
	if conflicts:
		frappe.throw(_(" ").join(conflicts))
	for row in doc.bons_de_livraison:
		_lock_delivery_note(row.bon_de_livraison)
		planning_status = frappe.db.get_value("Delivery Note", row.bon_de_livraison, "custom_statut_planification")
		if planning_status in {"À revalider", "À repréparer", "Exception"}:
			frappe.throw(_("Le bon {0} doit être traité avant publication ({1}).").format(row.bon_de_livraison, planning_status))
		assignment = _active_assignment(row.bon_de_livraison, doc.name)
		if has_assignment_conflict(assignment):
			frappe.throw(_("Le bon {0} appartient déjà à la tournée {1}.").format(row.bon_de_livraison, assignment))
	warning = _validate_capacity(doc, for_publication=True)
	gps_warning = _gps_collection_warning(_serialize_route(doc)["stops"])
	doc.etat_planification = "Publiée"
	doc.date_publication = now_datetime()
	doc.revision_publiee = max(cint(doc.revision), 1)
	doc.revision_acceptee = 0
	doc.accepte_par = None
	doc.date_acceptation = None
	doc.a_revalider = 0
	doc.motif_reouverture = None
	doc.save(ignore_permissions=True)
	_sync_delivery_note_assignment(doc)
	for row in doc.bons_de_livraison:
		_set_delivery_note_assignment(frappe.get_doc("Delivery Note", row.bon_de_livraison), doc, "Publié")
	warnings = [message for message in (warning, gps_warning) if message]
	return {"route": _serialize_route(doc), "warning": " ".join(warnings) or None}


def _append_delivery_note(route, dn, position: int | None = None):
	row = route.append(
		"bons_de_livraison",
		{
			"bon_de_livraison": dn.name,
			"type": dn.get("custom_type"),
			"customer": dn.customer,
			"custom_date_de_livraison": dn.get("custom_date_de_livraison"),
			"custom_commune": dn.get("custom_commune"),
			"custom_wilaya": dn.get("custom_wilaya"),
			"total_qty": dn.total_qty,
			"grand_total": dn.grand_total,
			"status": dn.get("custom_statut"),
		},
	)
	if position:
		rows = list(route.bons_de_livraison)
		rows.remove(row)
		rows.insert(max(0, min(cint(position) - 1, len(rows))), row)
		route.set("bons_de_livraison", rows)
	for index, item in enumerate(route.bons_de_livraison, start=1):
		item.idx = index


def _preserve_selected_route_vehicle(route):
	"""Keep an explicitly selected route vehicle instead of overwriting it from the driver default.

	The DocType uses ``livreur.vehicule`` as a convenience default. Planning must still allow a
	different vehicle per route, and legacy drivers can reference a vehicle that no longer exists.
	``fetch_if_empty`` is also declared in the DocType JSON; setting it here keeps the endpoint safe
	before the next schema synchronization has been applied on an existing site.
	"""
	field = route.meta.get_field("vehicule")
	if field and field.fetch_from == "livreur.vehicule":
		field.fetch_if_empty = 1


def _new_draft_route(date_value, start, end, driver, vehicle):
	doc = frappe.new_doc("Livraison")
	doc.date_liv = date_value
	doc.depart_prevu = start
	doc.fin_prevue = end
	doc.livreur = driver
	doc.vehicule = vehicle
	_preserve_selected_route_vehicle(doc)
	doc.planificateur = frappe.session.user
	doc.etat_planification = "Brouillon"
	doc.batch_id = f"distribution:{uuid.uuid4()}"
	doc.revision = 1
	_assign_default_depot(doc)
	return doc


def _compatible_route(data: dict[str, Any], source_name: str | None = None):
	requested_id = data.get("targetRouteId")
	if requested_id:
		_lock_route(requested_id)
		target = frappe.get_doc("Livraison", requested_id)
		_preserve_selected_route_vehicle(target)
		checks = {
			"plannedDate": str(target.date_liv or ""),
			"driver": target.livreur,
			"vehicle": target.vehicule,
		}
		for key, actual in checks.items():
			if data.get(key) and str(data[key]) != str(actual or ""):
				frappe.throw(_("La tournée choisie n'est plus compatible avec l'affectation demandée."))
		return target

	date_value = getdate(data.get("plannedDate") or today())
	start = get_datetime(data.get("plannedStart")) if data.get("plannedStart") else None
	end = get_datetime(data.get("plannedEnd")) if data.get("plannedEnd") else None
	driver, vehicle = data.get("driver"), data.get("vehicle")
	if not all((start, end, driver, vehicle)):
		frappe.throw(_("La date, le créneau, le livreur et le véhicule sont obligatoires."))
	if end <= start or getdate(start) != date_value:
		frappe.throw(_("Le créneau demandé est invalide."))
	if data.get("forceNew"):
		start, end = next_free_slot(_occupied_slots(date_value, driver, vehicle), start, end)
		if end <= start or getdate(start) != date_value:
			frappe.throw(_("Le créneau demandé est invalide."))
		return _new_draft_route(date_value, start, end, driver, vehicle)
	candidates = frappe.get_all(
		"Livraison",
		filters={
			"name": ["!=", source_name or ""],
			"date_liv": date_value,
			"depart_prevu": start,
			"fin_prevue": end,
			"livreur": driver,
			"vehicule": vehicle,
			"etat_planification": "Brouillon",
			"docstatus": ["<", 2],
		},
		pluck="name",
	)
	if len(candidates) > 1:
		frappe.throw(_("Plusieurs tournées compatibles existent. Sélectionnez la tournée de destination."))
	if candidates:
		_lock_route(candidates[0])
		target = frappe.get_doc("Livraison", candidates[0])
		_preserve_selected_route_vehicle(target)
		return target
	return _new_draft_route(date_value, start, end, driver, vehicle)


def _same_datetime(left, right) -> bool:
	if not left and not right:
		return True
	if not left or not right:
		return False
	return get_datetime(left) == get_datetime(right)


def _requested_slot(data: dict[str, Any], fallback=None):
	date_value = getdate(data.get("plannedDate") or (fallback.date_liv if fallback else today()))
	start = get_datetime(data.get("plannedStart")) if data.get("plannedStart") else (get_datetime(fallback.depart_prevu) if fallback and fallback.depart_prevu else None)
	end = get_datetime(data.get("plannedEnd")) if data.get("plannedEnd") else (get_datetime(fallback.fin_prevue) if fallback and fallback.fin_prevue else None)
	driver = data.get("driver") or (fallback.livreur if fallback else None)
	vehicle = data.get("vehicle") or (fallback.vehicule if fallback else None)
	return date_value, start, end, driver, vehicle


def _resources_changed(route, data: dict[str, Any]) -> bool:
	date_value, start, end, driver, vehicle = _requested_slot(data, route)
	return (
		str(getdate(route.date_liv)) != str(date_value)
		or str(route.livreur or "") != str(driver or "")
		or str(route.vehicule or "") != str(vehicle or "")
		or not _same_datetime(route.depart_prevu, start)
		or not _same_datetime(route.fin_prevue, end)
	)


def _apply_route_slot(route, data: dict[str, Any]):
	date_value, start, end, driver, vehicle = _requested_slot(data, route)
	if not all((start, end, driver, vehicle)):
		frappe.throw(_("La date, le créneau, le livreur et le véhicule sont obligatoires."))
	if end <= start or getdate(start) != date_value:
		frappe.throw(_("Le créneau demandé est invalide."))
	route.date_liv = date_value
	route.depart_prevu = start
	route.fin_prevue = end
	route.livreur = driver
	route.vehicule = vehicle
	_preserve_selected_route_vehicle(route)


def _route_stop_names(route) -> list[str]:
	names = []
	for row in route.bons_de_livraison or []:
		name = row.get("bon_de_livraison") if isinstance(row, dict) else row.bon_de_livraison
		if name:
			names.append(name)
	return names


def should_update_source_in_place(source, data: dict[str, Any], delivery_note: str) -> bool:
	if not source:
		return False
	requested_id = str(data.get("targetRouteId") or "").strip()
	if requested_id and requested_id != source.name:
		return False
	stops = _route_stop_names(source)
	return stops == [delivery_note] and _resources_changed(source, data)


@frappe.whitelist()
def schedule_delivery_note(payload):
	"""Create the first planning assignment for an unassigned Delivery Note."""
	_require(PLANNING_ROLES)
	_require_schema()
	data = _payload(payload)
	delivery_note = str(data.get("deliveryNote") or "").strip()
	if not delivery_note or not frappe.db.exists("Delivery Note", delivery_note):
		frappe.throw(_("Bon de livraison introuvable."))
	_lock_delivery_note(delivery_note)
	if _active_assignment(delivery_note):
		frappe.throw(_("Ce bon est déjà planifié. Utilisez la modification d'affectation."))
	return reassign_delivery_note(data)


@frappe.whitelist()
def schedule_delivery_notes(payload):
	"""Bulk-assign multiple Delivery Notes to an existing or new draft route atomically."""
	_require(PLANNING_ROLES)
	_require_schema()
	data = _payload(payload)
	delivery_notes = data.get("deliveryNotes") or []
	if isinstance(delivery_notes, str):
		try:
			delivery_notes = json.loads(delivery_notes)
		except json.JSONDecodeError:
			frappe.throw(_("La liste des bons de livraison est invalide."))
	if not isinstance(delivery_notes, list) or not delivery_notes:
		frappe.throw(_("La liste des bons de livraison est vide."))
	delivery_notes = [str(name).strip() for name in delivery_notes if str(name).strip()]
	if len(delivery_notes) != len(set(delivery_notes)):
		frappe.throw(_("La liste des bons de livraison contient des doublons."))

	for name in sorted(delivery_notes):
		if not frappe.db.exists("Delivery Note", name):
			frappe.throw(_("Bon de livraison {0} introuvable.").format(name))
		_lock_delivery_note(name)

	for name in delivery_notes:
		dn = frappe.get_doc("Delivery Note", name)
		if dn.docstatus != 0:
			frappe.throw(_("Le bon {0} n'est pas un brouillon.").format(name))
		if dn.get("custom_statut_planification") in {"À repréparer", "Exception", "Terminé"}:
			frappe.throw(_("Le bon {0} ne peut pas être planifié dans son état actuel.").format(name))
		existing = _active_assignment(name)
		if existing:
			if not data.get("forceNew"):
				frappe.throw(_("Le bon {0} est déjà affecté à une tournée.").format(name))
			_lock_route(existing)
			source = frappe.get_doc("Livraison", existing)
			if _route_state(source) != "Brouillon":
				frappe.throw(_("Seule une tournée brouillon permet de déplacer le bon {0}.").format(name))
			source.set(
				"bons_de_livraison",
				[row for row in source.bons_de_livraison if row.bon_de_livraison != name],
			)
			_bump_route_revision(source, None)
			source.save(ignore_permissions=True)
			_set_delivery_note_assignment(dn, None)

	target = _compatible_route(data, None)
	if not target.is_new() and _route_state(target) != "Brouillon":
		frappe.throw(_("La tournée de destination n'est pas un brouillon."))
	if not target.is_new() and not revision_matches(cint(target.revision), data.get("expectedTargetRevision")):
		frappe.throw(_("La tournée de destination a été modifiée. Actualisez le planning."))

	for name in delivery_notes:
		_append_delivery_note(target, frappe.get_doc("Delivery Note", name), None)

	warning = _validate_capacity(target, for_publication=False)
	if target.is_new():
		target.insert(ignore_permissions=True)
	else:
		_bump_route_revision(target, None)
	target.save(ignore_permissions=True)

	for name in delivery_notes:
		dn = frappe.get_doc("Delivery Note", name)
		_set_delivery_note_assignment(dn, target, "Planifié")
		_record_assignment_history(name, "Planification", {"route": None}, _route_snapshot(target), revision=target.revision)

	return {
		"route": _serialize_route(frappe.get_doc("Livraison", target.name)),
		"count": len(delivery_notes),
		"warning": warning or capacity_warning(_capacity(target)[0]),
	}


@frappe.whitelist()
def unassign_delivery_note(payload):
	"""Remove a single Delivery Note from a draft route, returning it to backlog."""
	_require(PLANNING_ROLES)
	_require_schema()
	data = _payload(payload)
	delivery_note = str(data.get("deliveryNote") or "").strip()
	if not delivery_note or not frappe.db.exists("Delivery Note", delivery_note):
		frappe.throw(_("Bon de livraison introuvable."))
	_lock_delivery_note(delivery_note)
	route_name = _active_assignment(delivery_note)
	if not route_name:
		frappe.throw(_("Ce bon n'est affecté à aucune tournée active."))
	_lock_route(route_name)
	route = frappe.get_doc("Livraison", route_name)
	if _route_state(route) != "Brouillon":
		frappe.throw(_("Seule une tournée brouillon permet la désaffectation directe."))
	if not revision_matches(cint(route.revision), data.get("expectedRouteRevision")):
		frappe.throw(_("La tournée a été modifiée. Actualisez le planning."))
	before = _route_snapshot(route)
	route.set("bons_de_livraison", [row for row in route.bons_de_livraison if row.bon_de_livraison != delivery_note])
	_bump_route_revision(route, None)
	route.save(ignore_permissions=True)
	dn = frappe.get_doc("Delivery Note", delivery_note)
	_set_delivery_note_assignment(dn, None)
	_record_assignment_history(
		delivery_note,
		"Retrait",
		before,
		{"route": None},
		revision=route.revision,
	)
	return {
		"route": _serialize_route(frappe.get_doc("Livraison", route_name)),
		"deliveryNote": delivery_note,
	}


@frappe.whitelist()
def reassign_delivery_note(payload):
	_require(PLANNING_ROLES)
	_require_schema()
	data = _payload(payload)
	delivery_note = str(data.get("deliveryNote") or "").strip()
	if not delivery_note or not frappe.db.exists("Delivery Note", delivery_note):
		frappe.throw(_("Bon de livraison introuvable."))
	_lock_delivery_note(delivery_note)
	dn = frappe.get_doc("Delivery Note", delivery_note)
	if dn.docstatus != 0:
		frappe.throw(_("Seul un bon de livraison brouillon peut être planifié."))
	if dn.get("custom_statut_planification") in {"À repréparer", "Exception", "Terminé"}:
		frappe.throw(_("Ce bon ne peut pas être réaffecté dans son état actuel."))

	source_name = _active_assignment(delivery_note)
	source = None
	if source_name:
		_lock_route(source_name)
		source = frappe.get_doc("Livraison", source_name)
		if _route_state(source) == "En cours":
			frappe.throw(_("Une tournée démarrée est figée. Créez une exception Responsable."))
		if _route_state(source) in {"Terminée", "Annulée"}:
			source = None
	reason = str(data.get("reason") or "").strip()
	if source and change_reason_required(_route_state(source)) and not reason:
		frappe.throw(_("Le motif est obligatoire pour modifier une tournée publiée."))
	if source and not revision_matches(cint(source.revision), data.get("expectedSourceRevision")):
		frappe.throw(_("La tournée source a été modifiée. Actualisez le planning."))

	if not data.get("forceNew") and should_update_source_in_place(source, data, delivery_note):
		before = _route_snapshot(source)
		_apply_route_slot(source, data)
		_bump_route_revision(source, reason)
		source.save(ignore_permissions=True)
		_set_delivery_note_assignment(dn, source)
		after = _route_snapshot(source)
		_record_assignment_history(
			delivery_note,
			"Réaffectation",
			before,
			after,
			reason=reason,
			revision=source.revision,
		)
		return {
			"assignment": _stop_from_dn(frappe.get_doc("Delivery Note", delivery_note), 1),
			"route": _serialize_route(source),
			"warning": _validate_capacity(source, for_publication=False),
		}

	target = _compatible_route(data, source.name if source else None)
	if _route_state(target) not in {"Brouillon", "Publiée"}:
		frappe.throw(_("La tournée de destination n'est plus modifiable."))
	if target.name and not revision_matches(cint(target.revision), data.get("expectedTargetRevision")):
		frappe.throw(_("La tournée de destination a été modifiée. Actualisez le planning."))
	if change_reason_required(_route_state(target)) and not reason:
		frappe.throw(_("Le motif est obligatoire pour modifier une tournée publiée."))

	before = _route_snapshot(source)
	if source and target.name == source.name:
		if _resources_changed(source, data):
			frappe.throw(_("Ce BL n'est pas le seul arrêt : choisissez une autre tournée ou laissez-en créer une."))
		rows = list(source.bons_de_livraison)
		row = next(item for item in rows if item.bon_de_livraison == delivery_note)
		rows.remove(row)
		rows.insert(max(0, min(cint(data.get("position") or 1) - 1, len(rows))), row)
		source.set("bons_de_livraison", rows)
		_bump_route_revision(source, reason)
		source.save(ignore_permissions=True)
		after = _route_snapshot(source)
		_record_assignment_history(delivery_note, "Réaffectation", before, after, reason=reason, revision=source.revision)
		return {"assignment": _stop_from_dn(dn, cint(data.get("position") or 1)), "route": _serialize_route(source), "warning": _validate_capacity(source, for_publication=False)}

	if source:
		_preserve_selected_route_vehicle(source)
		source.set("bons_de_livraison", [row for row in source.bons_de_livraison if row.bon_de_livraison != delivery_note])
		_bump_route_revision(source, reason)
		source.save(ignore_permissions=True)
	if target.is_new():
		target.insert(ignore_permissions=True)
	else:
		_bump_route_revision(target, reason)
	_append_delivery_note(target, dn, cint(data.get("position")) or None)
	warning = _validate_capacity(target, for_publication=False)
	target.save(ignore_permissions=True)
	_set_delivery_note_assignment(dn, target, "Planifié")
	after = _route_snapshot(target)
	_record_assignment_history(delivery_note, "Réaffectation" if source else "Planification", before, after, reason=reason, revision=target.revision)
	return {
		"assignment": _stop_from_dn(frappe.get_doc("Delivery Note", delivery_note), cint(data.get("position") or 1)),
		"route": _serialize_route(target),
		"sourceRoute": _serialize_route(source) if source else None,
		"warning": warning or capacity_warning(_capacity(target)[0]),
	}


def _driver_record() -> str | None:
	return frappe.db.get_value("Livreur", {"id_utilisateur": frappe.session.user, "active": 1}, "name")


def _assert_driver_route(doc):
	if _roles() & {"Responsable", "System Manager"}:
		return
	driver = _driver_record()
	if not driver_owns_route(doc.livreur, driver):
		frappe.throw(_("Cette tournée n'est pas affectée à votre compte."), frappe.PermissionError)


@frappe.whitelist()
def get_driver_routes(date=None):
	_require(DRIVER_ROLES)
	_require_schema()
	driver = _driver_record()
	if not driver and not (_roles() & {"Responsable", "System Manager"}):
		return []
	filters = {
		"date_liv": getdate(date or today()),
		"etat_planification": ["in", ["Publiée", "En cours", "Retour dépôt", "Contrôle caisse", "Terminée"]],
		"docstatus": ["<", 2],
	}
	if driver:
		filters["livreur"] = driver
	names = frappe.get_all(
		"Livraison",
		filters=filters,
		pluck="name",
		order_by="depart_prevu asc, creation asc",
	)
	return [_serialize_route(frappe.get_doc("Livraison", name)) for name in names]


@frappe.whitelist()
def get_driver_route_board(date=None):
	_require(DRIVER_ROLES)
	_require_schema()
	from log.services.distribution_driver_routes import build_driver_route_board, empty_board

	driver = _driver_record()
	if not driver and not (_roles() & {"Responsable", "System Manager"}):
		return empty_board()
	return build_driver_route_board(driver=driver, date=date, serialize_route=_serialize_route)


@frappe.whitelist()
def get_driver_dashboard(date=None):
	_require(DRIVER_ROLES)
	_require_schema()
	from log.services.distribution_driver_dashboard import build_driver_dashboard

	return build_driver_dashboard(driver=_driver_record(), date=date)


@frappe.whitelist()
def get_activity_dashboard(date=None):
	_require(ACTIVITY_ROLES)
	_require_schema()
	user = get_current_distribution_user()
	role = user.get("role")
	if role not in {"preparateur", "planificateur", "responsable"}:
		frappe.throw(_("Vous n'avez pas accès à cette opération."), frappe.PermissionError)
	from log.services.distribution_activity_dashboard import build_activity_dashboard

	return build_activity_dashboard(role=role, date=date)


@frappe.whitelist()
def get_driver_route(route_id=None):
	"""Compatibilité avec le premier frontend Distribution."""
	if route_id:
		_require(DRIVER_ROLES)
		_require_schema()
		doc = frappe.get_doc("Livraison", route_id)
		_assert_driver_route(doc)
		return _serialize_route(doc)
	routes = get_driver_routes(today())
	return next((route for route in routes if route["lifecycle"] in {"Publiée", "En cours", "Retour dépôt"}), routes[0] if routes else None)


@frappe.whitelist()
def acknowledge_route(route_id, revision):
	_require(DRIVER_ROLES)
	_require_schema()
	_lock_route(route_id)
	doc = frappe.get_doc("Livraison", route_id)
	_assert_driver_route(doc)
	if _route_state(doc) != "Publiée":
		frappe.throw(_("Seule une tournée publiée peut être acceptée."))
	if cint(revision) != cint(doc.revision_publiee) or cint(doc.revision_publiee) != cint(doc.revision):
		frappe.throw(_("Cette révision n'est plus actuelle. Actualisez la tournée."))
	doc.revision_acceptee = cint(revision)
	doc.accepte_par = frappe.session.user
	doc.date_acceptation = now_datetime()
	doc.save(ignore_permissions=True)
	for row in doc.bons_de_livraison:
		_record_assignment_history(
			row.bon_de_livraison,
			"Acceptation",
			_route_snapshot(doc),
			_route_snapshot(doc),
			revision=doc.revision,
		)
	return _serialize_route(doc)


def _as_note_set(value: Any) -> set[str]:
	if isinstance(value, str):
		try:
			value = json.loads(value)
		except json.JSONDecodeError:
			value = [part.strip() for part in value.split(",") if part.strip()]
	if not isinstance(value, (list, tuple, set)):
		return set()
	return {str(item).strip() for item in value if str(item).strip()}


def _route_delivery_notes(doc) -> set[str]:
	return {str(row.bon_de_livraison).strip() for row in (doc.bons_de_livraison or []) if row.bon_de_livraison}


def _assert_revision_accepted(doc):
	if cint(doc.revision_acceptee) != cint(doc.revision_publiee) or cint(doc.revision_publiee) != cint(doc.revision):
		frappe.throw(_("Acceptez la dernière révision de la tournée avant le départ."))


def _route_is_loaded(doc) -> bool:
	return bool(doc.get("stock_entry_chargement")) or str(doc.get("statut_chargement") or "") == "Chargé"


@frappe.whitelist()
def load_route(route_id, expected_revision=None, verified_delivery_notes=None, request_id=None):
	_require(DRIVER_ROLES)
	_require_schema()
	_lock_route(route_id)
	doc = frappe.get_doc("Livraison", route_id)
	_assert_driver_route(doc)
	request_id = str(request_id or "").strip()
	if _route_is_loaded(doc) and _route_state(doc) in {"Publiée", "En cours"}:
		return _serialize_route(doc)
	if _route_state(doc) != "Publiée":
		frappe.throw(_("Seule une tournée publiée peut être chargée."))
	_assert_revision_accepted(doc)
	if expected_revision not in (None, "") and cint(expected_revision) != cint(doc.revision):
		frappe.throw(_("La tournée a été révisée. Actualisez-la avant le chargement."))
	mismatch = load_verification_error(_route_delivery_notes(doc), _as_note_set(verified_delivery_notes))
	if mismatch:
		frappe.throw(_(mismatch))
	for row in doc.bons_de_livraison or []:
		_lock_delivery_note(row.bon_de_livraison)
	from log.services.distribution_fulfillment import load_route_stock

	load_route_stock(doc)
	_refresh_document_timestamp(doc)
	doc.save(ignore_permissions=True)
	return _serialize_route(doc)


@frappe.whitelist()
def start_route(route_id, expected_revision=None, request_id=None):
	_require(DRIVER_ROLES)
	_require_schema()
	_lock_route(route_id)
	doc = frappe.get_doc("Livraison", route_id)
	_assert_driver_route(doc)
	request_id = str(request_id or "").strip()
	if request_id and doc.get("last_start_request_id") == request_id and _route_state(doc) == "En cours":
		return _serialize_route(doc)
	if _route_state(doc) == "En cours" and _route_is_loaded(doc):
		return _serialize_route(doc)
	if not can_transition_route(_route_state(doc), "En cours"):
		frappe.throw(_("Seule une tournée publiée peut être démarrée."))
	_assert_revision_accepted(doc)
	if expected_revision not in (None, "") and cint(expected_revision) != cint(doc.revision):
		frappe.throw(_("La tournée a été révisée. Actualisez-la avant le départ."))
	unloaded = start_without_load_error(loaded=_route_is_loaded(doc))
	if unloaded:
		frappe.throw(_(unloaded))
	doc.etat_planification = "En cours"
	doc.date_depart = now_datetime()
	if doc.meta.has_field("last_start_request_id"):
		doc.last_start_request_id = request_id or None
	from log.livraison_hooks import calculate_livraison_status_from_bls

	doc.status = calculate_livraison_status_from_bls(doc)
	_refresh_document_timestamp(doc)
	doc.save(ignore_permissions=True)
	for row in doc.bons_de_livraison:
		_set_delivery_note_assignment(frappe.get_doc("Delivery Note", row.bon_de_livraison), doc, "En cours")
	return _serialize_route(doc)


@frappe.whitelist()
def finish_route(route_id):
	_require(DRIVER_ROLES)
	_require_schema()
	_lock_route(route_id)
	doc = frappe.get_doc("Livraison", route_id)
	_assert_driver_route(doc)
	if _route_state(doc) not in {"En cours", "Retour dépôt"}:
		frappe.throw(_("Seule une tournée en cours peut déclarer son retour."))
	statuses = {
		frappe.db.get_value("Delivery Note", row.bon_de_livraison, "custom_statut")
		for row in doc.bons_de_livraison
	}
	if not statuses.issubset(TERMINAL_STOP_STATES):
		frappe.throw(_("Tous les arrêts doivent avoir un résultat avant de terminer la tournée."))
	from log.services.distribution_fulfillment import declare_route_return

	declare_route_return(doc)
	return _serialize_route(frappe.get_doc("Livraison", doc.name))


@frappe.whitelist()
def get_repreparation_impact(sales_order):
	_require(PREPARATION_ROLES | PLANNING_ROLES)
	_require_schema()
	from log.order_change_ops import get_repreparation_impact_data

	return get_repreparation_impact_data(sales_order)


@frappe.whitelist()
def reprepare_changed_order(sales_order, expected_revision=None):
	_require(PREPARATION_ROLES)
	_require_schema()
	from log.order_change_ops import reprepare_order

	return reprepare_order(sales_order, expected_revision)


@frappe.whitelist()
def resolve_distribution_exception(payload):
	_require({"Responsable", "System Manager"})
	_require_schema()
	data = _payload(payload)
	name = str(data.get("exceptionId") or "").strip()
	resolution = str(data.get("resolution") or "").strip()
	action = str(data.get("action") or "").strip()
	if action not in {"maintain", "reschedule", "return_reload"} or not resolution:
		frappe.throw(_("Une action et une résolution sont obligatoires."))
	frappe.db.sql("SELECT name FROM `tabException Distribution` WHERE name = %s FOR UPDATE", (name,))
	exception = frappe.get_doc("Exception Distribution", name)
	if exception.statut not in {"Ouverte", "En traitement"}:
		frappe.throw(_("Cette exception est déjà clôturée."))
	route = frappe.get_doc("Livraison", exception.tournee) if exception.tournee else None
	if action == "reschedule" and route and _route_state(route) == "En cours":
		frappe.throw(_("Terminez d'abord la tournée avant de replanifier le reliquat."))
	exception.statut = "Résolue"
	exception.resolution = resolution
	exception.resolue_par = frappe.session.user
	exception.date_resolution = now_datetime()
	exception.save(ignore_permissions=True)
	dn = frappe.get_doc("Delivery Note", exception.bon_de_livraison)
	if action == "reschedule":
		_set_delivery_note_assignment(dn, None, "Non planifié")
	elif action == "maintain" and route:
		_set_delivery_note_assignment(dn, route, planning_status_for_route(_route_state(route)))
	else:
		frappe.db.set_value(
			"Delivery Note",
			dn.name,
			{"custom_statut_planification": "À revalider", "custom_motif_invalidation": resolution},
			update_modified=False,
		)
	_record_assignment_history(
		dn.name,
		"Résolution",
		_route_snapshot(route),
		_route_snapshot(route) if action == "maintain" else {},
		reason=resolution,
		revision=cint(route.revision) if route else None,
		details={"action": action, "exception": name},
	)
	return {"name": exception.name, "status": exception.statut}


def _decode_evidence(data: str, label: str) -> bytes:
	if not isinstance(data, str) or not data:
		frappe.throw(_("{0} invalide.").format(label))
	encoded = data.split(",", 1)[1] if "," in data else data
	try:
		content = base64.b64decode(encoded, validate=True)
	except (ValueError, binascii.Error):
		frappe.throw(_("{0} invalide.").format(label))
	if len(content) > 8 * 1024 * 1024:
		frappe.throw(_("{0} dépasse la taille maximale de 8 Mo.").format(label))
	return content


def _attach_image(delivery_note: str, fieldname: str, data: str, filename: str) -> str:
	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": filename,
			"attached_to_doctype": "Delivery Note",
			"attached_to_name": delivery_note,
			"attached_to_field": fieldname,
			"content": _decode_evidence(data, filename),
			"is_private": 1,
		}
	).insert(ignore_permissions=True)
	return file_doc.file_url


def _validate_completion(data: dict[str, Any], doc, *, requires_customer_geolocation: bool = False):
	balance = max(flt(doc.grand_total) - _paid_amount(doc.name), 0)
	errors = completion_errors(
		data,
		balance=balance,
		failure_reasons=FAILURE_REASONS,
		requires_customer_geolocation=requires_customer_geolocation,
	)
	if errors:
		frappe.throw(_(errors[0]))


def _capture_missing_customer_location(doc, evidence: dict[str, Any], *, outcome: str) -> bool:
	if outcome not in {"delivered", "partial"} or not doc.customer:
		return False
	latitude, longitude = parse_gps_value(frappe.db.get_value("Customer", doc.customer, "custom_gps"))
	if latitude is not None and longitude is not None:
		return False
	values = {
		"custom_gps": f"{float(evidence['latitude']):.8f},{float(evidence['longitude']):.8f}",
	}
	audit_values = {
		"custom_gps_precision_m": flt(evidence.get("accuracy")),
		"custom_gps_capture_date": now_datetime(),
		"custom_gps_capture_user": frappe.session.user,
		"custom_gps_source_bl": doc.name,
	}
	for field, value in audit_values.items():
		if frappe.db.has_column("Customer", field):
			values[field] = value
	frappe.db.set_value("Customer", doc.customer, values)
	return True


def _save_delivery_completion(doc):
	"""Persist the controlled delivery result without revalidating the commercial document.

	The endpoint validates quantities, evidence and payment before reaching this point. Running the
	standard ERPNext Delivery Note validation again reloads Item details and checks Item permissions
	for the driver, although the driver is only allowed to complete the assigned stop. Keeping the
	normal save pipeline while skipping ``validate`` preserves timestamps, child updates and hooks
	without granting broad ERP permissions to the Livreur role.
	"""
	doc.flags.ignore_validate = True
	doc.flags.ignore_validate_update_after_submit = True
	doc.save(ignore_permissions=True)


def _customer_location_was_captured_by(doc) -> bool:
	return bool(
		doc.customer
		and frappe.db.has_column("Customer", "custom_gps_source_bl")
		and frappe.db.get_value("Customer", doc.customer, "custom_gps_source_bl") == doc.name
	)


def _apply_items(doc, data: dict[str, Any]):
	outcome = data["outcome"]
	by_name = {str(row.get("itemName")): row for row in data.get("items") or [] if row.get("itemName")}
	if outcome == "delivered":
		for item in doc.items:
			item.custom_quantite_livree = item.qty
			item.custom_statut_article = "Livré"
			item.custom_raison_non_livraison = None
			item.custom_commentaire_article = None
	elif outcome == "partial":
		if not any(flt(row.get("deliveredQuantity")) > 0 for row in by_name.values()):
			frappe.throw(_("Saisissez au moins une quantité livrée."))
		for item in doc.items:
			row = by_name.get(item.name)
			if not row:
				continue
			increment = flt(row.get("deliveredQuantity"))
			current = flt(item.get("custom_quantite_livree"))
			if increment < 0 or current + increment > flt(item.qty):
				frappe.throw(_("Quantité invalide pour l'article {0}.").format(item.item_code))
			item.custom_quantite_livree = current + increment
			item.custom_statut_article = "Livré" if item.custom_quantite_livree >= flt(item.qty) else "Partiellement livré"
			item.custom_raison_non_livraison = row.get("failureReason")
			item.custom_commentaire_article = row.get("comment")
	else:
		for item in doc.items:
			if flt(item.get("custom_quantite_livree")) < flt(item.qty):
				item.custom_statut_article = "Non livré"
				item.custom_raison_non_livraison = data.get("failureReason")
				item.custom_commentaire_article = data.get("failureComment")


def _apply_payment_to_driver_cash(payment_doc, route):
	from log.services.distribution_driver_cash import mark_route_pending_cash_control, post_declared_cash

	post_declared_cash(payment_doc, route)
	mark_route_pending_cash_control(route)


def _new_payment(data: dict[str, Any], route, doc, request_id: str):
	payment = data.get("payment")
	if not payment:
		return None
	existing = frappe.db.get_value("Paiement Client", {"request_id": request_id}, "name")
	if existing:
		_apply_payment_to_driver_cash(frappe.get_doc("Paiement Client", existing), route)
		return existing
	cheque_url = None
	if payment["method"] == "cheque":
		cheque_url = _attach_image(doc.name, "custom_photo_livraison", payment["chequePhotoData"], f"cheque_{request_id}.jpg")
	payment_doc = frappe.get_doc(
		{
			"doctype": "Paiement Client",
			"date": today(),
			"id_beneficiaire": frappe.session.user,
			"client": doc.customer,
			"livraison": route.name,
			"bon_livraison": doc.name,
			"moyen_paiement": "Espèce" if payment["method"] == "cash" else "Chèque",
			"montant": flt(payment["amount"]),
			"photo_cheque": cheque_url,
			"date_encaissement": payment.get("collectionDate"),
			"numero_cheque": payment.get("chequeNumber"),
			"statut_controle": "Déclaré",
			"facture_source": doc.get("custom_sales_invoice"),
			"request_id": request_id,
		}
	).insert(ignore_permissions=True)
	_apply_payment_to_driver_cash(payment_doc, route)
	return payment_doc.name


def _refresh_route_lifecycle(route):
	statuses = [
		frappe.db.get_value("Delivery Note", row.bon_de_livraison, "custom_statut")
		for row in route.bons_de_livraison
	]
	empty_return_closed = False
	if statuses and all(status in TERMINAL_STOP_STATES for status in statuses):
		for row in route.bons_de_livraison:
			dn = frappe.get_doc("Delivery Note", row.bon_de_livraison)
			planning_status = "Terminé" if dn.docstatus == 1 else "En attente retour"
			_set_delivery_note_assignment(dn, route, planning_status)
		from log.services.distribution_fulfillment import complete_empty_route_return, declare_route_return

		if complete_empty_route_return(route, persist=False):
			empty_return_closed = True
		else:
			declare_route_return(route, persist=False)
	# Nested DN/payment writes can bump Livraison.modified in the same request.
	_refresh_document_timestamp(route)
	route.save(ignore_permissions=True)
	if empty_return_closed:
		_try_complete_route(frappe.get_doc("Livraison", route.name))


@frappe.whitelist()
def select_next_delivery_stop(route_id, delivery_note, expected_revision=None):
	"""Place un arrêt restant en tête de file sans figer la révision acceptée."""
	_require(DRIVER_ROLES)
	_require_schema()
	delivery_note = str(delivery_note or "").strip()
	route_id = str(route_id or "").strip()
	if not route_id or not frappe.db.exists("Livraison", route_id):
		frappe.throw(_("Tournée introuvable."))
	_lock_route(route_id)
	doc = frappe.get_doc("Livraison", route_id)
	_assert_driver_route(doc)
	if _route_state(doc) != "En cours":
		frappe.throw(_("La tournée doit être en cours pour choisir le prochain arrêt."))
	if expected_revision not in (None, "") and cint(expected_revision) != cint(doc.revision):
		frappe.throw(_("La tournée a été révisée. Actualisez-la avant de changer l'ordre."))
	current_names = [row.bon_de_livraison for row in doc.bons_de_livraison or [] if row.bon_de_livraison]
	status_rows = (
		frappe.get_all(
			"Delivery Note",
			filters={"name": ["in", current_names]},
			fields=["name", "custom_statut"],
		)
		if current_names
		else []
	)
	statuses = {row.name: str(row.custom_statut or "") for row in status_rows}
	ordered = _next_remaining_order(current_names, statuses, delivery_note)
	if ordered == current_names:
		return _serialize_route(doc)
	_apply_stop_order(doc, ordered)
	_invalidate_route_routing(doc)
	doc.save(ignore_permissions=True)
	return _serialize_route(doc)


@frappe.whitelist()
def complete_delivery_stop(payload):
	_require(DRIVER_ROLES)
	_require_schema()
	data = _payload(payload)
	request_id = str(data.get("requestId") or "").strip()
	if not request_id or len(request_id) > 140:
		frappe.throw(_("Identifiant de requête manquant ou invalide."))
	_lock_route(data.get("routeId"))
	route = frappe.get_doc("Livraison", data.get("routeId"))
	_assert_driver_route(route)
	if data.get("routeRevision") not in (None, "") and cint(data.get("routeRevision")) != cint(route.revision):
		frappe.throw(_("La tournée a été révisée. Actualisez-la avant de valider cet arrêt."))
	delivery_note = data.get("deliveryNote")
	if delivery_note not in {row.bon_de_livraison for row in route.bons_de_livraison}:
		frappe.throw(_("Ce bon de livraison n'appartient pas à la tournée."), frappe.PermissionError)
	_lock_delivery_note(delivery_note)
	doc = frappe.get_doc("Delivery Note", delivery_note)
	gate = complete_stop_gate_error(
		route_state=_route_state(route),
		loaded=_route_is_loaded(route),
		stop_status=str(doc.get("custom_statut") or ""),
	)
	if gate:
		frappe.throw(_(gate))
	if is_repeated_request(doc.get("custom_last_delivery_request_id"), request_id):
		return {
			"success": True,
			"idempotent": True,
			"customerLocationUpdated": _customer_location_was_captured_by(doc),
			"route": _serialize_route(frappe.get_doc("Livraison", route.name)),
		}
	if doc.docstatus == 1 or doc.get("custom_statut") in {"Livré", "Partiellement Livré"}:
		frappe.throw(_("Ce bon livré est en lecture seule."))

	if doc.customer:
		_lock_customer(doc.customer)
	customer_latitude, customer_longitude = parse_gps_value(
		frappe.db.get_value("Customer", doc.customer, "custom_gps") if doc.customer else None
	)
	requires_customer_geolocation = customer_latitude is None or customer_longitude is None
	_validate_completion(data, doc, requires_customer_geolocation=requires_customer_geolocation)
	_apply_items(doc, data)
	evidence = data["evidence"]
	doc.custom_gps = f"{float(evidence['latitude']):.8f},{float(evidence['longitude']):.8f}"
	if doc.meta.has_field("custom_gps_accuracy_m"):
		doc.custom_gps_accuracy_m = flt(evidence.get("accuracy"))
	doc.custom_commentaire_livreur = evidence.get("comment") or data.get("failureComment")
	if evidence.get("photoData"):
		doc.custom_photo_livraison = _attach_image(doc.name, "custom_photo_livraison", evidence["photoData"], f"livraison_{request_id}.jpg")
	if evidence.get("signatureData"):
		doc.custom_signature_livraison = _attach_image(doc.name, "custom_signature_livraison", evidence["signatureData"], f"signature_{request_id}.png")
		doc.custom_nom_signataire = str(evidence.get("signerName")).strip()
	doc.custom_last_delivery_request_id = request_id
	from log.services.distribution_fulfillment import finalize_delivery_document

	accounting = finalize_delivery_document(route, doc, data["outcome"])
	if accounting.get("salesInvoice"):
		doc.custom_sales_invoice = accounting["salesInvoice"]
	customer_location_updated = _capture_missing_customer_location(
		doc,
		evidence,
		outcome=data["outcome"],
	) if requires_customer_geolocation else False
	payment_name = _new_payment(data, route, doc, request_id)
	_refresh_route_lifecycle(route)
	return {
		"success": True,
		"idempotent": False,
		"customerLocationUpdated": customer_location_updated,
		"payment": payment_name,
		"accounting": accounting,
		"route": _serialize_route(frappe.get_doc("Livraison", route.name)),
	}


def _try_complete_route(route):
	if route.get("statut_chargement") != "Retourné":
		return
	payment_count = frappe.db.count("Paiement Client", {"livraison": route.name, "statut_controle": ["!=", "Annulé"]})
	if payment_count and route.get("statut_caisse") != "Validée":
		return
	from log.services.distribution_fulfillment import resolve_billing_exceptions

	for row in route.bons_de_livraison or []:
		if frappe.db.get_value("Delivery Note", row.bon_de_livraison, "custom_statut_facturation") == "Erreur":
			return
		resolve_billing_exceptions(
			row.bon_de_livraison,
			frappe.db.get_value("Delivery Note", row.bon_de_livraison, "custom_sales_invoice"),
		)
	open_exceptions = frappe.db.count(
		"Exception Distribution",
		{"tournee": route.name, "statut": ["in", ["Ouverte", "En traitement"]]},
	)
	if open_exceptions:
		return
	route.etat_planification = "Terminée"
	route.date_fin = route.date_fin or now_datetime()
	if not payment_count:
		route.statut_caisse = "Sans encaissement"
	_refresh_document_timestamp(route)
	route.save(ignore_permissions=True)


@frappe.whitelist()
def declare_route_return(route_id, expected_revision=None, request_id=None):
	_require(DRIVER_ROLES)
	_require_schema()
	_lock_route(route_id)
	route = frappe.get_doc("Livraison", route_id)
	_assert_driver_route(route)
	request_id = str(request_id or "").strip()
	if request_id and route.get("last_return_request_id") == request_id and route.get("statut_chargement") in {"Retour déclaré", "Retourné"}:
		return _serialize_route(route)
	if expected_revision not in (None, "") and cint(expected_revision) != cint(route.revision):
		frappe.throw(_("La tournée a été révisée. Actualisez-la."))
	statuses = {
		frappe.db.get_value("Delivery Note", row.bon_de_livraison, "custom_statut")
		for row in route.bons_de_livraison or []
	}
	if not statuses or not statuses.issubset(TERMINAL_STOP_STATES):
		frappe.throw(_("Tous les arrêts doivent avoir un résultat avant le retour."))
	from log.services.distribution_fulfillment import complete_empty_route_return, declare_route_return as declare_return

	if complete_empty_route_return(route):
		_try_complete_route(frappe.get_doc("Livraison", route.name))
		return _serialize_route(frappe.get_doc("Livraison", route.name))
	declare_return(route)
	if route.meta.has_field("last_return_request_id"):
		frappe.db.set_value("Livraison", route.name, "last_return_request_id", request_id or None, update_modified=False)
	return _serialize_route(frappe.get_doc("Livraison", route.name))


@frappe.whitelist()
def get_route_return(route_id):
	_require(PREPARATION_ROLES | DRIVER_ROLES)
	_require_schema()
	route = frappe.get_doc("Livraison", route_id)
	if _roles() & {"Livreur"} and not (_roles() & {"Responsable", "System Manager"}):
		_assert_driver_route(route)
	from log.services.distribution_fulfillment import route_stock_summary

	return route_stock_summary(route)


@frappe.whitelist()
def get_return_routes(date_from=None, date_to=None):
	_require(PREPARATION_ROLES)
	_require_schema()
	start = getdate(date_from or add_days(today(), -7))
	end = getdate(date_to or today())
	return [
		route
		for route in (
			_serialize_route(frappe.get_doc("Livraison", row.name))
			for row in frappe.get_all(
				"Livraison",
				filters={
					"date_liv": ["between", [start, end]],
					"statut_chargement": ["in", ["Retour requis", "Retour déclaré", "Exception"]],
				},
				fields=["name"],
				order_by="date_liv asc, modified asc",
			)
		)
		if flt((route.get("stock") or {}).get("remainingQuantity")) > 0
	]


@frappe.whitelist()
def get_return_metrics(days=30):
	_require(PREPARATION_ROLES)
	_require_schema()
	from log.services.distribution_fulfillment import return_control_metrics

	return return_control_metrics(days)


@frappe.whitelist()
def get_return_history(date_from=None, date_to=None):
	_require(PREPARATION_ROLES)
	_require_schema()
	from log.services.distribution_fulfillment import list_return_history

	start = getdate(date_from or add_days(today(), -30))
	end = getdate(date_to or today())
	return list_return_history(start, end)


@frappe.whitelist()
def confirm_route_return(payload):
	_require(PREPARATION_ROLES)
	_require_schema()
	data = _payload(payload)
	route_id = str(data.get("routeId") or "").strip()
	_lock_route(route_id)
	route = frappe.get_doc("Livraison", route_id)
	if data.get("expectedRevision") not in (None, "") and cint(data.get("expectedRevision")) != cint(route.revision):
		frappe.throw(_("La tournée a été révisée. Actualisez-la."))
	for line in route.get("lignes_chargement") or []:
		for delivery_note in {line.delivery_note, line.get("residual_delivery_note")} - {None, ""}:
			_lock_delivery_note(delivery_note)
	from log.services.distribution_fulfillment import confirm_route_return as confirm_return

	result = confirm_return(route, data.get("lines") or [])
	if result.get("success") and route.meta.has_field("last_return_confirmation_request_id"):
		frappe.db.set_value("Livraison", route_id, "last_return_confirmation_request_id", data.get("requestId"), update_modified=False)
	if result.get("success"):
		route = frappe.get_doc("Livraison", route_id)
		_try_complete_route(route)
	result["route"] = _serialize_route(frappe.get_doc("Livraison", route_id))
	return result


@frappe.whitelist()
def get_cashier_routes(date_from=None, date_to=None, status=None):
	_require(CASHIER_ROLES)
	_require_schema()
	start = getdate(date_from or today())
	end = getdate(date_to or add_days(start, 7))
	filters: dict[str, Any] = {
		"date_liv": ["between", [start, end]],
	}
	if status:
		filters["statut_caisse"] = status
	return [
		_serialize_route(frappe.get_doc("Livraison", row.name))
		for row in frappe.get_all(
			"Livraison",
			filters=filters,
			or_filters=[
				["etat_planification", "in", ["Retour dépôt", "Contrôle caisse", "Terminée"]],
				["statut_caisse", "in", ["À contrôler", "Écart", "Validée"]],
			],
			fields=["name"],
			order_by="date_liv desc, modified desc",
		)
	]


@frappe.whitelist()
def get_cashier_reconciliation(route_id=None):
	_require(CASHIER_ROLES)
	_require_schema()
	route_id = str(route_id or "").strip()
	if not route_id:
		return None
	from log.services.distribution_cashier import reconciliation

	return reconciliation(frappe.get_doc("Livraison", route_id))


@frappe.whitelist()
def get_customer_outstanding_invoices(customer, company, currency="DZD"):
	_require(CASHIER_ROLES)
	_require_schema()
	from log.services.distribution_cashier import outstanding_invoices

	return outstanding_invoices(customer, company, currency)


@frappe.whitelist()
def validate_cash_reconciliation(payload):
	_require(CASHIER_ROLES)
	_require_schema()
	data = _payload(payload)
	route_id = str(data.get("routeId") or "").strip()
	_lock_route(route_id)
	route = frappe.get_doc("Livraison", route_id)
	if data.get("expectedRevision") not in (None, "") and cint(data.get("expectedRevision")) != cint(route.revision):
		frappe.throw(_("La tournée a été révisée. Actualisez-la."))
	from log.services.distribution_cashier import validate_reconciliation

	result = validate_reconciliation(route, data)
	if not result.get("requiresManagerApproval"):
		_try_complete_route(frappe.get_doc("Livraison", route_id))
	return {
		"reconciliation": result,
		"route": _serialize_route(frappe.get_doc("Livraison", route_id)),
	}


@frappe.whitelist()
def resolve_cash_discrepancy(payload):
	_require({"Responsable", "System Manager"})
	_require_schema()
	data = _payload(payload)
	route_id = str(data.get("routeId") or "").strip()
	if not str(data.get("reason") or "").strip():
		frappe.throw(_("La décision du Responsable doit être motivée."))
	_lock_route(route_id)
	route = frappe.get_doc("Livraison", route_id)
	from log.services.distribution_cashier import validate_reconciliation

	result = validate_reconciliation(route, data, approved_by_responsible=True)
	for exception in frappe.get_all(
		"Exception Distribution",
		filters={"tournee": route_id, "type_exception": "Écart de caisse", "statut": ["in", ["Ouverte", "En traitement"]]},
		pluck="name",
	):
		frappe.db.set_value(
			"Exception Distribution",
			exception,
			{
				"statut": "Résolue",
				"resolution": data["reason"],
				"resolue_par": frappe.session.user,
				"date_resolution": now_datetime(),
			},
		)
	_try_complete_route(frappe.get_doc("Livraison", route_id))
	return {"reconciliation": result, "route": _serialize_route(frappe.get_doc("Livraison", route_id))}


@frappe.whitelist()
def retry_delivery_invoice(delivery_note):
	_require({"Responsable", "System Manager"})
	_require_schema()
	_lock_delivery_note(delivery_note)
	dn = frappe.get_doc("Delivery Note", delivery_note)
	if dn.docstatus != 1:
		frappe.throw(_("Le bon doit être validé avant sa facturation."))
	route_id = dn.get("custom_tournee")
	if not route_id:
		frappe.throw(_("Aucune tournée n'est liée à ce bon."))
	_lock_route(route_id)
	route = frappe.get_doc("Livraison", route_id)
	from log.services.distribution_fulfillment import create_and_submit_invoice

	invoice, invoice_status = create_and_submit_invoice(route, dn.name)
	_try_complete_route(route)
	return {"salesInvoice": invoice, "invoiceStatus": invoice_status, "route": _serialize_route(route)}


@frappe.whitelist()
def get_vehicle_stocks():
	_require(STOCK_ROLES)
	from log.services.distribution_vehicle_stock import vehicle_stock_snapshot

	return vehicle_stock_snapshot()


@frappe.whitelist()
def get_driver_cash_boxes():
	_require(MANAGER_ROLES)
	from log.services.distribution_driver_cash import list_cash_boxes

	return list_cash_boxes()


@frappe.whitelist()
def get_driver_cash_box(livreur=None):
	_require(MANAGER_ROLES)
	livreur = str(livreur or "").strip()
	if not livreur:
		return None
	from log.services.distribution_driver_cash import get_cash_box

	return get_cash_box(livreur)


@frappe.whitelist()
def post_driver_cash_adjustment(payload):
	_require(MANAGER_ROLES)
	data = _payload(payload)
	from log.services.distribution_driver_cash import post_adjustment

	return post_adjustment(
		str(data.get("driver") or "").strip(),
		str(data.get("type") or "").strip(),
		flt(data.get("amount")),
		str(data.get("reason") or ""),
		str(data.get("routeId") or "").strip() or None,
	)


@frappe.whitelist()
def get_legacy_route_regularization(route_id):
	_require({"Responsable", "System Manager"})
	_require_schema()
	route = frappe.get_doc("Livraison", route_id)
	return {
		"routeId": route.name,
		"needsRegularization": not bool(route.get("stock_entry_chargement")) and _route_state(route) == "En cours",
		"stops": [
			{
				"deliveryNote": row.bon_de_livraison,
				"status": frappe.db.get_value("Delivery Note", row.bon_de_livraison, "custom_statut"),
				"deliveredQuantity": sum(
					flt(item.custom_quantite_livree)
					for item in frappe.get_all("Delivery Note Item", filters={"parent": row.bon_de_livraison}, fields=["custom_quantite_livree"])
				),
			}
			for row in route.bons_de_livraison or []
		],
	}


@frappe.whitelist()
def regularize_legacy_route(route_id, confirmed=0):
	_require({"Responsable", "System Manager"})
	_require_schema()
	if not cint(confirmed):
		frappe.throw(_("Confirmez que les marchandises ont réellement été chargées dans le véhicule."))
	_lock_route(route_id)
	route = frappe.get_doc("Livraison", route_id)
	statuses = {
		row.bon_de_livraison: frappe.db.get_value("Delivery Note", row.bon_de_livraison, "custom_statut")
		for row in route.bons_de_livraison or []
	}
	from log.services.distribution_fulfillment import finalize_delivery_document, load_route_stock

	for delivery_note, status in statuses.items():
		dn = frappe.get_doc("Delivery Note", delivery_note)
		if dn.docstatus != 0:
			frappe.throw(_("Le bon historique {0} n'est plus en brouillon.").format(dn.name))
		if status == "Livré":
			for item in dn.items or []:
				item.custom_quantite_livree = item.qty
		elif status == "Partiellement Livré":
			delivered = sum(flt(item.get("custom_quantite_livree")) for item in dn.items or [])
			remaining = sum(max(flt(item.qty) - flt(item.get("custom_quantite_livree")), 0) for item in dn.items or [])
			if delivered <= 0 or remaining <= 0:
				frappe.throw(
					_("Corrigez les quantités réellement livrées du bon {0} avant la régularisation.").format(dn.name)
				)
		dn.flags.ignore_validate = True
		dn.save(ignore_permissions=True)
	load_route_stock(route, historical=True)
	for delivery_note, status in statuses.items():
		if status not in {"Livré", "Partiellement Livré"}:
			if status in TERMINAL_STOP_STATES:
				dn = frappe.get_doc("Delivery Note", delivery_note)
				dn.custom_statut = status
				dn.custom_statut_planification = "En attente retour"
				dn.flags.ignore_validate = True
				dn.save(ignore_permissions=True)
			continue
		dn = frappe.get_doc("Delivery Note", delivery_note)
		finalize_delivery_document(route, dn, "delivered" if status == "Livré" else "partial")
	_refresh_route_lifecycle(route)
	return _serialize_route(frappe.get_doc("Livraison", route_id))


@frappe.whitelist()
def get_fleet_drivers():
	_require(FLEET_ROLES)
	from log.services.distribution_fleet import list_drivers

	return list_drivers()


@frappe.whitelist()
def get_fleet_driver(name=None, date=None):
	_require(FLEET_ROLES)
	from log.services.distribution_fleet import get_driver

	return get_driver(name, date=date)


@frappe.whitelist()
def get_fleet_vehicles():
	_require(FLEET_ROLES)
	from log.services.distribution_fleet import list_vehicles

	return list_vehicles()


@frappe.whitelist()
def get_fleet_vehicle(name=None):
	_require(FLEET_ROLES)
	from log.services.distribution_fleet import get_vehicle

	return get_vehicle(name)


@frappe.whitelist()
def get_fleet_options():
	_require(FLEET_ROLES)
	from log.services.distribution_fleet import list_options

	return list_options()


@frappe.whitelist()
def create_fleet_driver(payload):
	_require(FLEET_WRITE_ROLES)
	from log.services.distribution_fleet import create_driver

	return create_driver(_payload(payload))


@frappe.whitelist()
def update_fleet_driver(payload):
	_require(FLEET_WRITE_ROLES)
	from log.services.distribution_fleet import update_driver

	return update_driver(_payload(payload))


@frappe.whitelist()
def assign_fleet_driver_vehicle(payload):
	_require(FLEET_WRITE_ROLES)
	data = _payload(payload)
	from log.services.distribution_fleet import assign_driver_vehicle

	return assign_driver_vehicle(
		str(data.get("driver") or "").strip(),
		str(data.get("vehicle") or "").strip() or None,
		motif=str(data.get("reason") or data.get("motif") or "").strip() or None,
		source="Distribution",
	)


@frappe.whitelist()
def create_fleet_vehicle(payload):
	_require(FLEET_WRITE_ROLES)
	from log.services.distribution_fleet import create_vehicle

	return create_vehicle(_payload(payload))


@frappe.whitelist()
def update_fleet_vehicle(payload):
	_require(FLEET_WRITE_ROLES)
	from log.services.distribution_fleet import update_vehicle

	return update_vehicle(_payload(payload))


@frappe.whitelist()
def assign_fleet_vehicle_driver(payload):
	_require(FLEET_WRITE_ROLES)
	data = _payload(payload)
	from log.services.distribution_fleet import assign_vehicle_driver

	return assign_vehicle_driver(
		str(data.get("vehicle") or "").strip(),
		str(data.get("driver") or "").strip() or None,
		motif=str(data.get("reason") or data.get("motif") or "").strip() or None,
		source="Distribution",
	)


@frappe.whitelist()
def create_fleet_entretien(payload):
	_require(FLEET_WRITE_ROLES)
	from log.services.distribution_fleet import create_entretien

	return create_entretien(_payload(payload))


@frappe.whitelist()
def upload_fleet_document(payload):
	_require(FLEET_WRITE_ROLES)
	data = _payload(payload)
	doctype = str(data.get("doctype") or "").strip()
	name = str(data.get("name") or "").strip()
	field = str(data.get("field") or "").strip()
	filename = str(data.get("filename") or "document").strip() or "document"
	if doctype not in {"Livreur", "Vehicule"}:
		frappe.throw(_("Type de document non pris en charge."))
	content = _decode_evidence(str(data.get("content") or ""), _("Fichier"))
	from log.services.distribution_fleet import attach_document

	return attach_document(
		doctype=doctype,
		name=name,
		field=field,
		filename=filename,
		content=content,
		expiry=data.get("expiry") or None,
	)
