# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Impression des listes de prélèvement : bon de préparation par article, entrepôt et lot (FEFO)."""

from __future__ import annotations

import json
from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, now_datetime

from log.api.distribution import PREPARATION_ROLES, _require
from log.order_print import _company_block, _date, _logo_data_uri, quantity
from log.utils.batches import batch_display

TEMPLATE = "log/templates/print/pick_list.html"
MAX_PICK_LISTS = 100


def _status(doc) -> str:
	if cint(doc.docstatus) == 0:
		return "Brouillon"
	if cint(doc.docstatus) == 2:
		return "Annulée"
	return "Soumise"


def _orders_block(order_names) -> list[dict]:
	if not order_names:
		return []
	from log.pick_list_ops import _attach_commune_names

	rows = frappe.get_all(
		"Sales Order",
		filters={"name": ["in", list(order_names)]},
		fields=["name", "customer", "customer_name", "delivery_date", "custom_commune", "custom_wilaya"],
	)
	rows = _attach_commune_names(rows)
	by_name = {row.name: row for row in rows}
	orders = []
	for name in order_names:
		row = by_name.get(name)
		if not row:
			continue
		place = ", ".join(dict.fromkeys(value for value in (row.get("custom_commune_nom"), row.get("custom_wilaya")) if value))
		orders.append(
			{
				"name": name,
				"customer": row.customer_name or row.customer,
				"place": place,
				"delivery_date": _date(row.delivery_date),
			}
		)
	return orders


def _pick_lines(locations, batches) -> list[dict]:
	"""Une ligne par article × entrepôt × lot, toutes commandes confondues ; tri entrepôt → article → DLC."""
	buckets = defaultdict(lambda: {"qty": 0.0, "picked": 0.0, "orders": []})
	for loc in locations:
		key = (cstr(loc.warehouse), cstr(loc.item_code), cstr(loc.get("batch_no")))
		bucket = buckets[key]
		bucket.update(
			{
				"warehouse": loc.warehouse,
				"item_code": loc.item_code,
				"item_name": loc.item_name or loc.item_code,
				"uom": loc.get("stock_uom") or loc.get("uom"),
				"batch_no": loc.get("batch_no") or "",
			}
		)
		bucket["qty"] += flt(loc.stock_qty)
		bucket["picked"] += flt(loc.get("picked_qty"))
		if loc.get("sales_order") and loc.sales_order not in bucket["orders"]:
			bucket["orders"].append(loc.sales_order)

	def sort_key(bucket):
		expiry = (batches.get(bucket["batch_no"]) or {}).get("expiry_date") or "9999-12-31"
		return (cstr(bucket["warehouse"]), cstr(bucket["item_name"]).lower(), expiry)

	lines = []
	for index, bucket in enumerate(sorted(buckets.values(), key=sort_key), start=1):
		info = batches.get(bucket["batch_no"]) or {}
		lines.append(
			{
				"idx": index,
				"item_code": bucket["item_code"] if cstr(bucket["item_code"]) != cstr(bucket["item_name"]) else "",
				"item_name": bucket["item_name"],
				"warehouse": bucket["warehouse"] or "",
				"batch_no": bucket["batch_no"],
				"expiry_date": _date(info.get("expiry_date")),
				"expiry_soon": bool(info.get("expiry_soon")),
				"qty": quantity(bucket["qty"]),
				"picked": quantity(bucket["picked"]) if bucket["picked"] else "",
				"uom": bucket["uom"],
				"orders": bucket["orders"],
			}
		)
	return lines


def pick_list_print_context(doc) -> dict:
	"""Données du bon de préparation ; exposé à Jinja pour le format d'impression du Desk."""
	if isinstance(doc, str):
		doc = frappe.get_doc("Pick List", doc)
	locations = list(doc.get("locations") or [])
	batches = batch_display(loc.get("batch_no") for loc in locations)
	order_names = list(dict.fromkeys(loc.sales_order for loc in locations if loc.get("sales_order")))
	owner = frappe.db.get_value("User", doc.owner, "full_name") if doc.get("owner") else None
	lines = _pick_lines(locations, batches)
	return {
		"logo": _logo_data_uri(),
		"company": _company_block(doc.company),
		"pick_list": {
			"name": doc.name,
			"date": _date(doc.get("creation")),
			"warehouse": doc.get("parent_warehouse") or "",
			"owner": owner or "",
			"status": _status(doc),
			"is_draft": cint(doc.docstatus) == 0,
			"is_cancelled": cint(doc.docstatus) == 2,
			"order_changed": cint(doc.get("custom_order_changed")) == 1,
		},
		"orders": _orders_block(order_names),
		"has_batches": any(line["batch_no"] for line in lines),
		"has_picked": any(line["picked"] for line in lines),
		"lines": lines,
		"totals": {
			"lines": len(lines),
			"qty": quantity(sum(flt(loc.stock_qty) for loc in locations)),
		},
		"printed_at": now_datetime().strftime("%d/%m/%Y %H:%M"),
	}


def render_pick_lists_html(names: list[str]) -> str:
	pages = [pick_list_print_context(frappe.get_doc("Pick List", name)) for name in names]
	return frappe.render_template(TEMPLATE, {"pages": pages, "standalone": True})


def _parse_names(names) -> list[str]:
	if isinstance(names, str):
		try:
			names = json.loads(names)
		except json.JSONDecodeError:
			names = [names]
	if not isinstance(names, (list, tuple)):
		names = []
	cleaned = list(dict.fromkeys(cstr(name).strip() for name in names if cstr(name).strip()))
	if not cleaned:
		frappe.throw(_("Sélectionnez au moins une liste de prélèvement."))
	if len(cleaned) > MAX_PICK_LISTS:
		frappe.throw(_("Impression limitée à {0} listes à la fois.").format(MAX_PICK_LISTS))
	missing = [name for name in cleaned if not frappe.db.exists("Pick List", name)]
	if missing:
		frappe.throw(_("Liste de prélèvement introuvable : {0}").format(", ".join(missing)))
	return cleaned


def _pdf_filename(names: list[str]) -> str:
	if len(names) == 1:
		return f"{names[0]}.pdf"
	return f"Preparation-{now_datetime().strftime('%Y%m%d-%H%M')}-{len(names)}.pdf"


@frappe.whitelist()
def download_pick_lists_pdf(names):
	"""PDF (affiché dans le navigateur) d'une ou plusieurs listes de prélèvement, une liste par page."""
	_require(PREPARATION_ROLES)
	from frappe.utils.pdf import get_pdf

	cleaned = _parse_names(names)
	html = render_pick_lists_html(cleaned)
	pdf = get_pdf(
		html,
		{
			"page-size": "A4",
			"margin-top": "12mm",
			"margin-bottom": "14mm",
			"margin-left": "12mm",
			"margin-right": "12mm",
			"encoding": "UTF-8",
		},
	)
	frappe.local.response.filename = _pdf_filename(cleaned)
	frappe.local.response.filecontent = pdf
	frappe.local.response.type = "pdf"
