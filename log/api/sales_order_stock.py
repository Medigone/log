# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Stock réel et déjà commandé (Bin) pour les lignes de commande client.

Compatible ERPNext / Frappe v15 et v16 : lecture directe de tabBin, sans get_item_details.
"""

from __future__ import annotations

import json
from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cstr, flt


def stock_key(item_code, warehouse=None) -> str:
	return f"{cstr(item_code)}::{cstr(warehouse or '')}"


def parse_stock_items(items) -> list[dict]:
	if isinstance(items, str):
		items = json.loads(items)
	if not isinstance(items, (list, tuple)):
		return []

	parsed = []
	for row in items:
		if isinstance(row, str):
			try:
				row = json.loads(row)
			except (TypeError, ValueError, json.JSONDecodeError):
				continue
		if row is None or not hasattr(row, "get"):
			continue
		item_code = cstr(row.get("item_code"))
		if not item_code:
			continue
		parsed.append({"item_code": item_code, "warehouse": cstr(row.get("warehouse"))})
	return parsed


def aggregate_item_stock(requests, bins, warehouse_sets, company_warehouses=None) -> dict:
	"""Agrège actual_qty / reserved_qty par (article, entrepôt).

	`company_warehouses` n'est utilisé que si la ligne n'a pas d'entrepôt :
	- None : somme de tous les Bin de l'article
	- set : somme limitée aux entrepôts de la société
	"""
	bins_by_item = defaultdict(list)
	for bin_row in bins or []:
		if not hasattr(bin_row, "get"):
			continue
		item_code = cstr(bin_row.get("item_code"))
		if item_code:
			bins_by_item[item_code].append(bin_row)

	result = {}
	for req in requests or []:
		item_code = cstr(req.get("item_code"))
		warehouse = cstr(req.get("warehouse"))
		if not item_code:
			continue
		key = stock_key(item_code, warehouse)
		if key in result:
			continue

		if warehouse:
			allowed = set(warehouse_sets.get(warehouse) or [warehouse])
		else:
			allowed = company_warehouses

		actual = 0.0
		reserved = 0.0
		for bin_row in bins_by_item.get(item_code) or []:
			wh = cstr(bin_row.get("warehouse"))
			if allowed is not None and wh not in allowed:
				continue
			actual += flt(bin_row.get("actual_qty"))
			reserved += flt(bin_row.get("reserved_qty"))
		result[key] = {"actual_qty": actual, "reserved_qty": reserved}
	return result


def _get_child_warehouses(warehouse):
	from erpnext.stock.doctype.warehouse.warehouse import get_child_warehouses

	return get_child_warehouses(warehouse)


def child_warehouses(warehouse) -> list[str]:
	"""Entrepôt + descendants, avec repli si l'API ERPNext est indisponible."""
	if not warehouse:
		return []
	try:
		children = _get_child_warehouses(warehouse)
		if children:
			return list(children)
	except Exception:
		pass
	return [warehouse]


def _fetch_bins(item_codes) -> list:
	if not item_codes:
		return []
	return (
		frappe.get_all(
			"Bin",
			filters={"item_code": ["in", list(item_codes)]},
			fields=["item_code", "warehouse", "actual_qty", "reserved_qty"],
		)
		or []
	)


def _company_warehouses(company) -> set[str]:
	if not company:
		return set()
	return set(frappe.get_all("Warehouse", filters={"company": company}, pluck="name") or [])


@frappe.whitelist()
def get_items_stock(items, company=None):
	if not frappe.has_permission("Sales Order", "read"):
		frappe.throw(_("Vous n'avez pas accès aux commandes client."), frappe.PermissionError)

	requests = parse_stock_items(items)
	if not requests:
		return {}

	item_codes = list(dict.fromkeys(row["item_code"] for row in requests))
	bins = _fetch_bins(item_codes)

	warehouse_sets = {}
	for warehouse in dict.fromkeys(row["warehouse"] for row in requests if row["warehouse"]):
		warehouse_sets[warehouse] = child_warehouses(warehouse)

	needs_company = any(not row["warehouse"] for row in requests)
	company_warehouses = None
	if needs_company:
		company_warehouses = _company_warehouses(company) if company else None

	return aggregate_item_stock(requests, bins, warehouse_sets, company_warehouses)
