# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Impression des commandes client : bon de commande sobre, une ou plusieurs commandes en un PDF."""

from __future__ import annotations

import base64
import json
import re
from functools import lru_cache

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, format_date, now_datetime

from log.api.distribution import ORDER_ROLES, _require

PRINT_FORMAT = "Commande Client"
TEMPLATE = "log/templates/print/sales_order.html"
LOGO_PATH = ("public", "images", "logo_mp_print.png")
MAX_ORDERS = 100
NBSP = " "

STATUS_LABELS = {
	"To Deliver and Bill": "À livrer",
	"To Deliver": "À livrer",
	"To Bill": "Livrée",
	"Completed": "Terminée",
	"Closed": "Clôturée",
	"On Hold": "En attente",
	"Cancelled": "Annulée",
}

CUSTOMER_IDS = (
	("custom_nº_rc", "RC"),
	("custom_nº_nif", "NIF"),
	("custom_nº_nis", "NIS"),
	("custom_nº_ai", "AI"),
)


# --- Mise en forme -----------------------------------------------------------


def money(value, precision: int = 2) -> str:
	"""1234.5 → « 1 234,50 » (séparateurs français, espaces insécables)."""
	text = f"{flt(value):,.{precision}f}"
	return text.replace(",", NBSP).replace(".", ",")


def quantity(value) -> str:
	text = f"{flt(value):,.3f}".rstrip("0").rstrip(".")
	return text.replace(",", NBSP).replace(".", ",")


def percent(value) -> str:
	return f"{quantity(value)}{NBSP}%" if flt(value) else ""


def _date(value) -> str:
	return format_date(value, "dd/mm/yyyy") if value else ""


def _strip_html(value) -> list[str]:
	text = re.sub(r"<br\s*/?>", "\n", cstr(value), flags=re.I)
	text = re.sub(r"<[^>]+>", "", text)
	return [line.strip() for line in text.splitlines() if line.strip()]


@lru_cache(maxsize=1)
def _logo_data_uri() -> str:
	"""Logo intégré au HTML : wkhtmltopdf n'a pas à le télécharger."""
	path = frappe.get_app_path("log", *LOGO_PATH)
	try:
		with open(path, "rb") as handle:
			return "data:image/png;base64," + base64.b64encode(handle.read()).decode()
	except OSError:
		return ""


# --- Contexte d'impression ---------------------------------------------------


def _company_block(company: str) -> dict:
	data = frappe.db.get_value("Company", company, ["company_name", "tax_id", "phone_no", "email", "website"], as_dict=True) or {}
	address = frappe.db.sql(
		"""
		select a.address_line1, a.address_line2, a.city, a.phone, a.email_id
		from `tabAddress` a
		inner join `tabDynamic Link` dl on dl.parent = a.name and dl.parenttype = 'Address'
		where dl.link_doctype = 'Company' and dl.link_name = %s and a.disabled = 0
		order by a.is_primary_address desc, a.modified desc
		limit 1
		""",
		company,
		as_dict=True,
	)
	address = address[0] if address else {}
	lines = [cstr(address.get(field)).strip() for field in ("address_line1", "address_line2", "city")]
	contacts = [cstr(address.get("phone") or data.get("phone_no")).strip(), cstr(address.get("email_id") or data.get("email")).strip()]
	return {
		"name": data.get("company_name") or company,
		"lines": [line for line in lines if line],
		"contacts": [value for value in contacts if value],
		"tax_id": data.get("tax_id"),
	}


def _customer_block(doc) -> dict:
	fields = ["customer_name", "customer_group", "mobile_no"]
	for field in ("custom_téléphone", "custom_commune", "custom_wilaya", *(name for name, _label in CUSTOMER_IDS)):
		if frappe.db.has_column("Customer", field):
			fields.append(field)
	data = frappe.db.get_value("Customer", doc.customer, fields, as_dict=True) or {}
	commune = data.get("custom_commune") or doc.get("custom_commune")
	commune_name = frappe.db.get_value("Commune", commune, "nom") if commune and frappe.db.exists("DocType", "Commune") else None
	place = ", ".join(dict.fromkeys(value for value in (commune_name, data.get("custom_wilaya") or doc.get("custom_wilaya")) if value))
	phone = cstr(data.get("custom_téléphone") or data.get("mobile_no") or doc.get("contact_mobile")).strip()
	return {
		"name": data.get("customer_name") or doc.customer_name or doc.customer,
		"code": doc.customer,
		"group": data.get("customer_group"),
		"address": _strip_html(doc.get("address_display")),
		"place": place,
		"phone": phone,
		"ids": [(label, cstr(data.get(field)).strip()) for field, label in CUSTOMER_IDS if cstr(data.get(field)).strip()],
	}


