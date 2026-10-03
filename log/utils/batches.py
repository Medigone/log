# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Lots & dates de péremption : lecture partagée par la réception, la préparation et les BL."""

from __future__ import annotations

import frappe
from frappe.utils import cint, date_diff, getdate, nowdate

SETTINGS_DOCTYPE = "Parametres Livraison"
THRESHOLD_FIELD = "seuil_dlc_proche_jours"
DEFAULT_THRESHOLD_DAYS = 30


def batch_expiry_map(batch_names) -> dict[str, str | None]:
	"""{lot: 'AAAA-MM-JJ' | None} ; aucune requête si aucun lot."""
	names = sorted({name for name in batch_names if name})
	if not names:
		return {}
	rows = frappe.get_all("Batch", filters={"name": ["in", names]}, fields=["name", "expiry_date"])
	return {row.name: str(row.expiry_date) if row.expiry_date else None for row in rows}


def stored_threshold():
	"""Valeur brute : get_single_value renvoie 0 pour un Int jamais enregistré, indiscernable d'un vrai 0."""
	rows = frappe.db.sql(
		"select value from `tabSingles` where doctype = %s and field = %s",
		(SETTINGS_DOCTYPE, THRESHOLD_FIELD),
	)
	return rows[0][0] if rows else None


def expiry_threshold_days() -> int:
	value = stored_threshold()
	if value in (None, ""):
		return DEFAULT_THRESHOLD_DAYS
	return max(cint(value), 0)


def is_expired(expiry_date, today=None) -> bool:
	"""Un lot reste valable le jour même de sa DLC (même règle qu'ERPNext)."""
	if not expiry_date:
		return False
	return getdate(expiry_date) < getdate(today or nowdate())


def is_expiry_soon(expiry_date, threshold_days: int, today=None) -> bool:
	if not expiry_date:
		return False
	return date_diff(getdate(expiry_date), getdate(today or nowdate())) <= threshold_days


def batch_display(batch_names) -> dict[str, dict]:
	"""{lot: {expiry_date, expiry_soon, expired}} pour l'affichage ; seuil lu une seule fois."""
	expiry = batch_expiry_map(batch_names)
	if not expiry:
		return {}
	threshold = expiry_threshold_days() if any(expiry.values()) else DEFAULT_THRESHOLD_DAYS
	return {
		name: {
			"expiry_date": date,
			"expiry_soon": is_expiry_soon(date, threshold),
			"expired": is_expired(date),
		}
		for name, date in expiry.items()
	}
