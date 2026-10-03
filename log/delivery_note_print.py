# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Impression des bons de livraison : lot et date de péremption par ligne, un ou plusieurs BL en un PDF."""

from __future__ import annotations

import base64
import json
import mimetypes

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, now_datetime

from log.api.distribution import DRIVER_ROLES, STOCK_ROLES, _require
from log.api.distribution_rules import collapse_delivery_notes_order
from log.order_print import _company_block, _customer_block, _date, _logo_data_uri, _strip_html, money, quantity
from log.utils.batches import batch_display

PRINT_ROLES = STOCK_ROLES | DRIVER_ROLES
TEMPLATE = "log/templates/print/delivery_note.html"
QR_FIELD = "custom_qr_image"
MAX_NOTES = 100
ROUTE_DOCTYPE = "Livraison"


def _file_data_uri(file_url) -> str:
	"""Image jointe intégrée au HTML : wkhtmltopdf n'a pas à la télécharger (fichiers privés compris)."""
	if not file_url:
		return ""
	name = frappe.db.get_value("File", {"file_url": file_url}, "name")
	if not name:
		return ""
	try:
		content = frappe.get_doc("File", name).get_content()
	except Exception:
		return ""
	if isinstance(content, str):
		content = content.encode()
	mime = mimetypes.guess_type(file_url)[0] or "image/png"
	return f"data:{mime};base64," + base64.b64encode(content).decode()


def _status(doc) -> str:
	if cint(doc.docstatus) == 0:
		return "Brouillon"
	if cint(doc.docstatus) == 2:
		return "Annulé"
	return doc.get("custom_statut") or "Validé"


def _order_names(items) -> list[str]:
	return list(dict.fromkeys(row.against_sales_order for row in items if row.get("against_sales_order")))


def delivery_note_print_context(doc) -> dict:
	"""Données du bon de livraison ; exposé à Jinja pour le format d'impression du Desk."""
	if isinstance(doc, str):
		doc = frappe.get_doc("Delivery Note", doc)
	items = list(doc.get("items") or [])
	batches = batch_display(row.get("batch_no") for row in items)
	return {
		"logo": _logo_data_uri(),
		"qr": _file_data_uri(doc.get(QR_FIELD)),
		"company": _company_block(doc.company),
		"customer": _customer_block(doc),
		"note": {
			"name": doc.name,
			"date": _date(doc.posting_date),
			"delivery_date": _date(doc.get("custom_date_de_livraison")),
			"orders": _order_names(items),
			"driver": doc.get("custom_nom_livreur") or "",
			"status": _status(doc),
			"is_draft": cint(doc.docstatus) == 0,
			"is_cancelled": cint(doc.docstatus) == 2,
			"currency": doc.get("currency") or "DZD",
		},
		"has_batches": any(row.get("batch_no") for row in items),
		"lines": [
			{
				"idx": index,
				"item_code": row.item_code if cstr(row.item_code) != cstr(row.item_name) else "",
				"item_name": row.item_name or row.item_code,
				"batch_no": row.get("batch_no") or "",
				"expiry_date": _date((batches.get(row.get("batch_no")) or {}).get("expiry_date")),
				"expiry_soon": bool((batches.get(row.get("batch_no")) or {}).get("expiry_soon")),
				"qty": quantity(row.qty),
				"uom": row.uom,
				"rate": money(row.rate),
				"amount": money(row.amount),
			}
			for index, row in enumerate(items, start=1)
		],
		"totals": {
			"items": len(items),
			"qty": quantity(doc.total_qty),
			"net_total": money(doc.net_total),
			"taxes": [
				{"label": row.description or row.account_head, "amount": money(row.tax_amount)}
				for row in doc.get("taxes") or []
				if flt(row.tax_amount)
			],
			"grand_total": money(doc.get("rounded_total") or doc.grand_total),
		},
		"remarks": _strip_html(doc.get("instructions")),
		"printed_at": now_datetime().strftime("%d/%m/%Y %H:%M"),
	}


def render_delivery_notes_html(names: list[str]) -> str:
	pages = [delivery_note_print_context(frappe.get_doc("Delivery Note", name)) for name in names]
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
		frappe.throw(_("Sélectionnez au moins un bon de livraison."))
	if len(cleaned) > MAX_NOTES:
		frappe.throw(_("Impression limitée à {0} bons de livraison à la fois.").format(MAX_NOTES))
	missing = [name for name in cleaned if not frappe.db.exists("Delivery Note", name)]
	if missing:
		frappe.throw(_("Bon de livraison introuvable : {0}").format(", ".join(missing)))
	return cleaned


def route_delivery_note_names(route) -> list[str]:
	"""BL d'une tournée dans l'ordre des arrêts (BL d'un même client regroupés, comme dans l'app)."""
	if not frappe.db.exists(ROUTE_DOCTYPE, route):
		frappe.throw(_("Tournée introuvable : {0}").format(route))
	rows = frappe.get_all(
		"Livraison Bon de Livraison",
		filters={"parent": route, "parenttype": ROUTE_DOCTYPE},
		fields=["bon_de_livraison", "customer"],
		order_by="idx asc",
	)
	names = [row.bon_de_livraison for row in rows if row.bon_de_livraison and frappe.db.exists("Delivery Note", row.bon_de_livraison)]
	if not names:
		frappe.throw(_("La tournée {0} ne contient aucun bon de livraison.").format(route))
	customers = {row.bon_de_livraison: row.customer or "" for row in rows if row.bon_de_livraison}
	return collapse_delivery_notes_order(names, customers)


def route_delivery_notes_print_pages(route) -> list[dict]:
	"""Pages BL d'une tournée ; exposé à Jinja pour le format d'impression Desk de la Livraison."""
	name = route if isinstance(route, str) else route.name
	return [delivery_note_print_context(frappe.get_doc("Delivery Note", dn)) for dn in route_delivery_note_names(name)]


def _send_pdf(names: list[str], filename: str):
	from frappe.utils.pdf import get_pdf

	html = render_delivery_notes_html(names)
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
	frappe.local.response.filename = filename
	frappe.local.response.filecontent = pdf
	frappe.local.response.type = "pdf"


def _pdf_filename(names: list[str]) -> str:
	if len(names) == 1:
		return f"{names[0]}.pdf"
	return f"BL-{now_datetime().strftime('%Y%m%d-%H%M')}-{len(names)}.pdf"


@frappe.whitelist()
def download_delivery_notes_pdf(names):
	"""PDF (affiché dans le navigateur) d'un ou plusieurs bons de livraison, un BL par page."""
	_require(PRINT_ROLES)
	cleaned = _parse_names(names)
	_send_pdf(cleaned, _pdf_filename(cleaned))


@frappe.whitelist()
def download_route_delivery_notes_pdf(route):
	"""Tous les BL d'une tournée en un PDF, dans l'ordre de passage."""
	_require(PRINT_ROLES)
	route = cstr(route).strip()
	_send_pdf(route_delivery_note_names(route), f"BL-{route}.pdf")
