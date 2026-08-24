"""API transactionnelle du frontend IntraPro Distribution."""

from __future__ import annotations

import base64
import binascii
import json
import re
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
	completion_errors,
	driver_owns_route,
	has_assignment_conflict,
	has_any_role,
	is_repeated_request,
	intervals_overlap,
	planning_status_for_route,
	revision_matches,
	stop_status,
)

PLANNING_ROLES = {"Planificateur", "Responsable", "System Manager"}
DRIVER_ROLES = {"Livreur", "Responsable", "System Manager"}
PREPARATION_ROLES = {"Préparateur", "Responsable", "System Manager"}
ACTIVE_ROUTE_STATES = ("Brouillon", "Publiée", "En cours")
TERMINAL_STOP_STATES = {"Livré", "Non Livré", "Annulé"}
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
	)
	missing = [f"{doctype}.{field}" for doctype, field in required if not frappe.db.has_column(doctype, field)]
	if missing:
		frappe.throw(
			_("Le schéma Distribution n'est pas encore synchronisé ({0}). Lancez la migration Bench manuellement.").format(
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


def _parse_gps(value: str | None) -> tuple[float | None, float | None]:
	if not value:
		return None, None
	numbers = re.findall(r"-?\d+(?:\.\d+)?", str(value))
	if len(numbers) < 2:
		return None, None
	latitude, longitude = flt(numbers[0]), flt(numbers[1])
	if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
		return None, None
	return latitude, longitude


def _customer_details(customer: str | None) -> dict[str, Any]:
	if not customer:
		return {}
	data = frappe.db.get_value(
		"Customer",
		customer,
		["customer_name", "custom_gps", "mobile_no"],
		as_dict=True,
	) or {}
	latitude, longitude = _parse_gps(data.get("custom_gps"))
	return {
		"customerName": data.get("customer_name") or customer,
		"phone": data.get("mobile_no"),
		"address": None,
		"latitude": latitude,
		"longitude": longitude,
	}


def _paid_amount(delivery_note: str) -> float:
	return flt(
		frappe.db.sql(
			"SELECT COALESCE(SUM(montant), 0) FROM `tabPaiement Client` WHERE bon_livraison = %s",
			(delivery_note,),
		)[0][0]
	)


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


def _stop_from_dn(doc, sequence: int) -> dict[str, Any]:
	details = _customer_details(doc.customer)
	paid = _paid_amount(doc.name)
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
			}
		)
	remaining_quantity = sum(item["remainingQuantity"] for item in items)
	return {
		"deliveryNote": doc.name,
		"salesOrder": _sales_order_for_dn(doc),
		"customer": doc.customer,
		"customerName": details.get("customerName") or doc.customer_name or doc.customer,
		"commune": doc.get("custom_commune"),
		"wilaya": doc.get("custom_wilaya"),
		"address": doc.get("shipping_address") or details.get("address"),
		"phone": details.get("phone") or doc.get("contact_mobile"),
		"instructions": doc.get("instructions"),
		"latitude": details.get("latitude"),
		"longitude": details.get("longitude"),
		"totalQuantity": remaining_quantity,
		"amountToCollect": max(flt(doc.grand_total) - paid, 0),
		"status": doc.get("custom_statut") or "Nouveau",
		"planningStatus": doc.get("custom_statut_planification") or "Non planifié",
		"requestedDate": str(doc.get("custom_date_de_livraison") or "") or None,
		"plannedDate": str(doc.get("custom_date_planifiee") or "") or None,
		"routeId": doc.get("custom_tournee"),
		"planningAlert": doc.get("custom_motif_invalidation"),
		"sequence": sequence,
		"items": items,
	}


def _route_state(doc) -> str:
	return doc.get("etat_planification") or "Brouillon"


