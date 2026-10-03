# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Réservation de stock interne à Distribution.

Chaque ligne de commande porte `custom_qte_reservee` (unité de stock). Une réservation reste
ouverte tant que la marchandise n'a pas quitté le dépôt : elle est consommée par les BL soumis et
par les BL brouillons déjà chargés dans un véhicule (`custom_stock_transferred`).

Disponible = stock réel de l'entrepôt − réservations ouvertes des autres commandes.
"""

from __future__ import annotations

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, flt

RESERVED_FIELD = "custom_qte_reservee"
CLOSED_ORDER_STATUSES = ("Closed", "Completed", "On Hold", "Cancelled")


def _has_reservation_field() -> bool:
	return bool(frappe.db.has_column("Sales Order Item", RESERVED_FIELD))


def consumed_qty_by_so_item(so_items) -> dict[str, float]:
	"""Quantité (unité de stock) sortie du dépôt pour chaque ligne de commande."""
	names = sorted({name for name in so_items if name})
	if not names:
		return {}
	transferred = (
		"or (dn.docstatus = 0 and ifnull(dn.custom_stock_transferred, 0) = 1)"
		if frappe.db.has_column("Delivery Note", "custom_stock_transferred")
		else ""
	)
	rows = frappe.db.sql(
		f"""
		select dni.so_detail, sum(dni.stock_qty) as qty
		from `tabDelivery Note Item` dni
		inner join `tabDelivery Note` dn on dn.name = dni.parent
		where dni.so_detail in %(names)s
			and ifnull(dn.is_return, 0) = 0
			and (dn.docstatus = 1 {transferred})
		group by dni.so_detail
		""",
		{"names": names},
		as_dict=True,
	)
	return {row.so_detail: flt(row.qty) for row in rows}


def _reservation_rows(item_codes, warehouse=None, exclude_order=None):
	codes = sorted({code for code in item_codes if code})
	if not codes or not _has_reservation_field():
		return []
	conditions = [
		"soi.item_code in %(codes)s",
		f"ifnull(soi.`{RESERVED_FIELD}`, 0) > 0",
		"so.docstatus < 2",
		"so.status not in %(closed)s",
	]
	values = {"codes": codes, "closed": CLOSED_ORDER_STATUSES}
	if warehouse:
		conditions.append("ifnull(nullif(soi.warehouse, ''), so.set_warehouse) = %(warehouse)s")
		values["warehouse"] = warehouse
	if exclude_order:
		conditions.append("so.name != %(exclude)s")
		values["exclude"] = exclude_order
	return frappe.db.sql(
		f"""
		select soi.name, soi.parent, soi.item_code, soi.`{RESERVED_FIELD}` as reserved
		from `tabSales Order Item` soi
		inner join `tabSales Order` so on so.name = soi.parent
		where {" and ".join(conditions)}
		""",
		values,
		as_dict=True,
	)


def open_reservations(item_codes, warehouse=None, exclude_order=None) -> dict[str, float]:
	"""Réservations encore ouvertes par article (hors commande `exclude_order`)."""
	rows = _reservation_rows(item_codes, warehouse, exclude_order)
	consumed = consumed_qty_by_so_item(row.name for row in rows)
	totals: dict[str, float] = defaultdict(float)
	for row in rows:
		totals[row.item_code] += max(0.0, flt(row.reserved) - consumed.get(row.name, 0.0))
	return dict(totals)


def actual_stock(item_codes, warehouse) -> dict[str, float]:
	codes = sorted({code for code in item_codes if code})
	if not codes or not warehouse:
		return {}
	rows = frappe.get_all(
		"Bin",
		filters={"item_code": ["in", codes], "warehouse": warehouse},
		fields=["item_code", "actual_qty"],
	)
	return {row.item_code: flt(row.actual_qty) for row in rows}


def available_stock(item_codes, warehouse, exclude_order=None) -> dict[str, float]:
	"""Stock réel − réservations ouvertes des autres commandes, par article."""
	codes = sorted({code for code in item_codes if code})
	if not codes or not warehouse:
		return {}
	actual = actual_stock(codes, warehouse)
	reserved = open_reservations(codes, warehouse, exclude_order)
	return {code: actual.get(code, 0.0) - reserved.get(code, 0.0) for code in codes}


def allocate_reservations(lines, warehouse, exclude_order=None, consumed=None) -> list[float]:
	"""Réservation à poser sur chaque ligne (unité de stock).

	`lines` : dicts avec `item_code`, `qty` (unité de stock), `reserved_qty` (None = automatique) et
	optionnellement `so_detail` (ligne existante, pour tenir compte de ce qui est déjà sorti).
	`reserved_qty` compte aussi la part déjà sortie du dépôt. Une réservation automatique prend toute
	la quantité restante dans la limite du disponible ; une réservation saisie au-delà du disponible
	est refusée.
	"""
	consumed = consumed or {}
	available = available_stock([line["item_code"] for line in lines], warehouse, exclude_order)
	remaining = dict(available)
	result = []
	for line in lines:
		code = line["item_code"]
		already_out = consumed.get(line.get("so_detail"), 0.0)
		qty = max(0.0, flt(line["qty"]) - already_out)
		requested = line.get("reserved_qty")
		free = max(0.0, remaining.get(code, 0.0))
		if requested is None:
			reserve = min(qty, free)
		else:
			reserve = max(0.0, flt(requested) - already_out)
			if reserve > qty + 1e-9:
				frappe.throw(
					_("{0} : la réservation ({1}) dépasse la quantité commandée ({2}).").format(code, flt(requested), flt(line["qty"]))
				)
			if reserve > free + 1e-9:
				frappe.throw(_("{0} : seulement {1} disponible(s) à réserver.").format(code, _qty(free)))
		remaining[code] = remaining.get(code, 0.0) - reserve
		# Valeur stockée = réservation ouverte + ce qui est déjà sorti (consommé) sur la ligne.
		result.append(flt(reserve + already_out, 6))
	return result


def _qty(value) -> str:
	value = flt(value, 3)
	return str(cint(value)) if value == cint(value) else str(value)
