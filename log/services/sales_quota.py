# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Vente en quota : quantité max d'un article par commande (le responsable peut dépasser)."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, flt

QUOTA_FIELD = "custom_vente_en_quota"
QUOTA_MAX_FIELD = "custom_quota_max_commande"
TOLERANCE = 1e-9


def quota_enabled() -> bool:
	return bool(frappe.db.has_column("Item", QUOTA_FIELD) and frappe.db.has_column("Item", QUOTA_MAX_FIELD))


def quota_fields() -> list[str]:
	"""Colonnes Item à lire pour connaître le quota d'un article."""
	return [QUOTA_FIELD, QUOTA_MAX_FIELD] if quota_enabled() else []


def row_quota(row) -> float | None:
	"""Quantité max par commande d'une ligne Item, si l'article est vendu en quota."""
	if not cint(row.get(QUOTA_FIELD)) or flt(row.get(QUOTA_MAX_FIELD)) <= 0:
		return None
	return flt(row.get(QUOTA_MAX_FIELD))


def item_quotas(item_codes) -> dict[str, float]:
	"""Quota max par article, pour les seuls articles en vente en quota."""
	codes = sorted({code for code in item_codes or [] if code})
	if not codes or not quota_enabled():
		return {}
	rows = frappe.get_all(
		"Item",
		filters={"name": ["in", codes], QUOTA_FIELD: 1},
		fields=["name", QUOTA_MAX_FIELD],
	)
	return {row.name: flt(row.get(QUOTA_MAX_FIELD)) for row in rows if flt(row.get(QUOTA_MAX_FIELD)) > 0}


def qty_by_item(lines) -> dict[str, float]:
	totals: dict[str, float] = {}
	for line in lines or []:
		code = line.get("item_code")
		if code:
			totals[code] = totals.get(code, 0.0) + flt(line.get("qty"))
	return totals


def check_quotas(lines, *, allow_override=False, previous=None):
	"""Refuse une quantité au-delà du quota, sauf dépassement autorisé.

	`previous` : quantités déjà enregistrées par article ; une quantité acceptée
	auparavant par le responsable peut être conservée, mais pas augmentée.
	"""
	if allow_override:
		return
	totals = qty_by_item(lines)
	quotas = item_quotas(totals)
	previous = previous or {}
	for code, quota in quotas.items():
		qty = totals[code]
		if qty <= quota + TOLERANCE or qty <= flt(previous.get(code)) + TOLERANCE:
			continue
		item_name = frappe.db.get_value("Item", code, "item_name") or code
		frappe.throw(
			_("{0} est vendu en quota : maximum {1} par commande.").format(item_name, f"{quota:g}"),
			title=_("Quota dépassé"),
		)


def stock_qty_by_item(rows) -> dict[str, float]:
	"""Quantités en unité de stock des lignes d'une commande existante."""
	return qty_by_item({"item_code": row.item_code, "qty": flt(row.stock_qty or row.qty)} for row in rows or [])


def validate_quota_settings(enabled, max_qty):
	if cint(enabled) and flt(max_qty) <= 0:
		frappe.throw(_("Saisissez la quantité max autorisée par commande pour la vente en quota."))
