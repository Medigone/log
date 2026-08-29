"""Référentiel flotte : livreurs, véhicules, documents et affectation 1-1."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import add_days, cint, cstr, flt, getdate, today, validate_email_address

from log.services.distribution_driver_cash import get_cash_box
from log.services.distribution_driver_dashboard import build_driver_dashboard

DRIVER_STATUSES = ("Actif", "En congé", "Indisponible")
VEHICLE_STATUSES = ("Disponible", "En maintenance", "Hors service")
ENTRETIEN_STATUSES = ("Programmé", "En Cours", "Terminé")
ENTRETIEN_TYPES = ("Préventif", "Correctif", "Autre")
DRIVER_ROLES = ("Livreur", "Delivery User")
MIN_PASSWORD_LENGTH = 8
DOCUMENT_WARNING_DAYS = 30
MAINTENANCE_WARNING_DAYS = 30
ROUTE_LIMIT = 12
ENTRETIEN_LIMIT = 12
ASSIGNMENT_HISTORY_LIMIT = 100
ACTIVE_ROUTE_STATES = ("Brouillon", "Publiée", "En cours", "Retour dépôt", "Contrôle caisse")
FLEET_ASSIGNMENT_HISTORY = "Historique Affectation Flotte"
_UNSET = object()

DRIVER_DOCUMENTS = {
	"permis": {"field": "permis", "expiryField": "valable", "label": "Permis de conduire"},
}

VEHICLE_DOCUMENTS = {
	"carte_grise": {"field": "carte_grise", "expiryField": None, "label": "Carte grise"},
	"vignette": {"field": "vignette", "expiryField": None, "label": "Vignette"},
	"assurance": {"field": "assurance", "expiryField": "date_exp_assurance", "label": "Assurance"},
	"controle_technique": {
		"field": "controle_technique",
		"expiryField": "date_exp_cont_tech",
		"label": "Contrôle technique",
	},
}

VEHICLE_IMAGE = {"field": "image", "expiryField": None, "label": "Photo du véhicule"}


def date_str(value) -> str | None:
	if not value:
		return None
	return str(getdate(value))


def document_alert(expiry, *, today_value=None, warning_days: int = DOCUMENT_WARNING_DAYS) -> str | None:
	if not expiry:
		return None
	current = getdate(today_value or today())
	limit = getdate(expiry)
	if limit < current:
		return "expired"
	if limit <= getdate(add_days(current, warning_days)):
		return "expiring"
	return "valid"


def maintenance_alert(next_date, *, today_value=None) -> str | None:
	alert = document_alert(next_date, today_value=today_value, warning_days=MAINTENANCE_WARNING_DAYS)
	if alert == "expired":
		return "due"
	if alert == "expiring":
		return "upcoming"
	return None


def vehicle_label(nom: str | None, immatriculation: str | None, name: str | None = None) -> str:
	return " · ".join(filter(None, [nom, immatriculation])) or name or ""


def _attr(row: Any, key: str, default=None):
	if isinstance(row, dict):
		return row.get(key, default)
	return getattr(row, key, default)


def serialize_document(spec: dict[str, str | None], row, *, today_value=None) -> dict[str, Any]:
	url = _attr(row, spec["field"]) or None
	expiry = date_str(_attr(row, spec["expiryField"])) if spec.get("expiryField") else None
	alert = document_alert(expiry, today_value=today_value) if expiry else ("missing" if not url else None)
	return {
		"key": spec["field"],
		"label": spec["label"],
		"url": url,
		"expiresOn": expiry,
		"alert": alert,
	}


def summarize_driver_kpis(drivers: list[dict[str, Any]]) -> dict[str, int]:
	return {
		"total": len(drivers),
		"active": sum(1 for row in drivers if row.get("status") == "Actif" and row.get("active")),
		"onLeave": sum(1 for row in drivers if row.get("status") == "En congé"),
		"unavailable": sum(1 for row in drivers if row.get("status") == "Indisponible"),
		"withoutVehicle": sum(1 for row in drivers if row.get("active") and not row.get("vehicle")),
		"licenseAlerts": sum(1 for row in drivers if row.get("license", {}).get("alert") in {"expired", "expiring"}),
		"cashToHandover": sum(1 for row in drivers if flt(row.get("cashBalance")) > 0),
	}


def summarize_vehicle_kpis(vehicles: list[dict[str, Any]]) -> dict[str, int]:
	return {
		"total": len(vehicles),
		"available": sum(1 for row in vehicles if row.get("status") == "Disponible" and row.get("active")),
		"maintenance": sum(1 for row in vehicles if row.get("status") == "En maintenance"),
		"outOfService": sum(1 for row in vehicles if row.get("status") == "Hors service"),
		"withoutDriver": sum(1 for row in vehicles if row.get("active") and not row.get("driver")),
		"documentAlerts": sum(
			1
			for row in vehicles
			if any(doc.get("alert") in {"expired", "expiring"} for doc in row.get("documents") or [])
		),
		"maintenanceDue": sum(1 for row in vehicles if row.get("maintenanceAlert") in {"due", "upcoming"}),
	}


def _vehicle_label_from_name(name: str | None, cache: dict[str, str] | None = None) -> str | None:
	if not name:
		return None
	if cache is not None and name in cache:
		return cache[name] or None
	label = _vehicle_summary(name)["label"]
	if cache is not None:
		cache[name] = label or ""
	return label


def _vehicle_summary(name: str | None, cache: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
	empty = {"label": None, "status": None, "active": None}
	if not name:
		return empty
	if cache is not None and name in cache:
		return cache[name]
	row = frappe.db.get_value("Vehicule", name, ["nom", "immatriculation", "status", "active"], as_dict=True)
	if not row:
		summary = {"label": name, "status": None, "active": None}
	else:
		summary = {
			"label": vehicle_label(row.get("nom"), row.get("immatriculation"), name),
			"status": row.get("status") or "Disponible",
			"active": bool(row.get("active", 1)),
		}
	if cache is not None:
		cache[name] = summary
	return summary


def _driver_for_user(user: str | None) -> str | None:
	if not user:
		return None
	return frappe.db.get_value("Livreur", {"id_utilisateur": user}, "name")


def _cash_balances() -> dict[str, dict[str, Any]]:
	return {
		row.livreur: row
		for row in frappe.get_all(
			"Caisse Livreur",
			fields=["name", "livreur", "nom_livreur", "solde", "date_derniere_maj"],
		)
	}


def _serialize_license(row, *, today_value=None) -> dict[str, Any]:
	return serialize_document(DRIVER_DOCUMENTS["permis"], row, today_value=today_value)


def _serialize_vehicle_documents(row, *, today_value=None) -> list[dict[str, Any]]:
	return [serialize_document(spec, row, today_value=today_value) for spec in VEHICLE_DOCUMENTS.values()]


def _serialize_route_row(row, *, vehicle_cache: dict[str, str] | None = None) -> dict[str, Any]:
	return {
		"name": row.name,
		"date": date_str(row.date_liv),
		"lifecycle": row.etat_planification,
		"driver": row.livreur,
		"driverName": row.nom_livreur or row.livreur,
		"vehicle": row.vehicule,
		"vehicleLabel": _vehicle_label_from_name(row.vehicule, vehicle_cache),
		"cashStatus": row.statut_caisse or "Sans encaissement",
	}


def _recent_routes(*, driver: str | None = None, vehicle: str | None = None) -> list[dict[str, Any]]:
	filters: dict[str, Any] = {"docstatus": ["<", 2]}
	if driver:
		filters["livreur"] = driver
	if vehicle:
		filters["vehicule"] = vehicle
	rows = frappe.get_all(
		"Livraison",
		filters=filters,
		fields=["name", "date_liv", "etat_planification", "livreur", "nom_livreur", "vehicule", "statut_caisse"],
		order_by="date_liv desc, creation desc",
		limit=ROUTE_LIMIT,
	)
	cache: dict[str, str] = {}
	return [_serialize_route_row(row, vehicle_cache=cache) for row in rows]


def _active_routes_for_vehicle(vehicle: str) -> list[dict[str, Any]]:
	rows = frappe.get_all(
		"Livraison",
		filters={
			"vehicule": vehicle,
			"etat_planification": ["in", list(ACTIVE_ROUTE_STATES)],
			"docstatus": ["<", 2],
		},
		fields=["name", "date_liv", "etat_planification", "livreur", "nom_livreur", "vehicule", "statut_caisse"],
		order_by="date_liv desc, creation desc",
		limit=8,
	)
	return [_serialize_route_row(row) for row in rows]


def _serialize_driver_row(row, *, cash: dict[str, Any] | None, vehicle_cache: dict[str, dict[str, Any]], today_value=None) -> dict[str, Any]:
	box = cash or {}
	vehicle = _vehicle_summary(row.vehicule, vehicle_cache)
	return {
		"name": row.name,
		"label": row.nom or row.name,
		"user": row.id_utilisateur,
		"status": row.status or "Actif",
		"active": bool(row.active),
		"vehicle": row.vehicule or None,
		"vehicleLabel": vehicle["label"],
		"vehicleStatus": vehicle["status"],
		"vehicleActive": vehicle["active"],
		"license": _serialize_license(row, today_value=today_value),
		"cashBalance": flt(box.get("solde")),
		"cashUpdatedAt": str(box.get("date_derniere_maj") or "") or None,
	}


def _driver_by_user() -> dict[str, dict[str, Any]]:
	return {
		row.id_utilisateur: row
		for row in frappe.get_all("Livreur", fields=["name", "nom", "id_utilisateur"])
		if row.id_utilisateur
	}


def _serialize_vehicle_row(row, *, drivers_by_user: dict[str, dict[str, Any]], today_value=None) -> dict[str, Any]:
	driver_row = drivers_by_user.get(row.chauffeur) if row.chauffeur else None
	documents = _serialize_vehicle_documents(row, today_value=today_value)
	return {
		"name": row.name,
		"nom": row.nom or None,
		"label": vehicle_label(row.nom, row.immatriculation, row.name),
		"registration": row.immatriculation,
		"status": row.status or "Disponible",
		"active": bool(row.active),
		"driver": driver_row.name if driver_row else None,
		"driverName": (driver_row.nom if driver_row else None) or (row.nom_chauffeur if row.chauffeur else None),
		"driverUser": row.chauffeur or None,
		"company": row.company,
		"warehouse": row.warehouse,
		"fuelType": row.type_carb,
		"km": flt(row.km),
		"capacity": cint(row.capacite_max_articles) if row.capacite_max_articles else None,
		"costPerKm": flt(row.cout_km),
		"lastMaintenance": date_str(row.date_dernier_entretien),
		"nextMaintenance": date_str(row.pdate_rochain_entretien),
		"maintenanceAlert": maintenance_alert(row.pdate_rochain_entretien, today_value=today_value),
		"imageUrl": _attr(row, "image") or None,
		"documents": documents,
	}


def list_drivers(*, today_value=None) -> dict[str, Any]:
	rows = frappe.get_all(
		"Livreur",
		fields=["name", "nom", "id_utilisateur", "status", "active", "vehicule", "permis", "valable"],
		order_by="nom asc",
	)
	cash = _cash_balances()
	cache: dict[str, dict[str, Any]] = {}
	drivers = [_serialize_driver_row(row, cash=cash.get(row.name), vehicle_cache=cache, today_value=today_value) for row in rows]
	return {"kpis": summarize_driver_kpis(drivers), "drivers": drivers}


def list_vehicles(*, today_value=None) -> dict[str, Any]:
	fields = [
		"name",
		"nom",
		"immatriculation",
		"status",
		"active",
		"chauffeur",
		"nom_chauffeur",
		"company",
		"warehouse",
		"type_carb",
		"km",
		"capacite_max_articles",
		"cout_km",
		"date_dernier_entretien",
		"pdate_rochain_entretien",
		"carte_grise",
		"vignette",
		"assurance",
		"controle_technique",
		"date_exp_assurance",
		"date_exp_cont_tech",
	]
	if frappe.db.has_column("Vehicule", "image"):
		fields.append("image")
	rows = frappe.get_all(
		"Vehicule",
		fields=fields,
		order_by="nom asc",
	)
	drivers_by_user = _driver_by_user()
	vehicles = [_serialize_vehicle_row(row, drivers_by_user=drivers_by_user, today_value=today_value) for row in rows]
	return {"kpis": summarize_vehicle_kpis(vehicles), "vehicles": vehicles}


def get_driver(name: str, *, date=None) -> dict[str, Any]:
	name = str(name or "").strip()
	if not name or not frappe.db.exists("Livreur", name):
		frappe.throw(_("Livreur introuvable."))
	doc = frappe.get_doc("Livreur", name)
	cache: dict[str, dict[str, Any]] = {}
	cash = None
	try:
		cash = get_cash_box(name)
	except Exception:
		frappe.log_error(title="Caisse livreur flotte")
	user_email = frappe.db.get_value("User", doc.id_utilisateur, "email") if doc.id_utilisateur else None
	row = frappe._dict(
		{
			"name": doc.name,
			"nom": doc.nom,
			"id_utilisateur": doc.id_utilisateur,
			"status": doc.status,
			"active": doc.active,
			"vehicule": doc.vehicule,
			"permis": doc.permis,
			"valable": doc.valable,
		}
	)
	summary = _serialize_driver_row(
		row,
		cash={"solde": (cash or {}).get("balance"), "date_derniere_maj": (cash or {}).get("updatedAt")},
		vehicle_cache=cache,
	)
	summary.update(
		{
			"userEmail": user_email,
			"cash": cash,
			"dashboard": build_driver_dashboard(driver=name, date=date),
			"recentRoutes": _recent_routes(driver=name),
			"assignmentHistory": assignment_history(driver=name),
		}
	)
	return summary


def _entretiens(vehicle: str) -> list[dict[str, Any]]:
	if not frappe.db.exists("DocType", "Entretien Vehicule"):
		return []
	rows = frappe.get_all(
		"Entretien Vehicule",
		filters={"vehicule": vehicle},
		fields=["name", "status", "date", "date_entretien", "type", "km", "reparations", "prochain_entretien", "document"],
		order_by="date desc, creation desc",
		limit=ENTRETIEN_LIMIT,
	)
	return [
		{
			"name": row.name,
			"status": row.status,
			"date": date_str(row.date_entretien or row.date),
			"type": row.type,
			"km": flt(row.km),
			"repairs": row.reparations,
			"nextMaintenance": date_str(row.prochain_entretien),
			"documentUrl": row.document,
		}
		for row in rows
	]


def _driver_label(name: str | None, cache: dict[str, str]) -> str | None:
	if not name:
		return None
	if name not in cache:
		cache[name] = frappe.db.get_value("Livreur", name, "nom") or name
	return cache[name]


def _user_label(name: str | None, cache: dict[str, str]) -> str | None:
	if not name:
		return None
	if name not in cache:
		cache[name] = frappe.utils.get_fullname(name) or name
	return cache[name]


def _serialize_assignment_history_row(row, *, driver_cache: dict[str, str], vehicle_cache: dict[str, str], user_cache: dict[str, str]) -> dict[str, Any]:
	return {
		"name": row.name,
		"action": row.action,
		"at": str(row.date_evenement) if row.date_evenement else None,
		"user": row.utilisateur,
		"userLabel": _user_label(row.utilisateur, user_cache),
		"source": row.source,
		"reason": row.motif,
		"driver": row.livreur,
		"driverLabel": _driver_label(row.livreur, driver_cache),
		"vehicle": row.vehicule,
		"vehicleLabel": _vehicle_label_from_name(row.vehicule, vehicle_cache),
		"driverBefore": row.livreur_avant,
		"driverBeforeLabel": _driver_label(row.livreur_avant, driver_cache),
		"vehicleBefore": row.vehicule_avant,
		"vehicleBeforeLabel": _vehicle_label_from_name(row.vehicule_avant, vehicle_cache),
		"driverAfter": row.livreur_apres,
		"driverAfterLabel": _driver_label(row.livreur_apres, driver_cache),
		"vehicleAfter": row.vehicule_apres,
		"vehicleAfterLabel": _vehicle_label_from_name(row.vehicule_apres, vehicle_cache),
	}


def assignment_history(*, driver: str | None = None, vehicle: str | None = None) -> list[dict[str, Any]]:
	if not frappe.db.exists("DocType", FLEET_ASSIGNMENT_HISTORY):
		return []
	filters: dict[str, Any] = {}
	if driver:
		filters["livreur"] = driver
	if vehicle:
		filters["vehicule"] = vehicle
	if not filters:
		return []
	rows = frappe.get_all(
		FLEET_ASSIGNMENT_HISTORY,
		filters=filters,
		fields=[
			"name",
			"action",
			"date_evenement",
			"utilisateur",
			"source",
			"motif",
			"livreur",
			"vehicule",
			"livreur_avant",
			"vehicule_avant",
			"livreur_apres",
			"vehicule_apres",
		],
		order_by="date_evenement desc, creation desc",
		limit=ASSIGNMENT_HISTORY_LIMIT,
	)
	driver_cache: dict[str, str] = {}
	vehicle_cache: dict[str, str] = {}
	user_cache: dict[str, str] = {}
	return [
		_serialize_assignment_history_row(
			row,
			driver_cache=driver_cache,
			vehicle_cache=vehicle_cache,
			user_cache=user_cache,
		)
		for row in rows
	]


def get_vehicle(name: str, *, today_value=None) -> dict[str, Any]:
	name = str(name or "").strip()
	if not name or not frappe.db.exists("Vehicule", name):
		frappe.throw(_("Véhicule introuvable."))
	doc = frappe.get_doc("Vehicule", name)
	payload = _serialize_vehicle_row(doc, drivers_by_user=_driver_by_user(), today_value=today_value)
	payload.update(
		{
			"recentRoutes": _recent_routes(vehicle=name),
			"activeRoutes": _active_routes_for_vehicle(name),
			"entretiens": _entretiens(name),
			"assignmentHistory": assignment_history(vehicle=name),
		}
	)
	return payload


def _users_with_driver_role() -> set[str]:
	return set(
		frappe.get_all(
			"Has Role",
			filters={"role": ["in", list(DRIVER_ROLES)], "parenttype": "User"},
			pluck="parent",
		)
	)


def list_options() -> dict[str, Any]:
	livreur_rows = frappe.get_all(
		"Livreur",
		fields=["name", "nom", "id_utilisateur", "vehicule", "active"],
		order_by="nom asc",
	)
	vehicle_rows = frappe.get_all(
		"Vehicule",
		fields=["name", "nom", "immatriculation", "chauffeur", "nom_chauffeur", "status", "active"],
		order_by="nom asc",
	)
	linked_users = {row.id_utilisateur for row in livreur_rows if row.id_utilisateur}
	drivers_by_user = {row.id_utilisateur: row for row in livreur_rows if row.id_utilisateur}
	vehicles_by_name = {row.name: row for row in vehicle_rows}

	users = []
	for name in sorted(_users_with_driver_role()):
		if name in linked_users or name in {"Administrator", "Guest"}:
			continue
		full_name, email, enabled = frappe.db.get_value("User", name, ["full_name", "email", "enabled"]) or (None, None, 0)
		if not enabled:
			continue
		users.append({"name": name, "label": full_name or name, "email": email or name})

	vehicles = []
	for row in vehicle_rows:
		if not row.active:
			continue
		driver_row = drivers_by_user.get(row.chauffeur) if row.chauffeur else None
		vehicles.append(
			{
				"name": row.name,
				"label": vehicle_label(row.nom, row.immatriculation, row.name),
				"status": row.status or "Disponible",
				"driver": driver_row.name if driver_row else None,
				"driverName": (driver_row.nom if driver_row else None) or (row.nom_chauffeur if row.chauffeur else None),
				"driverUser": row.chauffeur or None,
			}
		)

	drivers = []
	for row in livreur_rows:
		if not row.active:
			continue
		vehicle_row = vehicles_by_name.get(row.vehicule) if row.vehicule else None
		drivers.append(
			{
				"name": row.name,
				"label": row.nom or row.name,
				"user": row.id_utilisateur,
				"vehicle": row.vehicule or None,
				"vehicleLabel": vehicle_label(vehicle_row.nom, vehicle_row.immatriculation, row.vehicule) if vehicle_row else None,
				"vehicleStatus": (vehicle_row.status or "Disponible") if vehicle_row else None,
			}
		)

	companies = [
		{"name": row.name, "label": row.company_name or row.name}
		for row in frappe.get_all("Company", fields=["name", "company_name"], order_by="name asc")
	]
	return {"users": users, "vehicles": vehicles, "drivers": drivers, "companies": companies}


def _assert_driver_user(user: str):
	if user not in _users_with_driver_role():
		frappe.throw(_("Le compte doit avoir le rôle Livreur."))


def normalise_email(value: Any) -> str:
	email = validate_email_address(cstr(value).strip(), throw=True)
	if not email or "," in email:
		frappe.throw(_("Saisissez une seule adresse e-mail valide."))
	return email.lower()


def clean_person_name(value: Any, *, required: bool = False) -> str:
	name = " ".join(cstr(value).split())
	if required and not name:
		frappe.throw(_("Le prénom est obligatoire."))
	if len(name) > 140:
		frappe.throw(_("Le prénom et le nom ne peuvent pas dépasser 140 caractères."))
	return name


def _user_role_names(user_doc) -> set[str]:
	roles = set()
	for row in user_doc.get("roles") or []:
		role = row.get("role") if isinstance(row, dict) else getattr(row, "role", None)
		if role:
			roles.add(str(role))
	return roles


def _ensure_livreur_role(user_doc) -> None:
	if "Livreur" in _user_role_names(user_doc):
		return
	user_doc.append("roles", {"role": "Livreur"})
	user_doc.save(ignore_permissions=True)


def _existing_user_name(email: str) -> str | None:
	return frappe.db.get_value("User", {"email": email}, "name") or (
		email if frappe.db.exists("User", email) else None
	)


def _link_existing_user(user_name: str) -> str:
	user_doc = frappe.get_doc("User", user_name)
	if not cint(user_doc.enabled):
		frappe.throw(_("Un utilisateur désactivé existe déjà avec cette adresse e-mail."))
	if frappe.db.exists("Livreur", {"id_utilisateur": user_doc.name}):
		frappe.throw(_("Ce compte est déjà lié à un livreur."))
	_ensure_livreur_role(user_doc)
	return user_doc.name


def _create_driver_user(*, email: str, first_name: str, last_name: str, password: str) -> str:
	if len(password) < MIN_PASSWORD_LENGTH:
		frappe.throw(_("Le mot de passe doit contenir au moins {0} caractères.").format(MIN_PASSWORD_LENGTH))
	user_doc = frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": first_name,
			"last_name": last_name or None,
			"enabled": 1,
			"user_type": "System User",
			"send_welcome_email": 0,
			"new_password": password,
			"roles": [{"role": "Livreur"}],
		}
	)
	user_doc.flags.no_welcome_mail = True
	user_doc.insert(ignore_permissions=True)
	return user_doc.name


def resolve_driver_user(payload: dict[str, Any]) -> str:
	email_raw = str(payload.get("email") or "").strip()
	existing = str(payload.get("user") or "").strip()
	if email_raw:
		email = normalise_email(email_raw)
		found = _existing_user_name(email)
		if found:
			return _link_existing_user(found)
		first_name = clean_person_name(payload.get("firstName"), required=True)
		last_name = clean_person_name(payload.get("lastName"))
		return _create_driver_user(
			email=email,
			first_name=first_name,
			last_name=last_name,
			password=str(payload.get("password") or ""),
		)
	if existing:
		_assert_driver_user(existing)
		if frappe.db.exists("Livreur", {"id_utilisateur": existing}):
			frappe.throw(_("Ce compte est déjà lié à un livreur."))
		return existing
	frappe.throw(_("Saisissez l'identité du livreur ou sélectionnez un compte existant."))


def _vehicles_held_by_user(user: str | None) -> list[str]:
	if not user:
		return []
	return frappe.get_all("Vehicule", filters={"chauffeur": user}, pluck="name")


def _save_fleet_doc(doc):
	flags = getattr(doc, "flags", None)
	if flags is None:
		doc.flags = frappe._dict()
		flags = doc.flags
	flags.fleet_assignment_sync = True
	doc.save(ignore_permissions=True)


def _clear_vehicle_driver(vehicle_name: str, *, keep_user: str | None = None):
	if not vehicle_name or not frappe.db.exists("Vehicule", vehicle_name):
		return
	doc = frappe.get_doc("Vehicule", vehicle_name)
	if keep_user and doc.chauffeur == keep_user:
		return
	if not doc.chauffeur and not doc.nom_chauffeur:
		return
	doc.chauffeur = None
	doc.nom_chauffeur = None
	_save_fleet_doc(doc)


def _clear_driver_vehicle(driver_name: str, *, keep_vehicle: str | None = None):
	if not driver_name or not frappe.db.exists("Livreur", driver_name):
		return
	current = frappe.db.get_value("Livreur", driver_name, "vehicule")
	if not current or current == keep_vehicle:
		return
	frappe.db.set_value("Livreur", driver_name, "vehicule", None, update_modified=True)


def _commit_fleet_assignment_history(events: list[dict[str, Any]], *, motif: str | None, source: str, date_evenement=None):
	if not events or not frappe.db.exists("DocType", FLEET_ASSIGNMENT_HISTORY):
		return
	when = date_evenement or frappe.utils.now_datetime()
	user = frappe.session.user
	reason = str(motif or "").strip() or None
	origin = source if source in {"Distribution", "Desk", "Initialisation"} else "Distribution"
	for event in events:
		frappe.get_doc(
			{
				"doctype": FLEET_ASSIGNMENT_HISTORY,
				"action": event["action"],
				"date_evenement": when,
				"utilisateur": user,
				"source": origin,
				"livreur": event.get("livreur"),
				"vehicule": event.get("vehicule"),
				"livreur_avant": event.get("livreur_avant"),
				"vehicule_avant": event.get("vehicule_avant"),
				"livreur_apres": event.get("livreur_apres"),
				"vehicule_apres": event.get("vehicule_apres"),
				"motif": reason,
			}
		).insert(ignore_permissions=True)


def seed_current_fleet_assignments() -> int:
	if not frappe.db.exists("DocType", FLEET_ASSIGNMENT_HISTORY):
		return 0
	created = 0
	when = frappe.utils.now_datetime()
	for row in frappe.get_all("Livreur", filters={"vehicule": ["is", "set"]}, fields=["name", "vehicule"]):
		if frappe.db.exists(
			FLEET_ASSIGNMENT_HISTORY,
			{"livreur": row.name, "vehicule": row.vehicule, "source": "Initialisation"},
		):
			continue
		_commit_fleet_assignment_history(
			[
				{
					"action": "Affectation",
					"livreur": row.name,
					"vehicule": row.vehicule,
					"livreur_avant": None,
					"vehicule_avant": None,
					"livreur_apres": row.name,
					"vehicule_apres": row.vehicule,
				}
			],
			motif=None,
			source="Initialisation",
			date_evenement=when,
		)
		created += 1
	return created


def assign_driver_vehicle(
	livreur: str,
	vehicule: str | None = None,
	*,
	motif: str | None = None,
	source: str = "Distribution",
	previous_vehicle: Any = _UNSET,
) -> dict[str, Any]:
	livreur = str(livreur or "").strip()
	vehicule = str(vehicule or "").strip() or None
	if not livreur or not frappe.db.exists("Livreur", livreur):
		frappe.throw(_("Livreur introuvable."))
	if vehicule and not frappe.db.exists("Vehicule", vehicule):
		frappe.throw(_("Véhicule introuvable."))

	driver = frappe.get_doc("Livreur", livreur)
	user = driver.id_utilisateur
	if previous_vehicle is _UNSET:
		previous_vehicle = driver.vehicule
	previous_vehicle = str(previous_vehicle or "").strip() or None
	held = set(_vehicles_held_by_user(user))
	if previous_vehicle:
		held.add(previous_vehicle)
	released_vehicles = [name for name in held if name != vehicule]

	displaced: list[str] = []
	if vehicule:
		displaced = frappe.get_all("Livreur", filters={"vehicule": vehicule, "name": ["!=", livreur]}, pluck="name")
		vehicle = frappe.get_doc("Vehicule", vehicule)
		previous_user = vehicle.chauffeur
		if previous_user and previous_user != user:
			other_driver = _driver_for_user(previous_user)
			if other_driver and other_driver != livreur and other_driver not in displaced:
				displaced.append(other_driver)

	events: list[dict[str, Any]] = []
	for name in released_vehicles:
		events.append(
			{
				"action": "Désaffectation",
				"livreur": livreur,
				"vehicule": name,
				"livreur_avant": livreur,
				"vehicule_avant": name,
				"livreur_apres": livreur,
				"vehicule_apres": None,
			}
		)
	for other in displaced:
		events.append(
			{
				"action": "Désaffectation",
				"livreur": other,
				"vehicule": vehicule,
				"livreur_avant": other,
				"vehicule_avant": vehicule,
				"livreur_apres": other,
				"vehicule_apres": None,
			}
		)
	if vehicule and previous_vehicle != vehicule:
		events.append(
			{
				"action": "Réaffectation" if previous_vehicle else "Affectation",
				"livreur": livreur,
				"vehicule": vehicule,
				"livreur_avant": livreur,
				"vehicule_avant": previous_vehicle,
				"livreur_apres": livreur,
				"vehicule_apres": vehicule,
			}
		)

	for name in released_vehicles:
		_clear_vehicle_driver(name)

	if vehicule:
		for other in displaced:
			_clear_driver_vehicle(other)
		vehicle = frappe.get_doc("Vehicule", vehicule)
		if vehicle.chauffeur != user:
			vehicle.chauffeur = user
			_save_fleet_doc(vehicle)

	if driver.vehicule != vehicule:
		driver.vehicule = vehicule
		_save_fleet_doc(driver)

	_commit_fleet_assignment_history(events, motif=motif, source=source)
	return get_driver(livreur)


def assign_vehicle_driver(
	vehicule: str,
	livreur: str | None = None,
	*,
	motif: str | None = None,
	source: str = "Distribution",
) -> dict[str, Any]:
	vehicule = str(vehicule or "").strip()
	livreur = str(livreur or "").strip() or None
	if not vehicule or not frappe.db.exists("Vehicule", vehicule):
		frappe.throw(_("Véhicule introuvable."))
	if livreur:
		assign_driver_vehicle(livreur, vehicule, motif=motif, source=source)
		return get_vehicle(vehicule)

	vehicle = frappe.get_doc("Vehicule", vehicule)
	current_driver = _driver_for_user(vehicle.chauffeur)
	if not current_driver:
		linked = frappe.get_all("Livreur", filters={"vehicule": vehicule}, pluck="name")
		current_driver = linked[0] if linked else None
	if current_driver:
		assign_driver_vehicle(current_driver, None, motif=motif, source=source)
	elif vehicle.chauffeur:
		_commit_fleet_assignment_history(
			[
				{
					"action": "Désaffectation",
					"livreur": None,
					"vehicule": vehicule,
					"livreur_avant": None,
					"vehicule_avant": vehicule,
					"livreur_apres": None,
					"vehicule_apres": None,
				}
			],
			motif=motif,
			source=source,
		)
		vehicle.chauffeur = None
		_save_fleet_doc(vehicle)
	return get_vehicle(vehicule)


def create_driver(payload: dict[str, Any]) -> dict[str, Any]:
	user = resolve_driver_user(payload)
	status = str(payload.get("status") or "Actif").strip()
	if status not in DRIVER_STATUSES:
		frappe.throw(_("Statut livreur invalide."))
	doc = frappe.get_doc(
		{
			"doctype": "Livreur",
			"id_utilisateur": user,
			"status": status,
			"active": 0 if payload.get("active") in {0, False, "0"} else 1,
			"valable": payload.get("licenseExpiry") or None,
		}
	)
	doc.insert(ignore_permissions=True)
	vehicle = str(payload.get("vehicle") or "").strip() or None
	if vehicle:
		assign_driver_vehicle(doc.name, vehicle)
	return get_driver(doc.name)


def update_driver(payload: dict[str, Any]) -> dict[str, Any]:
	name = str(payload.get("name") or "").strip()
	if not name or not frappe.db.exists("Livreur", name):
		frappe.throw(_("Livreur introuvable."))
	doc = frappe.get_doc("Livreur", name)
	if "status" in payload and payload.get("status"):
		status = str(payload.get("status")).strip()
		if status not in DRIVER_STATUSES:
			frappe.throw(_("Statut livreur invalide."))
		doc.status = status
	if "active" in payload:
		doc.active = 1 if payload.get("active") not in {0, False, "0"} else 0
	if "licenseExpiry" in payload:
		doc.valable = payload.get("licenseExpiry") or None
	doc.save(ignore_permissions=True)
	if "vehicle" in payload:
		assign_driver_vehicle(name, str(payload.get("vehicle") or "").strip() or None)
	return get_driver(name)


def create_vehicle(payload: dict[str, Any]) -> dict[str, Any]:
	nom = str(payload.get("label") or payload.get("nom") or "").strip()
	immatriculation = str(payload.get("registration") or payload.get("immatriculation") or "").strip()
	company = str(payload.get("company") or "").strip()
	if not nom and not immatriculation:
		frappe.throw(_("Renseignez le nom ou l'immatriculation du véhicule."))
	if not company:
		frappe.throw(_("La société est obligatoire."))
	status = str(payload.get("status") or "Disponible").strip()
	if status not in VEHICLE_STATUSES:
		frappe.throw(_("Statut véhicule invalide."))
	fuel = str(payload.get("fuelType") or payload.get("type_carb") or "Diesel").strip()
	doc = frappe.get_doc(
		{
			"doctype": "Vehicule",
			"nom": nom or immatriculation,
			"immatriculation": immatriculation,
			"company": company,
			"status": status,
			"active": 0 if payload.get("active") in {0, False, "0"} else 1,
			"type_carb": fuel if fuel in {"Diesel", "Essence", "GPL"} else "Diesel",
			"capacite_max_articles": cint(payload.get("capacity")) or None,
			"km": flt(payload.get("km")),
			"cout_km": flt(payload.get("costPerKm")),
		}
	)
	doc.insert(ignore_permissions=True)
	driver = str(payload.get("driver") or "").strip() or None
	if driver:
		assign_driver_vehicle(driver, doc.name)
	return get_vehicle(doc.name)


def update_vehicle(payload: dict[str, Any]) -> dict[str, Any]:
	name = str(payload.get("name") or "").strip()
	if not name or not frappe.db.exists("Vehicule", name):
		frappe.throw(_("Véhicule introuvable."))
	doc = frappe.get_doc("Vehicule", name)
	if payload.get("label") or payload.get("nom"):
		doc.nom = str(payload.get("label") or payload.get("nom")).strip()
	if "registration" in payload or "immatriculation" in payload:
		doc.immatriculation = str(payload.get("registration") or payload.get("immatriculation") or "").strip()
	if payload.get("status"):
		status = str(payload.get("status")).strip()
		if status not in VEHICLE_STATUSES:
			frappe.throw(_("Statut véhicule invalide."))
		doc.status = status
	if "active" in payload:
		doc.active = 1 if payload.get("active") not in {0, False, "0"} else 0
	if payload.get("company"):
		doc.company = str(payload.get("company")).strip()
	if payload.get("fuelType") or payload.get("type_carb"):
		fuel = str(payload.get("fuelType") or payload.get("type_carb")).strip()
		if fuel in {"Diesel", "Essence", "GPL"}:
			doc.type_carb = fuel
	if "capacity" in payload:
		doc.capacite_max_articles = cint(payload.get("capacity")) or 0
	if "km" in payload:
		doc.km = flt(payload.get("km"))
	if "costPerKm" in payload:
		doc.cout_km = flt(payload.get("costPerKm"))
	if "nextMaintenance" in payload:
		doc.pdate_rochain_entretien = payload.get("nextMaintenance") or None
	if "lastMaintenance" in payload:
		doc.date_dernier_entretien = payload.get("lastMaintenance") or None
	if "insuranceExpiry" in payload:
		doc.date_exp_assurance = payload.get("insuranceExpiry") or None
	if "inspectionExpiry" in payload:
		doc.date_exp_cont_tech = payload.get("inspectionExpiry") or None
	doc.save(ignore_permissions=True)
	if "driver" in payload:
		assign_vehicle_driver(name, str(payload.get("driver") or "").strip() or None)
	return get_vehicle(name)


def create_entretien(payload: dict[str, Any]) -> dict[str, Any]:
	if not frappe.db.exists("DocType", "Entretien Vehicule"):
		frappe.throw(_("Le type Entretien Véhicule n'est pas installé."))
	vehicle = str(payload.get("vehicle") or "").strip()
	if not vehicle or not frappe.db.exists("Vehicule", vehicle):
		frappe.throw(_("Véhicule introuvable."))
	status = str(payload.get("status") or "Programmé").strip()
	kind = str(payload.get("type") or "Préventif").strip()
	if status not in ENTRETIEN_STATUSES:
		frappe.throw(_("Statut d'entretien invalide."))
	if kind not in ENTRETIEN_TYPES:
		frappe.throw(_("Type d'entretien invalide."))
	when = str(payload.get("date") or today()).strip() or today()
	done_on = str(payload.get("dateEntretien") or "").strip() or (when if status == "Terminé" else None)
	next_date = str(payload.get("nextMaintenance") or "").strip() or None
	km = payload.get("km")
	doc = frappe.get_doc(
		{
			"doctype": "Entretien Vehicule",
			"vehicule": vehicle,
			"status": status,
			"type": kind,
			"date": when,
			"date_entretien": done_on,
			"km": flt(km) if km not in (None, "") else None,
			"reparations": str(payload.get("repairs") or "").strip() or None,
			"prochain_entretien": next_date,
		}
	)
	doc.insert(ignore_permissions=True)

	vehicle_doc = frappe.get_doc("Vehicule", vehicle)
	changed = False
	if status == "Terminé" and (done_on or when):
		vehicle_doc.date_dernier_entretien = done_on or when
		changed = True
	planned = next_date or (when if status == "Programmé" else None)
	if planned:
		vehicle_doc.pdate_rochain_entretien = planned
		changed = True
	if changed:
		vehicle_doc.save(ignore_permissions=True)
	return get_vehicle(vehicle)


def attach_document(
	*,
	doctype: str,
	name: str,
	field: str,
	filename: str,
	content: bytes,
	expiry=None,
) -> dict[str, Any]:
	specs = DRIVER_DOCUMENTS if doctype == "Livreur" else VEHICLE_DOCUMENTS
	spec = next((item for item in specs.values() if item["field"] == field), None)
	if not spec and doctype == "Vehicule" and field == VEHICLE_IMAGE["field"]:
		spec = VEHICLE_IMAGE
	if not spec:
		frappe.throw(_("Type de document inconnu."))
	if not name or not frappe.db.exists(doctype, name):
		frappe.throw(_("{0} introuvable.").format(doctype))
	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": filename,
			"attached_to_doctype": doctype,
			"attached_to_name": name,
			"attached_to_field": field,
			"content": content,
			"is_private": 1,
		}
	).insert(ignore_permissions=True)
	values: dict[str, Any] = {field: file_doc.file_url}
	if spec.get("expiryField") and expiry:
		values[spec["expiryField"]] = expiry
	frappe.db.set_value(doctype, name, values)
	if doctype == "Livreur":
		return get_driver(name)
	return get_vehicle(name)
