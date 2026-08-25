"""Agrégats KPI du dashboard livreur (journée + semaine)."""

from __future__ import annotations

from typing import Any

import frappe
from frappe.utils import add_days, flt, getdate, today

from log.services.distribution_driver_cash import get_cash_box

DASHBOARD_ROUTE_STATES = ("Publiée", "En cours", "Retour dépôt", "Contrôle caisse", "Terminée")
ACTIVE_ROUTE_PRIORITY = ("En cours", "Publiée", "Retour dépôt", "Contrôle caisse", "Terminée")
DELIVERED_STOP_STATES = {"Livré", "Partiellement Livré"}
FAILED_STOP_STATES = {"Non Livré"}
TERMINAL_STOP_STATES = {"Livré", "Partiellement Livré", "Non Livré", "Annulé"}
MOVEMENT_LIMIT = 8


def date_str(value) -> str:
	return str(getdate(value or today()))


def week_start(value) -> str:
	return date_str(add_days(getdate(value), -6))


def is_terminal(status: str | None) -> bool:
	return (status or "Nouveau") in TERMINAL_STOP_STATES


def cash_status_from_routes(statuses: list[str]) -> str:
	normalized = [status or "Sans encaissement" for status in statuses]
	if any(status == "Écart" for status in normalized):
		return "Écart"
	if any(status == "À contrôler" for status in normalized):
		return "À contrôler"
	if any(status == "Validée" for status in normalized):
		return "Validée"
	return "Sans encaissement"


def empty_kpis() -> dict[str, Any]:
	return {
		"plannedStops": 0,
		"completedStops": 0,
		"deliveredStops": 0,
		"failedStops": 0,
		"remainingStops": 0,
		"plannedRoutes": 0,
		"amountCollected": 0.0,
		"amountToCollect": 0.0,
	}


def empty_cash() -> dict[str, Any]:
	return {
		"balance": 0.0,
		"declaredCash": 0.0,
		"declaredCheques": 0.0,
		"declaredTotal": 0.0,
		"status": "Sans encaissement",
		"updatedAt": None,
		"movements": [],
	}


def empty_week(day: str) -> dict[str, Any]:
	start = week_start(day)
	return {
		"from": start,
		"to": day,
		"deliveredStops": 0,
		"plannedStops": 0,
		"collected": 0.0,
		"days": build_week_days(start, day, {}),
	}


def empty_dashboard(day: str, driver: dict[str, Any] | None = None) -> dict[str, Any]:
	return {
		"date": day,
		"driver": driver or {"name": None, "label": None, "vehicle": None},
		"kpis": empty_kpis(),
		"cash": empty_cash(),
		"routes": [],
		"nextStop": None,
		"week": empty_week(day),
	}


