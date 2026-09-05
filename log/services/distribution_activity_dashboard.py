"""Agrégats du tableau de bord d'activité logistique (file ouverte, pas seulement le jour)."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote, urlencode

import frappe
from frappe.utils import add_days, flt, getdate, today

from log.api.distribution_rules import parse_gps_value

CLOSED_SO_STATUSES = ("Closed", "On Hold", "Completed", "Cancelled")
ACTIVE_ROUTE_STATES = ("Brouillon", "Publiée", "En cours", "Retour dépôt", "Contrôle caisse")
LIVE_ROUTE_STATES = ("Publiée", "En cours", "Retour dépôt")
TERMINAL_STOP_STATES = {"Livré", "Partiellement Livré", "Non Livré", "Annulé"}
FAILED_STOP_STATES = {"Non Livré", "Partiellement Livré"}
RETURN_LOADING_STATES = {"Retour requis", "Retour déclaré"}
OPEN_EXCEPTION_STATES = ("Ouverte", "En traitement")
PENDING_PAYMENT_STATES = ("Déclaré", "À contrôler")
NOW_LIMIT = 12
PICK_LIST_LIMIT = 12
READY_NOTE_STATUSES = ("Préparé", "Non Livré")
DISPATCH_NOTE_LIMIT = 40

SECTIONS_BY_ROLE = {
	"preparateur": {"preparation", "fulfillment", "dispatch", "stock", "alerts", "now"},
	"planificateur": {"preparation", "fulfillment", "fleet", "planning", "dispatch", "stock", "alerts", "now"},
	"responsable": {"preparation", "fulfillment", "fleet", "planning", "dispatch", "stock", "payments", "alerts", "now"},
}


def date_str(value=None) -> str:
	return str(getdate(value or today()))


def _with_query(path: str, **params: Any) -> str:
	items = [(key, str(value)) for key, value in params.items() if value not in (None, "")]
	if not items:
		return path
	return f"{path}?{urlencode(items, quote_via=quote)}"


def sections_for_role(role: str) -> set[str]:
	return set(SECTIONS_BY_ROLE.get(role) or ())


def classify_delivery_date(delivery_date, day: str) -> str:
	if not delivery_date:
		return "later"
	target = getdate(delivery_date)
	current = getdate(day)
	if target < current:
		return "overdue"
	if target == current:
		return "today"
	return "later"


def remaining_qty(total_qty, per_picked) -> float:
	return max(flt(total_qty) * (100.0 - flt(per_picked)) / 100.0, 0.0)


def is_terminal_stop(status: str | None) -> bool:
	return (status or "Nouveau") in TERMINAL_STOP_STATES


def is_failed_stop(status: str | None) -> bool:
	return (status or "") in FAILED_STOP_STATES


def _vehicle_label(vehicle: str | None, cache: dict[str, str | None] | None = None) -> str | None:
	if not vehicle:
		return None
	if cache is not None and vehicle in cache:
		return cache[vehicle]
	row = frappe.db.get_value("Vehicule", vehicle, ["nom", "immatriculation"], as_dict=True)
	label = None
	if row:
		label = " · ".join(filter(None, [row.nom, row.immatriculation])) or vehicle
	else:
		label = vehicle
	if cache is not None:
		cache[vehicle] = label
	return label


def _attr(row: Any, key: str, default=None):
	if isinstance(row, dict):
		return row.get(key, default)
	return getattr(row, key, default)


def summarize_preparation(orders, pick_lists, shortage_count: int, day: str, ready_to_complete: int = 0) -> dict[str, Any]:
	overdue = today_count = later = 0
	qty = 0.0
	for order in orders:
		bucket = classify_delivery_date(_attr(order, "delivery_date"), day)
		if bucket == "overdue":
			overdue += 1
		elif bucket == "today":
			today_count += 1
		else:
			later += 1
		qty += remaining_qty(_attr(order, "total_qty"), _attr(order, "per_picked"))
	return {
		"toPick": len(orders),
		"overdue": overdue,
		"today": today_count,
		"later": later,
		"inProgressPickLists": len(pick_lists),
		"remainingQty": round(qty, 3),
		"shortageOrders": int(shortage_count),
		"readyToComplete": int(ready_to_complete),
		"pickLists": [
			{
				"name": _attr(row, "name"),
				"modified": str(_attr(row, "modified") or "") or None,
				"salesOrderCount": int(_attr(row, "sales_order_count") or _attr(row, "salesOrderCount") or 0),
				"remainingQty": round(flt(_attr(row, "remaining_qty") or _attr(row, "remainingQty")), 3),
			}
			for row in pick_lists
		],
	}


def summarize_fulfillment(routes) -> dict[str, Any]:
	to_load_routes = []
	return_routes = []
	loaded = 0
	for route in routes:
		lifecycle = _attr(route, "etat_planification") or _attr(route, "lifecycle")
		if lifecycle == "Annulée":
			continue
		loading = _attr(route, "statut_chargement") or _attr(route, "loadingStatus") or "À charger"
		route_date = _attr(route, "date_liv") or _attr(route, "date")
		item = {
			"name": _attr(route, "name"),
			"date": date_str(route_date) if route_date else None,
			"lifecycle": lifecycle,
			"driverName": _attr(route, "nom_livreur") or _attr(route, "driverName"),
			"vehicle": _attr(route, "vehicule") or _attr(route, "vehicle"),
			"vehicleLabel": _attr(route, "vehicleLabel"),
			"loadingStatus": loading,
		}
		if loading == "Chargé":
			loaded += 1
		if loading == "À charger":
			to_load_routes.append(item)
		if loading in RETURN_LOADING_STATES or lifecycle == "Retour dépôt":
			return_routes.append(item)
	return {
		"toLoad": len(to_load_routes),
		"loaded": loaded,
		"returnsPending": len(return_routes),
		"toLoadRoutes": to_load_routes[:8],
		"returnRoutes": return_routes[:8],
	}


def summarize_fleet(live_routes: list[dict[str, Any]]) -> dict[str, Any]:
	published = in_progress = returning = 0
	done = remaining = failed = 0
	for route in live_routes:
		lifecycle = route.get("lifecycle")
		if lifecycle == "Publiée":
			published += 1
		elif lifecycle == "En cours":
			in_progress += 1
		elif lifecycle == "Retour dépôt":
			returning += 1
		done += int(route.get("doneStops") or 0)
		remaining += int(route.get("remainingStops") or 0)
		failed += int(route.get("failedStops") or 0)
	return {
		"published": published,
		"inProgress": in_progress,
		"returning": returning,
		"doneStops": done,
		"remainingStops": remaining,
		"failedStops": failed,
		"liveRoutes": live_routes,
	}


def summarize_planning(unassigned: list[dict[str, Any]], day: str) -> dict[str, Any]:
	overdue = 0
	for stop in unassigned:
		if classify_delivery_date(stop.get("requestedDate"), day) == "overdue":
			overdue += 1
	return {
		"unassigned": len(unassigned),
		"overdue": overdue,
	}


def summarize_shipped_trend(counts_by_day: dict[str, int], day: str) -> list[int]:
	"""14 jours glissants, le dernier index = `day`."""
	end = getdate(day)
	values = []
	for offset in range(13, -1, -1):
		key = date_str(add_days(end, -offset))
		values.append(int(counts_by_day.get(key, 0)))
	return values


def suggest_route_groups(notes: list[dict[str, Any]], *, min_size: int = 2) -> list[dict[str, Any]]:
	"""Regroupe les bons non affectés par commune (au moins `min_size` bons)."""
	buckets: dict[str, list[dict[str, Any]]] = {}
	for note in notes:
		if note.get("routeId"):
			continue
		city = str(note.get("customerCity") or "").strip()
		if not city:
			continue
		buckets.setdefault(city, []).append(note)
	suggestions: list[dict[str, Any]] = []
	for city, members in buckets.items():
		if len(members) < min_size:
			continue
		qty = sum(flt(row.get("qty")) for row in members)
		detail = f"{qty:g} articles" if qty else f"{len(members)} BL"
		suggestions.append(
			{
				"id": city,
				"label": f"{city} · {len(members)} bons",
				"detail": detail,
				"noteIds": [row["deliveryNote"] for row in members],
			}
		)
	suggestions.sort(key=lambda row: (-len(row["noteIds"]), row["label"]))
	return suggestions[:5]


def summarize_dispatch(notes: list[dict[str, Any]], day: str) -> dict[str, Any]:
	overdue = waiting_load = unassigned = 0
	for note in notes:
		bucket = classify_delivery_date(note.get("requestedDate"), day)
		if bucket == "overdue":
			overdue += 1
		if note.get("routeId"):
			waiting_load += 1
		else:
			unassigned += 1
	return {
		"ready": len(notes),
		"unassigned": unassigned,
		"waitingLoad": waiting_load,
		"overdue": overdue,
		"notes": notes[:DISPATCH_NOTE_LIMIT],
	}


def summarize_stock(vehicles) -> dict[str, Any]:
	on_route = loaded = empty = missing = 0
	for vehicle in vehicles:
		active = _attr(vehicle, "active")
		if active is False:
			continue
		routes = _attr(vehicle, "activeRoutes") or []
		quantity = flt(_attr(vehicle, "totalQuantity"))
		warehouse_missing = bool(_attr(vehicle, "missingWarehouse"))
		if routes:
			on_route += 1
		if warehouse_missing:
			missing += 1
		elif quantity > 0:
			loaded += 1
		else:
			empty += 1
	return {
		"onRoute": on_route,
		"loaded": loaded,
		"empty": empty,
		"missingWarehouse": missing,
	}


def summarize_payments(cashier_routes, payments, cash_boxes) -> dict[str, Any]:
	to_control = discrepancies = 0
	for route in cashier_routes:
		status = _attr(route, "statut_caisse") or _attr(route, "cashStatus") or "Sans encaissement"
		if status == "À contrôler":
			to_control += 1
		elif status == "Écart":
			discrepancies += 1
	declared_today = 0.0
	pending = 0
	for payment in payments:
		status = _attr(payment, "statut_controle") or _attr(payment, "status")
		if status in PENDING_PAYMENT_STATES:
			pending += 1
		declared_today += flt(_attr(payment, "montant") or _attr(payment, "amount"))
	return {
		"toControl": to_control,
		"discrepancies": discrepancies,
		"declaredToday": round(declared_today, 2),
		"pendingPayments": pending,
		"driverCashTotal": round(sum(flt(_attr(box, "balance") or _attr(box, "solde")) for box in cash_boxes), 2),
		"driverCashBoxes": len(cash_boxes),
	}


def build_pipeline(preparation, planning, dispatch, fleet, payments) -> dict[str, Any]:
	return {
		"toPrepare": int((preparation or {}).get("toPick") or 0),
		"toPlan": int((planning or {}).get("unassigned") or 0),
		"toDispatch": int((dispatch or {}).get("ready") or 0),
		"live": int((fleet or {}).get("published") or 0) + int((fleet or {}).get("inProgress") or 0),
		"returning": int((fleet or {}).get("returning") or 0),
		"cashier": int((payments or {}).get("toControl") or 0) + int((payments or {}).get("discrepancies") or 0),
	}


def build_alerts(
	*,
	role: str,
	exceptions,
	preparation,
	fulfillment,
	fleet,
	planning,
	stock,
	payments,
) -> list[dict[str, Any]]:
	alerts: list[dict[str, Any]] = []
	if role != "preparateur":
		for exception in exceptions:
			priority = _attr(exception, "priorite")
			route_id = _attr(exception, "tournee")
			delivery_note = _attr(exception, "bon_de_livraison")
			alerts.append(
				{
					"id": _attr(exception, "name"),
					"tone": "danger" if priority in {"Haute", "Critique"} else "warning",
					"title": _attr(exception, "type_exception") or "Exception",
					"detail": _attr(exception, "description") or delivery_note or "",
					"target": (
						_with_query(f"/planning/routes/{route_id}", dn=delivery_note)
						if route_id
						else _with_query("/deliveries", kpi="failed", dn=delivery_note)
					),
				}
			)
	if preparation and preparation.get("shortageOrders"):
		alerts.append(
			{
				"id": "prep-shortages",
				"tone": "danger",
				"title": "Ruptures de stock",
				"detail": f"{preparation['shortageOrders']} commande(s) sans stock suffisant.",
				"target": _with_query("/preparation", shortage="1"),
			}
		)
	if preparation and preparation.get("readyToComplete"):
		alerts.append(
			{
				"id": "prep-complete",
				"tone": "warning",
				"title": "Préparation à compléter",
				"detail": f"{preparation['readyToComplete']} commande(s) avec du stock revenu, reliquat non prélevé.",
				"target": _with_query("/preparation", complete="1"),
			}
		)
	if preparation and preparation.get("overdue"):
		alerts.append(
			{
				"id": "prep-overdue",
				"tone": "danger",
				"title": "Préparation en retard",
				"detail": f"{preparation['overdue']} commande(s) dont la date de livraison est dépassée.",
				"target": _with_query("/preparation", dateScope="overdue"),
			}
		)
	if fulfillment and fulfillment.get("returnsPending"):
		alerts.append(
			{
				"id": "fulfillment-returns",
				"tone": "warning",
				"title": "Retours à traiter",
				"detail": f"{fulfillment['returnsPending']} tournée(s) en retour dépôt.",
				"target": _with_query("/stock", focus="route"),
			}
		)
	if stock and stock.get("missingWarehouse"):
		alerts.append(
			{
				"id": "stock-missing",
				"tone": "warning",
				"title": "Entrepôts véhicule manquants",
				"detail": f"{stock['missingWarehouse']} véhicule(s) sans entrepôt.",
				"target": _with_query("/stock", focus="missing"),
			}
		)
	if planning and planning.get("overdue"):
		alerts.append(
			{
				"id": "planning-overdue",
				"tone": "warning",
				"title": "BL non planifiés en retard",
				"detail": f"{planning['overdue']} bon(s) prêts sans tournée, date dépassée.",
				"target": _with_query("/planning", status="En retard"),
			}
		)
	if fleet and fleet.get("failedStops"):
		alerts.append(
			{
				"id": "fleet-failed",
				"tone": "danger",
				"title": "Échecs terrain",
				"detail": f"{fleet['failedStops']} arrêt(s) non livrés ou partiels.",
				"target": _with_query("/deliveries", kpi="failed"),
			}
		)
	if payments and payments.get("discrepancies"):
		alerts.append(
			{
				"id": "cash-gap",
				"tone": "danger",
				"title": "Écarts de caisse",
				"detail": f"{payments['discrepancies']} tournée(s) en écart.",
				"target": _with_query("/cashier", status="Écart"),
			}
		)
	if payments and payments.get("toControl"):
		alerts.append(
			{
				"id": "cash-control",
				"tone": "warning",
				"title": "Caisse à contrôler",
				"detail": f"{payments['toControl']} tournée(s) en attente de contrôle.",
				"target": _with_query("/cashier", status="À contrôler"),
			}
		)
	return alerts[:10]


def build_now(*, role: str, preparation, fulfillment, fleet, payments, dispatch=None) -> list[dict[str, Any]]:
	items: list[dict[str, Any]] = []
	if (preparation or {}).get("readyToComplete"):
		items.append(
			{
				"id": "prep-complete",
				"kind": "pick",
				"title": "Reliquats à prélever",
				"detail": f"{preparation['readyToComplete']} commande(s) · stock disponible",
				"tone": "warning",
				"target": "/preparation?complete=1",
			}
		)
	for note in ((dispatch or {}).get("notes") or [])[:4]:
		route_id = note.get("routeId")
		items.append(
			{
				"id": f"dn-{note['deliveryNote']}",
				"kind": "dispatch",
				"title": f"Prêt · {note['deliveryNote']}",
				"detail": " · ".join(
					filter(
						None,
						[
							note.get("customerName"),
							note.get("routeId") or "Sans tournée",
							note.get("loadingStatus"),
						],
					)
				),
				"tone": "warning",
				"target": f"/planning/routes/{route_id}" if route_id else "/planning",
			}
		)
	for pick_list in (preparation or {}).get("pickLists") or []:
		remaining = pick_list.get("remainingQty") or 0
		items.append(
			{
				"id": f"pick-{pick_list['name']}",
				"kind": "pick",
				"title": f"Prélèvement {pick_list['name']}",
				"detail": f"{pick_list.get('salesOrderCount') or 0} commande(s) · {remaining} restant(s)",
				"tone": "info",
				"target": "/preparation",
			}
		)
	for route in (fulfillment or {}).get("toLoadRoutes") or []:
		items.append(
			{
				"id": f"load-{route['name']}",
				"kind": "load",
				"title": f"À charger · {route.get('vehicleLabel') or route['name']}",
				"detail": route.get("driverName") or "Livreur non assigné",
				"tone": "warning",
				"target": "/stock",
			}
		)
	for route in (fulfillment or {}).get("returnRoutes") or []:
		items.append(
			{
				"id": f"return-{route['name']}",
				"kind": "return",
				"title": f"Retour · {route.get('vehicleLabel') or route['name']}",
				"detail": route.get("loadingStatus") or "Retour dépôt",
				"tone": "warning",
				"target": "/stock",
			}
		)
	if role != "preparateur":
		for route in (fleet or {}).get("liveRoutes") or []:
			if route.get("lifecycle") != "En cours":
				continue
			next_stop = route.get("nextStop") or {}
			items.append(
				{
					"id": f"route-{route['name']}",
					"kind": "route",
					"title": route.get("vehicleLabel") or route["name"],
					"detail": " · ".join(
						filter(
							None,
							[
								route.get("driverName"),
								next_stop.get("customerName") or f"{route.get('remainingStops') or 0} arrêt(s) restant(s)",
							],
						)
					),
					"tone": "success",
					"target": f"/planning/routes/{route['name']}",
				}
			)
	if payments:
		if payments.get("discrepancies"):
			items.append(
				{
					"id": "now-cash-gap",
					"kind": "cash",
					"title": "Écarts de caisse",
					"detail": f"{payments['discrepancies']} tournée(s) à arbitrer",
					"tone": "danger",
					"target": "/cashier",
				}
			)
		if payments.get("toControl"):
			items.append(
				{
					"id": "now-cash-control",
					"kind": "cash",
					"title": "Contrôle de caisse",
					"detail": f"{payments['toControl']} tournée(s) à compter",
					"tone": "warning",
					"target": "/cashier",
				}
			)
	return items[:NOW_LIMIT]


def _load_pickable_orders(limit=500):
	filters: dict[str, Any] = {
		"docstatus": 1,
		"status": ["not in", list(CLOSED_SO_STATUSES)],
		"per_picked": ["<", 100],
		"per_delivered": ["<", 100],
	}
	try:
		if frappe.get_meta("Sales Order").has_field("skip_delivery_note"):
			filters["skip_delivery_note"] = 0
	except Exception:
		pass
	return frappe.get_all(
		"Sales Order",
		filters=filters,
		fields=["name", "delivery_date", "total_qty", "per_picked", "company", "customer_name"],
		order_by="delivery_date asc, transaction_date asc",
		limit=limit,
	)


def _count_shortage_orders(orders) -> int:
	if not orders:
		return 0
	from log.pick_list_ops import _stock_shortages_for_orders

	stock_status = _stock_shortages_for_orders(orders)
	return sum(1 for status in stock_status.values() if status.get("shortages"))


def _count_ready_to_complete_orders(orders) -> int:
	if not orders:
		return 0
	from log.pick_list_ops import count_ready_to_complete_orders

	return count_ready_to_complete_orders(orders)


def _load_draft_pick_lists(limit=PICK_LIST_LIMIT):
	rows = frappe.get_all(
		"Pick List",
		filters={"purpose": "Delivery", "docstatus": 0},
		fields=["name", "modified"],
		order_by="modified desc",
		limit=limit,
	)
	if not rows:
		return []
	names = [row.name for row in rows]
	items = frappe.get_all(
		"Pick List Item",
		filters={"parent": ["in", names]},
		fields=["parent", "sales_order", "qty", "picked_qty"],
	)
	orders_by_parent: dict[str, set[str]] = {name: set() for name in names}
	remaining_by_parent: dict[str, float] = {name: 0.0 for name in names}
	for item in items:
		parent = item.parent
		if item.sales_order:
			orders_by_parent.setdefault(parent, set()).add(item.sales_order)
		remaining_by_parent[parent] = remaining_by_parent.get(parent, 0.0) + max(
			flt(item.qty) - flt(item.picked_qty), 0.0
		)
	payload = []
	for row in rows:
		payload.append(
			{
				"name": row.name,
				"modified": row.modified,
				"sales_order_count": len(orders_by_parent.get(row.name) or ()),
				"remaining_qty": remaining_by_parent.get(row.name) or 0.0,
			}
		)
	return payload


def _load_open_routes():
	return frappe.get_all(
		"Livraison",
		filters={
			"docstatus": ["<", 2],
			"etat_planification": ["in", list(ACTIVE_ROUTE_STATES)],
		},
		fields=[
			"name",
			"date_liv",
			"etat_planification",
			"depart_prevu",
			"fin_prevue",
			"vehicule",
			"livreur",
			"nom_livreur",
			"statut_chargement",
			"statut_caisse",
			"depot",
		],
		order_by="date_liv asc, depart_prevu asc, creation asc",
	)


def _load_pending_cashier_routes():
	return frappe.get_all(
		"Livraison",
		filters={
			"statut_caisse": ["in", ["À contrôler", "Écart"]],
			"docstatus": ["<", 2],
		},
		fields=["name", "statut_caisse", "nom_livreur", "vehicule", "date_liv"],
		order_by="date_liv desc, modified desc",
		limit=50,
	)


def _load_today_payments(day: str):
	if not frappe.db.table_exists("tabPaiement Client"):
		return []
	return frappe.get_all(
		"Paiement Client",
		filters={"date": day, "statut_controle": ["!=", "Annulé"]},
		fields=["name", "montant", "statut_controle", "moyen_paiement", "livraison"],
	)


def _load_cash_box_balances():
	if not frappe.db.table_exists("tabCaisse Livreur"):
		return []
	return frappe.get_all(
		"Caisse Livreur",
		fields=["name", "livreur", "nom_livreur", "solde"],
	)


def _load_open_exceptions(limit=50):
	if not frappe.db.table_exists("tabException Distribution"):
		return []
	return frappe.get_all(
		"Exception Distribution",
		filters={"statut": ["in", list(OPEN_EXCEPTION_STATES)]},
		fields=[
			"name",
			"statut",
			"type_exception",
			"priorite",
			"bon_de_livraison",
			"commande_client",
			"tournee",
			"description",
		],
		order_by="date_signalement desc",
		limit=limit,
	)


def _delivery_note_route_ids() -> dict[str, str]:
	children = frappe.get_all(
		"Livraison Bon de Livraison",
		filters={"parenttype": "Livraison"},
		fields=["parent", "bon_de_livraison"],
	)
	if not children:
		return {}
	parents = list({row.parent for row in children if row.parent})
	active = set(
		frappe.get_all(
			"Livraison",
			filters={
				"name": ["in", parents],
				"etat_planification": ["in", list(ACTIVE_ROUTE_STATES)],
				"docstatus": ["<", 2],
			},
			pluck="name",
		)
	)
	return {
		row.bon_de_livraison: row.parent
		for row in children
		if row.parent in active and row.bon_de_livraison
	}


def _assigned_delivery_notes() -> set[str]:
	return set(_delivery_note_route_ids())


def _load_unassigned_notes(_day: str, limit=500) -> list[dict[str, Any]]:
	if not frappe.db.has_column("Delivery Note", "custom_statut"):
		return []
	eligible = frappe.get_all(
		"Delivery Note",
		filters={"docstatus": 0, "custom_statut": ["in", list(READY_NOTE_STATUSES)]},
		fields=["name", "custom_date_de_livraison", "custom_statut_planification", "customer_name"],
		order_by="custom_date_de_livraison asc, creation asc",
		limit=limit,
	)
	assigned = _assigned_delivery_notes()
	unassigned = []
	for row in eligible:
		if row.name in assigned:
			continue
		unassigned.append(
			{
				"deliveryNote": row.name,
				"customerName": row.customer_name,
				"requestedDate": str(row.custom_date_de_livraison or "") or None,
				"planningStatus": row.custom_statut_planification or "Non planifié",
			}
		)
	return unassigned


def _dn_ready_fields() -> list[str]:
	fields = [
		"name",
		"custom_date_de_livraison",
		"custom_statut",
		"custom_tournee",
		"custom_statut_planification",
		"customer_name",
		"customer",
		"total_qty",
	]
	if frappe.db.has_column("Delivery Note", "custom_commune"):
		fields.append("custom_commune")
	return fields


def _commune_labels(commune_ids: list[str]) -> dict[str, str]:
	ids = list(dict.fromkeys(name for name in commune_ids if name))
	if not ids:
		return {}
	try:
		rows = frappe.get_all("Commune", filters={"name": ["in", ids]}, fields=["name", "nom"])
	except Exception:
		return {name: name for name in ids}
	return {row.name: (row.nom or row.name) for row in rows}


def enrich_dispatch_notes(notes: list[dict[str, Any]]) -> list[dict[str, Any]]:
	"""Ajoute commune, GPS et quantité sans casser les notes déjà sérialisées."""
	gps = _customer_gps_map([note.get("customer") for note in notes if note.get("customer")])
	labels = _commune_labels([note.get("communeId") for note in notes if note.get("communeId")])
	for note in notes:
		place = gps.get(note.get("customer") or "") or {}
		commune_id = note.pop("communeId", None)
		if commune_id and "customerCity" not in note:
			note["customerCity"] = labels.get(commune_id) or commune_id
		if place.get("latitude") is not None:
			note["latitude"] = place.get("latitude")
			note["longitude"] = place.get("longitude")
	return notes


def _load_shipped_counts(day: str) -> dict[str, int]:
	if not frappe.db.has_column("Delivery Note", "custom_statut"):
		return {}
	start = date_str(add_days(getdate(day), -13))
	rows = frappe.db.sql(
		"""
		SELECT DATE(COALESCE(posting_date, creation)) AS day, COUNT(*) AS total
		FROM `tabDelivery Note`
		WHERE docstatus < 2
		  AND custom_statut IN ('Livré', 'Partiellement Livré')
		  AND DATE(COALESCE(posting_date, creation)) BETWEEN %(start)s AND %(day)s
		GROUP BY DATE(COALESCE(posting_date, creation))
		""",
		{"start": start, "day": day},
		as_dict=True,
	)
	return {date_str(row.day): int(row.total or 0) for row in rows}


def _load_ready_notes(limit=500) -> list[dict[str, Any]]:
	if not frappe.db.has_column("Delivery Note", "custom_statut"):
		return []
	eligible = frappe.get_all(
		"Delivery Note",
		filters={"docstatus": 0, "custom_statut": ["in", list(READY_NOTE_STATUSES)]},
		fields=_dn_ready_fields(),
		order_by="custom_date_de_livraison asc, creation asc",
		limit=limit,
	)
	assigned = _delivery_note_route_ids()
	route_ids = list({*(assigned.values()), *(_attr(row, "custom_tournee") for row in eligible if _attr(row, "custom_tournee"))})
	routes: dict[str, Any] = {}
	if route_ids:
		for route in frappe.get_all(
			"Livraison",
			filters={"name": ["in", route_ids], "docstatus": ["<", 2]},
			fields=["name", "etat_planification", "statut_chargement", "date_liv"],
		):
			routes[route.name] = route
	notes = []
	for row in eligible:
		route_id = assigned.get(row.name) or _attr(row, "custom_tournee") or None
		route = routes.get(route_id) if route_id else None
		route_date = _attr(route, "date_liv") if route else None
		qty = flt(_attr(row, "total_qty"))
		notes.append(
			{
				"deliveryNote": row.name,
				"customer": _attr(row, "customer"),
				"customerName": row.customer_name,
				"communeId": _attr(row, "custom_commune"),
				"qty": qty or None,
				"requestedDate": str(row.custom_date_de_livraison or "") or None,
				"lifecycle": row.custom_statut,
				"planningStatus": row.custom_statut_planification or "Non planifié",
				"routeId": route_id,
				"routeDate": date_str(route_date) if route_date else None,
				"routeLifecycle": _attr(route, "etat_planification") if route else None,
				"loadingStatus": _attr(route, "statut_chargement") if route else None,
			}
		)
	return enrich_dispatch_notes(notes)


def _customer_gps_map(customers: list[str]) -> dict[str, dict[str, Any]]:
	if not customers or not frappe.db.has_column("Customer", "custom_gps"):
		return {}
	rows = frappe.get_all(
		"Customer",
		filters={"name": ["in", customers]},
		fields=["name", "customer_name", "custom_gps"],
	)
	payload = {}
	for row in rows:
		latitude, longitude = parse_gps_value(row.get("custom_gps"))
		payload[row.name] = {
			"customerName": row.customer_name or row.name,
			"latitude": latitude,
			"longitude": longitude,
		}
	return payload


def _depot_point(depot_name: str | None) -> dict[str, Any] | None:
	if not depot_name:
		return None
	try:
		from log.services.routing import get_depot_snapshot

		return get_depot_snapshot(depot_name)
	except Exception:
		return None


def build_lite_routes(routes, children, delivery_notes, gps_by_customer) -> list[dict[str, Any]]:
	stops_by_route: dict[str, list[dict[str, Any]]] = { _attr(route, "name"): [] for route in routes }
	for child in children:
		dn = delivery_notes.get(_attr(child, "bon_de_livraison"))
		if not dn:
			continue
		customer = _attr(dn, "customer")
		gps = gps_by_customer.get(customer) or {}
		status = _attr(dn, "custom_statut") or "Nouveau"
		stops_by_route.setdefault(_attr(child, "parent"), []).append(
			{
				"deliveryNote": _attr(dn, "name"),
				"customer": customer,
				"customerName": gps.get("customerName") or _attr(dn, "customer_name") or customer,
				"status": status,
				"sequence": int(_attr(child, "idx") or 1),
				"latitude": gps.get("latitude"),
				"longitude": gps.get("longitude"),
			}
		)

	vehicle_cache: dict[str, str | None] = {}
	payload = []
	for route in routes:
		name = _attr(route, "name")
		lifecycle = _attr(route, "etat_planification") or _attr(route, "lifecycle")
		if lifecycle not in LIVE_ROUTE_STATES:
			continue
		stops = sorted(stops_by_route.get(name) or [], key=lambda stop: stop["sequence"])
		done = sum(1 for stop in stops if is_terminal_stop(stop["status"]))
		failed = sum(1 for stop in stops if is_failed_stop(stop["status"]))
		next_stop = next((stop for stop in stops if not is_terminal_stop(stop["status"])), None)
		payload.append(
			{
				"name": name,
				"date": date_str(_attr(route, "date_liv") or _attr(route, "date")),
				"lifecycle": lifecycle,
				"plannedStart": str(_attr(route, "depart_prevu") or "") or None,
				"plannedEnd": str(_attr(route, "fin_prevue") or "") or None,
				"driver": _attr(route, "livreur") or _attr(route, "driver"),
				"driverName": _attr(route, "nom_livreur") or _attr(route, "driverName"),
				"vehicle": _attr(route, "vehicule") or _attr(route, "vehicle"),
				"vehicleLabel": _attr(route, "vehicleLabel")
				or _vehicle_label(_attr(route, "vehicule") or _attr(route, "vehicle"), vehicle_cache),
				"loadingStatus": _attr(route, "statut_chargement") or "À charger",
				"cashStatus": _attr(route, "statut_caisse") or "Sans encaissement",
				"depot": _depot_point(_attr(route, "depot")),
				"stops": stops,
				"doneStops": done,
				"remainingStops": max(len(stops) - done, 0),
				"failedStops": failed,
				"nextStop": (
					{
						"deliveryNote": next_stop["deliveryNote"],
						"customerName": next_stop["customerName"],
						"status": next_stop["status"],
					}
					if next_stop
					else None
				),
			}
		)
	return payload


def _load_route_children(route_names: list[str]):
	if not route_names:
		return []
	return frappe.get_all(
		"Livraison Bon de Livraison",
		filters={"parent": ["in", route_names], "parenttype": "Livraison"},
		fields=["parent", "bon_de_livraison", "idx"],
		order_by="idx asc",
	)


def _load_delivery_notes(names: list[str]) -> dict[str, Any]:
	if not names:
		return {}
	rows = frappe.get_all(
		"Delivery Note",
		filters={"name": ["in", names]},
		fields=["name", "customer", "customer_name", "custom_statut"],
	)
	return {row.name: row for row in rows}


def _load_vehicle_stocks():
	from log.services.distribution_vehicle_stock import vehicle_stock_snapshot

	return vehicle_stock_snapshot()


def build_activity_dashboard(*, role: str, date=None) -> dict[str, Any]:
	day = date_str(date)
	sections = sections_for_role(role)
	payload: dict[str, Any] = {"date": day, "role": role}

	orders = _load_pickable_orders() if "preparation" in sections else []
	pick_lists = _load_draft_pick_lists() if "preparation" in sections else []
	shortage_count = _count_shortage_orders(orders) if "preparation" in sections else 0
	ready_count = _count_ready_to_complete_orders(orders) if "preparation" in sections else 0
	preparation = (
		summarize_preparation(orders, pick_lists, shortage_count, day, ready_to_complete=ready_count)
		if "preparation" in sections
		else None
	)

	open_routes = _load_open_routes() if sections & {"fulfillment", "fleet"} else []
	if "fulfillment" in sections:
		vehicle_cache: dict[str, str | None] = {}
		labeled = []
		for route in open_routes:
			row = {
				"name": _attr(route, "name"),
				"date_liv": _attr(route, "date_liv"),
				"etat_planification": _attr(route, "etat_planification"),
				"statut_chargement": _attr(route, "statut_chargement"),
				"nom_livreur": _attr(route, "nom_livreur"),
				"vehicule": _attr(route, "vehicule"),
				"livreur": _attr(route, "livreur"),
			}
			row["vehicleLabel"] = _vehicle_label(row.get("vehicule"), vehicle_cache)
			labeled.append(row)
		fulfillment = summarize_fulfillment(labeled)
	else:
		fulfillment = None

	fleet = None
	if "fleet" in sections:
		live_candidates = [
			route
			for route in open_routes
			if (_attr(route, "etat_planification") or _attr(route, "lifecycle")) in LIVE_ROUTE_STATES
		]
		route_names = [_attr(route, "name") for route in live_candidates]
		children = _load_route_children(route_names)
		notes = _load_delivery_notes(
			[ _attr(child, "bon_de_livraison") for child in children if _attr(child, "bon_de_livraison") ]
		)
		gps = _customer_gps_map([_attr(dn, "customer") for dn in notes.values() if _attr(dn, "customer")])
		fleet = summarize_fleet(build_lite_routes(live_candidates, children, notes, gps))

	planning = summarize_planning(_load_unassigned_notes(day), day) if "planning" in sections else None
	ready_notes = _load_ready_notes() if "dispatch" in sections else []
	dispatch = summarize_dispatch(ready_notes, day) if "dispatch" in sections else None
	stock = summarize_stock(_load_vehicle_stocks()) if "stock" in sections else None
	payload["shippedTrend"] = summarize_shipped_trend(_load_shipped_counts(day), day)
	if "dispatch" in sections:
		payload["routeSuggestions"] = suggest_route_groups(ready_notes)

	payments = None
	if "payments" in sections:
		payments = summarize_payments(
			_load_pending_cashier_routes(),
			_load_today_payments(day),
			_load_cash_box_balances(),
		)

	if sections & {"fleet", "planning"}:
		payload["pipeline"] = build_pipeline(preparation, planning, dispatch, fleet, payments)

	exceptions = _load_open_exceptions() if "alerts" in sections and role != "preparateur" else []
	if "alerts" in sections:
		payload["alerts"] = build_alerts(
			role=role,
			exceptions=exceptions,
			preparation=preparation,
			fulfillment=fulfillment,
			fleet=fleet,
			planning=planning,
			stock=stock,
			payments=payments,
		)
	if "now" in sections:
		payload["now"] = build_now(
			role=role,
			preparation=preparation,
			fulfillment=fulfillment,
			fleet=fleet,
			payments=payments,
			dispatch=dispatch,
		)

	if preparation is not None:
		payload["preparation"] = preparation
	if fulfillment is not None:
		payload["fulfillment"] = fulfillment
	if fleet is not None:
		payload["fleet"] = fleet
	if planning is not None:
		payload["planning"] = planning
	if dispatch is not None:
		payload["dispatch"] = dispatch
	if stock is not None:
		payload["stock"] = stock
	if payments is not None:
		payload["payments"] = payments
	return payload