def _status(doc) -> str:
	if cint(doc.docstatus) == 0:
		return "Brouillon"
	if cint(doc.docstatus) == 2:
		return "Annulée"
	per_delivered = flt(doc.get("per_delivered"))
	if doc.status not in ("Closed", "On Hold") and 0 < per_delivered < 100:
		return "Partiellement livrée"
	if doc.status == "To Bill":
		return "Livrée"
	return STATUS_LABELS.get(doc.status, doc.status or "Validée")


def order_print_context(doc) -> dict:
	"""Données du bon de commande ; exposé à Jinja pour le format d'impression du Desk."""
	if isinstance(doc, str):
		doc = frappe.get_doc("Sales Order", doc)
	owner = frappe.db.get_value("User", doc.owner, "full_name") if doc.get("owner") else None
	origin = cstr(doc.get("custom_origine_commande")) or "Interne"
	from log.order_entry_ops import _line_tax_rates

	items = list(doc.get("items") or [])
	has_discount = any(flt(row.discount_percentage) for row in items)
	line_vat = [sum(rates.values()) for rates in _line_tax_rates(doc)]
	return {
		"logo": _logo_data_uri(),
		"company": _company_block(doc.company),
		"customer": _customer_block(doc),
		"order": {
			"name": doc.name,
			"date": _date(doc.transaction_date),
			"delivery_date": _date(doc.delivery_date),
			"status": _status(doc),
			"is_draft": cint(doc.docstatus) == 0,
			"is_cancelled": cint(doc.docstatus) == 2,
			"owner": owner if origin != "Portail client" else None,
			"currency": doc.get("currency") or "DZD",
		},
		"has_discount": has_discount,
		"lines": [
			{
				"idx": index,
				"item_code": row.item_code if cstr(row.item_code) != cstr(row.item_name) else "",
				"item_name": row.item_name or row.item_code,
				"qty": quantity(row.qty),
				"uom": row.uom,
				"price": money(row.price_list_rate or row.rate),
				"discount": percent(row.discount_percentage),
				"rate": money(row.rate),
				"amount": money(row.amount),
				"vat": percent(vat) if vat else "Exo.",
			}
			for index, (row, vat) in enumerate(zip(items, line_vat), start=1)
		],
		"totals": {
			"items": len(items),
			"qty": quantity(doc.total_qty),
			"total": money(doc.total),
			"discount": money(doc.discount_amount) if flt(doc.discount_amount) else None,
			"discount_label": percent(doc.additional_discount_percentage),
			"net_total": money(doc.net_total),
			"taxes": [
				{"label": row.description or row.account_head, "amount": money(row.tax_amount)}
				for row in doc.get("taxes") or []
				if flt(row.tax_amount)
			],
			"rounding": money(doc.rounding_adjustment) if flt(doc.get("rounding_adjustment")) else None,
			"grand_total": money(doc.get("rounded_total") or doc.grand_total),
			"in_words": cstr(doc.get("in_words")).replace("DZD ", "").strip(),
		},
		"schedule": [
			{
				"due_date": _date(row.due_date),
				"portion": percent(row.invoice_portion),
				"amount": money(row.payment_amount),
				"mode": row.get("mode_of_payment") or "",
			}
			for row in doc.get("payment_schedule") or []
		],
		"terms": _strip_html(doc.get("terms")),
		"printed_at": now_datetime().strftime("%d/%m/%Y %H:%M"),
	}


# --- Rendu & PDF -------------------------------------------------------------


def render_orders_html(names: list[str]) -> str:
	pages = [order_print_context(frappe.get_doc("Sales Order", name)) for name in names]
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
		frappe.throw(_("Sélectionnez au moins une commande."))
	if len(cleaned) > MAX_ORDERS:
		frappe.throw(_("Impression limitée à {0} commandes à la fois.").format(MAX_ORDERS))
	missing = [name for name in cleaned if not frappe.db.exists("Sales Order", name)]
	if missing:
		frappe.throw(_("Commande introuvable : {0}").format(", ".join(missing)))
	return cleaned


def _pdf_filename(names: list[str]) -> str:
	if len(names) == 1:
		return f"{names[0]}.pdf"
	return f"Commandes-{now_datetime().strftime('%Y%m%d-%H%M')}-{len(names)}.pdf"


@frappe.whitelist()
def download_orders_pdf(names):
	"""PDF (affiché dans le navigateur) d'une ou plusieurs commandes, une commande par page."""
	_require(ORDER_ROLES)
	from frappe.utils.pdf import get_pdf

	cleaned = _parse_names(names)
	html = render_orders_html(cleaned)
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