def build_week_days(start: str, end: str, daily: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
	days: list[dict[str, Any]] = []
	current = getdate(start)
	last = getdate(end)
	while current <= last:
		key = str(current)
		stats = daily.get(key) or {}
		days.append(
			{
				"date": key,
				"plannedStops": int(stats.get("plannedStops") or 0),
				"deliveredStops": int(stats.get("deliveredStops") or 0),
				"collected": flt(stats.get("collected")),
			}
		)
		current = getdate(add_days(current, 1))
	return days


def summarize_stops(stops: list[dict[str, Any]], collected_by_dn: dict[str, float]) -> dict[str, Any]:
	planned = len(stops)
	delivered = 0
	failed = 0
	completed = 0
	remaining_amount = 0.0
	for stop in stops:
		status = stop.get("status") or "Nouveau"
		if is_terminal(status):
			completed += 1
		if status in DELIVERED_STOP_STATES:
			delivered += 1
		if status in FAILED_STOP_STATES:
			failed += 1
		paid = flt(collected_by_dn.get(stop.get("deliveryNote")))
		remaining_amount += max(flt(stop.get("grandTotal")) - paid, 0)
	collected = round(sum(flt(collected_by_dn.get(stop.get("deliveryNote"))) for stop in stops), 2)
	return {
		"plannedStops": planned,
		"completedStops": completed,
		"deliveredStops": delivered,
		"failedStops": failed,
		"remainingStops": planned - completed,
		"amountCollected": collected,
		"amountToCollect": round(remaining_amount, 2),
	}


def _vehicle_label(vehicle: str | None) -> str | None:
	if not vehicle:
		return None
	row = frappe.db.get_value("Vehicule", vehicle, ["nom", "immatriculation"], as_dict=True)
	if not row:
		return vehicle
	return " · ".join(filter(None, [row.nom, row.immatriculation])) or vehicle


def _driver_profile(driver: str) -> dict[str, Any]:
	row = frappe.db.get_value("Livreur", driver, ["nom", "vehicule"], as_dict=True) or {}
	vehicle = row.get("vehicule")
	return {
		"name": driver,
		"label": row.get("nom") or driver,
		"vehicle": _vehicle_label(vehicle) or vehicle,
	}


def _load_routes(driver: str, start: str, end: str) -> list[dict[str, Any]]:
	return frappe.get_all(
		"Livraison",
		filters={
			"livreur": driver,
			"date_liv": ["between", [start, end]],
			"etat_planification": ["in", list(DASHBOARD_ROUTE_STATES)],
			"docstatus": ["<", 2],
		},
		fields=[
			"name",
			"date_liv",
			"etat_planification",
			"depart_prevu",
			"fin_prevue",
			"vehicule",
			"nom_livreur",
			"statut_caisse",
			"total_montant_a_encaisser",
			"total_paiements",
		],
		order_by="date_liv asc, depart_prevu asc, creation asc",
	)


def _load_children(route_names: list[str]) -> list[dict[str, Any]]:
	if not route_names:
		return []
	return frappe.get_all(
		"Livraison Bon de Livraison",
		filters={"parent": ["in", route_names], "parenttype": "Livraison"},
		fields=["parent", "bon_de_livraison", "idx"],
		order_by="idx asc",
	)


def _load_delivery_notes(names: list[str]) -> dict[str, dict[str, Any]]:
	if not names:
		return {}
	rows = frappe.get_all(
		"Delivery Note",
		filters={"name": ["in", names]},
		fields=[
			"name",
			"customer",
			"customer_name",
			"grand_total",
			"custom_statut",
			"shipping_address",
			"contact_mobile",
			"custom_commune",
			"custom_wilaya",
		],
	)
	return {row.name: row for row in rows}


def _load_payments(route_names: list[str]) -> list[dict[str, Any]]:
	if not route_names:
		return []
	return frappe.get_all(
		"Paiement Client",
		filters={"livraison": ["in", route_names], "statut_controle": ["!=", "Annulé"]},
		fields=["livraison", "bon_livraison", "montant", "moyen_paiement"],
	)


def _collected_by_dn(payments: list[dict[str, Any]]) -> dict[str, float]:
	totals: dict[str, float] = {}
	for row in payments:
		note = row.get("bon_livraison")
		if not note:
			continue
		totals[note] = flt(totals.get(note)) + flt(row.get("montant"))
	return totals


def _collected_by_route(payments: list[dict[str, Any]]) -> dict[str, float]:
	totals: dict[str, float] = {}
	for row in payments:
		route_id = row.get("livraison")
		if not route_id:
			continue
		totals[route_id] = flt(totals.get(route_id)) + flt(row.get("montant"))
	return totals


def _declared_split(payments: list[dict[str, Any]]) -> tuple[float, float]:
	cash = sum(flt(row.get("montant")) for row in payments if row.get("moyen_paiement") == "Espèce")
	cheques = sum(flt(row.get("montant")) for row in payments if row.get("moyen_paiement") == "Chèque")
	return round(cash, 2), round(cheques, 2)


def _session_cash(driver: str, payments: list[dict[str, Any]], route_statuses: list[str]) -> dict[str, Any]:
	box = get_cash_box(driver)
	cash, cheques = _declared_split(payments)
	status = cash_status_from_routes(route_statuses)
	if status == "Sans encaissement" and (cash + cheques) > 0:
		status = "À contrôler"
	return {
		"balance": flt(box.get("balance")),
		"declaredCash": cash,
		"declaredCheques": cheques,
		"declaredTotal": round(cash + cheques, 2),
		"status": status,
		"updatedAt": box.get("updatedAt"),
		"movements": list(box.get("movements") or [])[:MOVEMENT_LIMIT],
	}


def _serialize_next_stop(
	route: dict[str, Any],
	child: dict[str, Any],
	dn: dict[str, Any],
	collected_by_dn: dict[str, float],
	commune_label: str | None,
) -> dict[str, Any]:
	note = dn.name
	paid = flt(collected_by_dn.get(note))
	return {
		"deliveryNote": note,
		"routeId": route.name,
		"sequence": int(child.idx or 1),
		"customer": dn.customer,
		"customerName": dn.customer_name or dn.customer,
		"address": dn.shipping_address,
		"commune": commune_label or dn.custom_commune,
		"wilaya": dn.custom_wilaya,
		"phone": dn.contact_mobile,
		"amountToCollect": round(max(flt(dn.grand_total) - paid, 0), 2),
		"status": dn.custom_statut or "Nouveau",
	}


def _pick_active_route(routes: list[dict[str, Any]]) -> dict[str, Any] | None:
	ranked = sorted(
		routes,
		key=lambda route: (
			ACTIVE_ROUTE_PRIORITY.index(route.etat_planification)
			if route.etat_planification in ACTIVE_ROUTE_PRIORITY
			else 99,
			str(route.depart_prevu or ""),
		),
	)
	return ranked[0] if ranked else None


def build_driver_dashboard(*, driver: str | None, date=None) -> dict[str, Any]:
	day = date_str(date)
	if not driver:
		return empty_dashboard(day)

	profile = _driver_profile(driver)
	start = week_start(day)
	routes = _load_routes(driver, start, day)
	route_names = [row.name for row in routes]
	children = _load_children(route_names)
	delivery_notes = _load_delivery_notes([row.bon_de_livraison for row in children if row.bon_de_livraison])
	payments = _load_payments(route_names)
	collected_by_dn = _collected_by_dn(payments)
	collected_by_route = _collected_by_route(payments)

	stops_by_route: dict[str, list[dict[str, Any]]] = {name: [] for name in route_names}
	for child in children:
		dn = delivery_notes.get(child.bon_de_livraison)
		if not dn:
			continue
		stops_by_route.setdefault(child.parent, []).append(
			{
				"deliveryNote": dn.name,
				"status": dn.custom_statut or "Nouveau",
				"grandTotal": flt(dn.grand_total),
				"idx": child.idx,
				"child": child,
				"dn": dn,
			}
		)

	today_routes = [row for row in routes if date_str(row.date_liv) == day]
	today_stops = [stop for route in today_routes for stop in stops_by_route.get(route.name, [])]
	today_payments = [row for row in payments if row.get("livraison") in {route.name for route in today_routes}]
	kpis = summarize_stops(today_stops, collected_by_dn)
	kpis["plannedRoutes"] = len(today_routes)

	serialized_routes = []
	for route in today_routes:
		route_stops = stops_by_route.get(route.name, [])
		stats = summarize_stops(route_stops, collected_by_dn)
		serialized_routes.append(
			{
				"name": route.name,
				"lifecycle": route.etat_planification,
				"plannedStart": str(route.depart_prevu or "") or None,
				"plannedEnd": str(route.fin_prevue or "") or None,
				"vehicle": route.vehicule,
				"vehicleLabel": _vehicle_label(route.vehicule),
				"stopsTotal": stats["plannedStops"],
				"stopsDone": stats["completedStops"],
				"stopsRemaining": stats["remainingStops"],
				"collected": stats["amountCollected"],
				"toCollect": stats["amountToCollect"],
				"cashStatus": route.statut_caisse or "Sans encaissement",
			}
		)

	next_stop = None
	active = _pick_active_route(today_routes)
	if active:
		for stop in stops_by_route.get(active.name, []):
			if is_terminal(stop["status"]):
				continue
			commune_id = stop["dn"].custom_commune
			commune_label = frappe.db.get_value("Commune", commune_id, "nom") if commune_id else None
			next_stop = _serialize_next_stop(active, stop["child"], stop["dn"], collected_by_dn, commune_label)
			break
		if active.vehicule:
			profile["vehicle"] = _vehicle_label(active.vehicule) or active.vehicule

	daily: dict[str, dict[str, Any]] = {}
	for route in routes:
		key = date_str(route.date_liv)
		bucket = daily.setdefault(key, {"plannedStops": 0, "deliveredStops": 0, "collected": 0.0})
		route_stops = stops_by_route.get(route.name, [])
		stats = summarize_stops(route_stops, collected_by_dn)
		bucket["plannedStops"] += stats["plannedStops"]
		bucket["deliveredStops"] += stats["deliveredStops"]
		bucket["collected"] = round(flt(bucket["collected"]) + flt(collected_by_route.get(route.name)), 2)

	week_days = build_week_days(start, day, daily)
	cash = _session_cash(
		driver,
		today_payments,
		[route.statut_caisse or "Sans encaissement" for route in today_routes],
	)

	return {
		"date": day,
		"driver": profile,
		"kpis": kpis,
		"cash": cash,
		"routes": serialized_routes,
		"nextStop": next_stop,
		"week": {
			"from": start,
			"to": day,
			"deliveredStops": sum(day_row["deliveredStops"] for day_row in week_days),
			"plannedStops": sum(day_row["plannedStops"] for day_row in week_days),
			"collected": round(sum(day_row["collected"] for day_row in week_days), 2),
			"days": week_days,
		},
	}