def _serialize_route(doc) -> dict[str, Any]:
	capacity = None
	if doc.vehicule:
		capacity = frappe.db.get_value("Vehicule", doc.vehicule, "capacite_max_articles")
	stops = []
	for sequence, row in enumerate(doc.bons_de_livraison or [], start=1):
		if not row.bon_de_livraison or not frappe.db.exists("Delivery Note", row.bon_de_livraison):
			continue
		stops.append(_stop_from_dn(frappe.get_doc("Delivery Note", row.bon_de_livraison), sequence))
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
		"driverName": doc.nom_livreur,
		"vehicle": doc.vehicule,
		"vehicleCapacity": cint(capacity) if capacity not in (None, "") else None,
		"totalQuantity": sum(stop["totalQuantity"] for stop in stops),
		"totalAmount": sum(stop["amountToCollect"] for stop in stops),
		"stops": stops,
		"publishedAt": str(doc.get("date_publication") or "") or None,
		"startedAt": str(doc.get("date_depart") or "") or None,
		"finishedAt": str(doc.get("date_fin") or "") or None,
		"alerts": [*_schedule_conflicts(doc), *([capacity_warning(capacity)] if capacity_warning(capacity) else [])],
	}


def _active_assignment(delivery_note: str, except_route: str | None = None) -> str | None:
	params: list[Any] = [delivery_note, *ACTIVE_ROUTE_STATES]
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
		  AND l.etat_planification IN (%s, %s, %s)
		  AND l.docstatus < 2{exclusion}
		LIMIT 1
		""",
		tuple(params),
	)
	return rows[0][0] if rows else None


def _lock_delivery_note(delivery_note: str):
	frappe.db.sql("SELECT name FROM `tabDelivery Note` WHERE name = %s FOR UPDATE", (delivery_note,))


def _lock_route(route_id: str):
	frappe.db.sql("SELECT name FROM `tabLivraison` WHERE name = %s FOR UPDATE", (route_id,))


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


@frappe.whitelist()
def get_planning_board(date_from=None, date_to=None, filters=None, date=None):
	_require(PLANNING_ROLES)
	_require_schema()
	start_date = getdate(date_from or date or today())
	end_date = getdate(date_to or date or add_days(start_date, 6))
	if end_date < start_date:
		frappe.throw(_("La date de fin doit être postérieure à la date de début."))
	if (end_date - start_date).days > 62:
		frappe.throw(_("La plage de planification ne peut pas dépasser 63 jours."))
	filter_data = _payload(filters) if filters else {}

	routes = [
		_serialize_route(frappe.get_doc("Livraison", row.name))
		for row in frappe.get_all(
			"Livraison",
			filters={"date_liv": ["between", [start_date, end_date]], "docstatus": ["<", 2]},
			fields=["name"],
			order_by="date_liv asc, depart_prevu asc, creation asc",
		)
	]
	assigned = {
		stop["deliveryNote"]
		for route in routes
		if route["lifecycle"] in ACTIVE_ROUTE_STATES
		for stop in route["stops"]
	}

	unassigned = []
	eligible_names = frappe.get_all(
		"Delivery Note",
		filters={
			"docstatus": ["<", 2],
			"custom_statut": ["in", ["Préparé", "Enlevé", "Partiellement Livré", "Non Livré"]],
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
			if not (requested and start_date <= requested <= end_date) and planning_status not in {
				"À revalider",
				"À repréparer",
				"Exception",
			}:
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

	def matches(row):
		search = str(filter_data.get("search") or "").strip().lower()
		if search and search not in " ".join(
			str(row.get(key) or "").lower() for key in ("deliveryNote", "customerName", "customer", "commune", "wilaya")
		):
			return False
		for key, row_key in (("status", "planningStatus"), ("driver", "driver"), ("vehicle", "vehicle"), ("route", "route"), ("wilaya", "wilaya")):
			if filter_data.get(key) and row.get(row_key) != filter_data[key]:
				return False
		if filter_data.get("alertsOnly") and not row.get("planningAlert"):
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
		"dateFrom": str(start_date),
		"dateTo": str(end_date),
		"unassigned": unassigned,
		"assignments": assignments,
		"routes": routes,
		"drivers": drivers,
		"vehicles": vehicles,
		"exceptions": exceptions,
	}


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
	return {"route": _serialize_route(doc), "warning": warning}


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


def _compatible_route(data: dict[str, Any], source_name: str | None = None):
	requested_id = data.get("targetRouteId")
	if requested_id:
		_lock_route(requested_id)
		target = frappe.get_doc("Livraison", requested_id)
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
		return frappe.get_doc("Livraison", candidates[0])
	doc = frappe.new_doc("Livraison")
	doc.date_liv = date_value
	doc.depart_prevu = start
	doc.fin_prevue = end
	doc.livreur = driver
	doc.vehicule = vehicle
	doc.planificateur = frappe.session.user
	doc.etat_planification = "Brouillon"
	doc.batch_id = f"distribution:{uuid.uuid4()}"
	doc.revision = 1
	return doc


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

	target = _compatible_route(data, source.name if source else None)
	if _route_state(target) not in {"Brouillon", "Publiée"}:
		frappe.throw(_("La tournée de destination n'est plus modifiable."))
	if target.name and not revision_matches(cint(target.revision), data.get("expectedTargetRevision")):
		frappe.throw(_("La tournée de destination a été modifiée. Actualisez le planning."))
	if change_reason_required(_route_state(target)) and not reason:
		frappe.throw(_("Le motif est obligatoire pour modifier une tournée publiée."))

	before = _route_snapshot(source)
	if source and target.name == source.name:
		requested = {
			"date": str(getdate(data.get("plannedDate") or source.date_liv)),
			"driver": data.get("driver") or source.livreur,
			"vehicle": data.get("vehicle") or source.vehicule,
		}
		if requested != {"date": str(source.date_liv), "driver": source.livreur, "vehicle": source.vehicule}:
			frappe.throw(_("Sélectionnez une autre tournée pour modifier les ressources de ce BL."))
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
		"etat_planification": ["in", ["Publiée", "En cours", "Terminée"]],
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
def get_driver_route(route_id=None):
	"""Compatibilité avec le premier frontend Distribution."""
	if route_id:
		_require(DRIVER_ROLES)
		_require_schema()
		doc = frappe.get_doc("Livraison", route_id)
		_assert_driver_route(doc)
		return _serialize_route(doc)
	routes = get_driver_routes(today())
	return next((route for route in routes if route["lifecycle"] in {"Publiée", "En cours"}), routes[0] if routes else None)


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


@frappe.whitelist()
def start_route(route_id):
	_require(DRIVER_ROLES)
	_require_schema()
	_lock_route(route_id)
	doc = frappe.get_doc("Livraison", route_id)
	_assert_driver_route(doc)
	if not can_transition_route(_route_state(doc), "En cours"):
		frappe.throw(_("Seule une tournée publiée peut être démarrée."))
	if cint(doc.revision_acceptee) != cint(doc.revision_publiee) or cint(doc.revision_publiee) != cint(doc.revision):
		frappe.throw(_("Acceptez la dernière révision de la tournée avant le départ."))
	doc.etat_planification = "En cours"
	doc.date_depart = now_datetime()
	doc.save(ignore_permissions=True)
	from log.delivery_note_ops import _apply_named_status

	for row in doc.bons_de_livraison:
		_set_delivery_note_assignment(frappe.get_doc("Delivery Note", row.bon_de_livraison), doc, "En cours")
		status = frappe.db.get_value("Delivery Note", row.bon_de_livraison, "custom_statut") or "Nouveau"
		if status in {"Préparé", "Partiellement Livré", "Non Livré"}:
			_apply_named_status(row.bon_de_livraison, "Enlevé")
	return _serialize_route(doc)


@frappe.whitelist()
def finish_route(route_id):
	_require(DRIVER_ROLES)
	_require_schema()
	_lock_route(route_id)
	doc = frappe.get_doc("Livraison", route_id)
	_assert_driver_route(doc)
	if not can_transition_route(_route_state(doc), "Terminée"):
		frappe.throw(_("Seule une tournée en cours peut être terminée."))
	statuses = {
		frappe.db.get_value("Delivery Note", row.bon_de_livraison, "custom_statut")
		for row in doc.bons_de_livraison
	}
	if not statuses.issubset(TERMINAL_STOP_STATES):
		frappe.throw(_("Tous les arrêts doivent avoir un résultat avant de terminer la tournée."))
	doc.etat_planification = "Terminée"
	doc.date_fin = now_datetime()
	doc.save(ignore_permissions=True)
	for row in doc.bons_de_livraison:
		_set_delivery_note_assignment(frappe.get_doc("Delivery Note", row.bon_de_livraison), doc, "Terminé")
	return _serialize_route(doc)


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


def _validate_completion(data: dict[str, Any], doc):
	balance = max(flt(doc.grand_total) - _paid_amount(doc.name), 0)
	errors = completion_errors(data, balance=balance, failure_reasons=FAILURE_REASONS)
	if errors:
		frappe.throw(_(errors[0]))


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


def _new_payment(data: dict[str, Any], route, doc, request_id: str):
	payment = data.get("payment")
	if not payment:
		return None
	existing = frappe.db.get_value("Paiement Client", {"request_id": request_id}, "name")
	if existing:
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
			"request_id": request_id,
		}
	).insert(ignore_permissions=True)
	return payment_doc.name


def _refresh_route_lifecycle(route):
	statuses = [
		frappe.db.get_value("Delivery Note", row.bon_de_livraison, "custom_statut")
		for row in route.bons_de_livraison
	]
	if statuses and all(status in TERMINAL_STOP_STATES for status in statuses):
		route.etat_planification = "Terminée"
		route.date_fin = route.date_fin or now_datetime()
		route.save(ignore_permissions=True)
		for row in route.bons_de_livraison:
			_set_delivery_note_assignment(frappe.get_doc("Delivery Note", row.bon_de_livraison), route, "Terminé")


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
	if _route_state(route) != "En cours":
		frappe.throw(_("La tournée doit être démarrée avant de valider un arrêt."))
	delivery_note = data.get("deliveryNote")
	if delivery_note not in {row.bon_de_livraison for row in route.bons_de_livraison}:
		frappe.throw(_("Ce bon de livraison n'appartient pas à la tournée."), frappe.PermissionError)
	_lock_delivery_note(delivery_note)
	doc = frappe.get_doc("Delivery Note", delivery_note)
	if is_repeated_request(doc.get("custom_last_delivery_request_id"), request_id):
		return {
			"success": True,
			"idempotent": True,
			"route": _serialize_route(frappe.get_doc("Livraison", route.name)),
		}
	if doc.get("custom_statut") == "Livré":
		frappe.throw(_("Ce bon livré est en lecture seule."))

	_validate_completion(data, doc)
	_apply_items(doc, data)
	evidence = data["evidence"]
	doc.custom_gps = f"{flt(evidence['latitude'])},{flt(evidence['longitude'])}"
	doc.custom_commentaire_livreur = evidence.get("comment") or data.get("failureComment")
	if evidence.get("photoData"):
		doc.custom_photo_livraison = _attach_image(doc.name, "custom_photo_livraison", evidence["photoData"], f"livraison_{request_id}.jpg")
	if evidence.get("signatureData"):
		doc.custom_signature_livraison = _attach_image(doc.name, "custom_signature_livraison", evidence["signatureData"], f"signature_{request_id}.png")
		doc.custom_nom_signataire = str(evidence.get("signerName")).strip()
	doc.custom_last_delivery_request_id = request_id
	remaining = sum(max(flt(item.qty) - flt(item.get("custom_quantite_livree")), 0) for item in doc.items)
	delivered = sum(flt(item.get("custom_quantite_livree")) for item in doc.items)
	doc.custom_statut = stop_status(
		remaining_quantity=remaining,
		delivered_quantity=delivered,
		outcome=data["outcome"],
	)
	doc.flags.ignore_validate_update_after_submit = True
	frappe.flags.in_distribution_completion = True
	try:
		doc.save(ignore_permissions=True)
	finally:
		frappe.flags.in_distribution_completion = False
	payment_name = _new_payment(data, route, doc, request_id)
	_refresh_route_lifecycle(route)
	return {
		"success": True,
		"idempotent": False,
		"payment": payment_name,
		"route": _serialize_route(frappe.get_doc("Livraison", route.name)),
	}
