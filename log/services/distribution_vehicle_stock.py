"""Stock physique temps réel des entrepôts véhicule."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

import frappe
from frappe.utils import flt

ACTIVE_VEHICLE_ROUTE_STATES = ("En cours", "Retour dépôt", "Contrôle caisse")


def build_vehicle_stocks(vehicles, bins, item_names: dict[str, str], routes) -> list[dict[str, Any]]:
	lines_by_warehouse: dict[str, list[dict[str, Any]]] = defaultdict(list)
	for row in bins:
		warehouse = row.get("warehouse")
		if not warehouse:
			continue
		item_code = row.get("item_code")
		lines_by_warehouse[warehouse].append(
			{
				"itemCode": item_code,
				"itemName": item_names.get(item_code) or item_code,
				"quantity": flt(row.get("actual_qty")),
				"uom": row.get("stock_uom") or None,
			}
		)

	routes_by_vehicle: dict[str, list[dict[str, Any]]] = defaultdict(list)
	for row in routes:
		vehicle = row.get("vehicule")
		if not vehicle:
			continue
		routes_by_vehicle[vehicle].append(
			{
				"routeId": row.get("name"),
				"lifecycle": row.get("etat_planification"),
				"driver": row.get("livreur") or None,
				"driverName": row.get("nom_livreur") or None,
			}
		)

	payload = []
	for vehicle in vehicles:
		warehouse = vehicle.get("warehouse")
		lines = sorted(lines_by_warehouse.get(warehouse or "", []), key=lambda line: line["itemName"] or line["itemCode"])
		label = " · ".join(filter(None, [vehicle.get("nom"), vehicle.get("immatriculation")])) or vehicle.get("name")
		payload.append(
			{
				"name": vehicle.get("name"),
				"label": label,
				"registration": vehicle.get("immatriculation") or None,
				"status": vehicle.get("status") or None,
				"active": bool(vehicle.get("active")),
				"warehouse": warehouse or None,
				"missingWarehouse": not bool(warehouse),
				"totalQuantity": sum(line["quantity"] for line in lines),
				"itemCount": len(lines),
				"lines": lines,
				"activeRoutes": routes_by_vehicle.get(vehicle.get("name"), []),
			}
		)
	return payload


def vehicle_stock_snapshot() -> list[dict[str, Any]]:
	vehicles = frappe.get_all(
		"Vehicule",
		fields=["name", "nom", "immatriculation", "status", "active", "warehouse"],
		order_by="nom asc",
	)
	warehouses = [row.warehouse for row in vehicles if row.warehouse]
	bins = []
	if warehouses and frappe.db.table_exists("tabBin"):
		bins = frappe.get_all(
			"Bin",
			filters={"warehouse": ["in", warehouses], "actual_qty": ["!=", 0]},
			fields=["item_code", "warehouse", "actual_qty", "stock_uom"],
		)
	item_codes = list({row.item_code for row in bins if row.item_code})
	item_names = {}
	if item_codes:
		item_names = {
			row.name: row.item_name or row.name
			for row in frappe.get_all("Item", filters={"name": ["in", item_codes]}, fields=["name", "item_name"])
		}
	vehicle_names = [row.name for row in vehicles]
	routes = []
	if vehicle_names:
		routes = frappe.get_all(
			"Livraison",
			filters={"etat_planification": ["in", list(ACTIVE_VEHICLE_ROUTE_STATES)], "vehicule": ["in", vehicle_names]},
			fields=["name", "vehicule", "livreur", "nom_livreur", "etat_planification"],
			order_by="depart_prevu asc",
		)
	return build_vehicle_stocks(vehicles, bins, item_names, routes)
