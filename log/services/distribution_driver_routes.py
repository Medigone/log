"""Liste des tournées livreur : programmées (détail) et historique (cartes)."""

from __future__ import annotations

from typing import Any, Callable

import frappe
from frappe.utils import add_days, flt, getdate, today

PROGRAMMED_ROUTE_STATES = ("Publiée", "En cours", "Retour dépôt")
HISTORY_ROUTE_STATES = ("Contrôle caisse", "Terminée")
HISTORY_DAYS = 30


def date_str(value) -> str:
	return str(getdate(value or today()))


def history_start(day: str) -> str:
	return date_str(add_days(getdate(day), -HISTORY_DAYS))


def unique_labels(values: list[str | None]) -> list[str]:
	seen: set[str] = set()
	labels: list[str] = []
	for value in values:
		label = str(value or "").strip()
		if not label or label in seen:
			continue
		seen.add(label)
		labels.append(label)
	return labels


def customer_label(names: list[str | None]) -> str:
	labels = unique_labels(names)
	if not labels:
		return "Client non renseigné"
	if len(labels) == 1:
		return labels[0]
	return f"{labels[0]} · +{len(labels) - 1}"


def location_label(communes: list[str | None], wilayas: list[str | None]) -> str:
	commune_part = ", ".join(unique_labels(communes))
	wilaya_part = ", ".join(unique_labels(wilayas))
	return " · ".join(part for part in (commune_part, wilaya_part) if part)


def empty_board() -> dict[str, Any]:
	return {"programmed": [], "history": [], "programmedCount": 0}


def serialize_history_card(
	route: dict[str, Any],
	children: list[dict[str, Any]],
	customer_names: dict[str, str],
	commune_names: dict[str, str],
) -> dict[str, Any]:
	customers = [customer_names.get(row.get("customer") or "", row.get("customer")) for row in children]
	communes = [commune_names.get(row.get("custom_commune") or "", row.get("custom_commune")) for row in children]
	wilayas = [row.get("custom_wilaya") for row in children]
	stop_count = int(route.get("nombre_bons_de_livraison") or len(children) or 0)
	articles = flt(route.get("total_articles"))
	if not articles:
		articles = sum(flt(row.get("total_qty")) for row in children)
	return {
		"name": route["name"],
		"date": date_str(route.get("date_liv")),
		"lifecycle": route.get("etat_planification") or "Terminée",
		"plannedStart": str(route.get("depart_prevu") or "") or None,
		"customerLabel": customer_label(customers),
		"stopCount": stop_count,
		"totalArticles": int(articles) if articles == int(articles) else articles,
		"locationLabel": location_label(communes, wilayas),
	}


def _route_filters(driver: str | None, states: tuple[str, ...], extra: dict[str, Any] | None = None) -> dict[str, Any]:
	filters: dict[str, Any] = {
		"etat_planification": ["in", list(states)],
		"docstatus": ["<", 2],
	}
	if driver:
		filters["livreur"] = driver
	if extra:
		filters.update(extra)
	return filters


def _load_programmed(driver: str | None) -> list[str]:
	return frappe.get_all(
		"Livraison",
		filters=_route_filters(driver, PROGRAMMED_ROUTE_STATES),
		pluck="name",
		order_by="date_liv asc, depart_prevu asc, creation asc",
	)


def _load_history(driver: str | None, start: str, end: str) -> list[dict[str, Any]]:
	return frappe.get_all(
		"Livraison",
		filters=_route_filters(driver, HISTORY_ROUTE_STATES, {"date_liv": ["between", [start, end]]}),
		fields=[
			"name",
			"date_liv",
			"etat_planification",
			"nombre_bons_de_livraison",
			"total_articles",
			"depart_prevu",
		],
		order_by="date_liv desc, depart_prevu desc, creation desc",
	)


def _load_children(route_names: list[str]) -> list[dict[str, Any]]:
	if not route_names:
		return []
	return frappe.get_all(
		"Livraison Bon de Livraison",
		filters={"parent": ["in", route_names], "parenttype": "Livraison"},
		fields=["parent", "customer", "custom_commune", "custom_wilaya", "total_qty"],
		order_by="idx asc",
	)


def _load_customer_names(customer_ids: list[str]) -> dict[str, str]:
	ids = unique_labels(customer_ids)
	if not ids:
		return {}
	rows = frappe.get_all("Customer", filters={"name": ["in", ids]}, fields=["name", "customer_name"])
	return {row.name: row.customer_name or row.name for row in rows}


def _load_commune_names(commune_ids: list[str]) -> dict[str, str]:
	ids = unique_labels(commune_ids)
	if not ids:
		return {}
	rows = frappe.get_all("Commune", filters={"name": ["in", ids]}, fields=["name", "nom"])
	return {row.name: row.nom or row.name for row in rows}


def _value(row: Any, key: str, default=None):
	if isinstance(row, dict):
		return row.get(key, default)
	return getattr(row, key, default)


def _as_map(row: Any) -> dict[str, Any]:
	if isinstance(row, dict):
		return row
	if hasattr(row, "as_dict"):
		return row.as_dict()
	return vars(row)


def _history_cards(routes: list[Any]) -> list[dict[str, Any]]:
	names = [_value(row, "name") for row in routes]
	children = _load_children(names)
	by_route: dict[str, list[Any]] = {name: [] for name in names}
	for child in children:
		by_route.setdefault(_value(child, "parent"), []).append(child)
	customer_names = _load_customer_names([_value(child, "customer") for child in children])
	commune_names = _load_commune_names([_value(child, "custom_commune") for child in children])
	return [
		serialize_history_card(
			_as_map(route),
			[_as_map(child) for child in by_route.get(_value(route, "name"), [])],
			customer_names,
			commune_names,
		)
		for route in routes
	]


def build_driver_route_board(
	*,
	driver: str | None,
	date=None,
	serialize_route: Callable[[Any], dict[str, Any]] | None = None,
) -> dict[str, Any]:
	if not driver:
		return empty_board()

	day = date_str(date)
	programmed_names = _load_programmed(driver)
	serializer = serialize_route or (lambda doc: {"name": doc.name})
	programmed = [serializer(frappe.get_doc("Livraison", name)) for name in programmed_names]
	history = _history_cards(_load_history(driver, history_start(day), day))
	return {
		"programmed": programmed,
		"history": history,
		"programmedCount": len(programmed),
	}
