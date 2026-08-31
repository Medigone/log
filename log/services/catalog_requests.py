# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

from __future__ import annotations

import base64
import binascii
import os
from typing import Any

import frappe
from frappe import _
from frappe.desk.doctype.notification_log.notification_log import enqueue_create_notification
from frappe.utils import cint, cstr, flt, strip_html

DOCTYPE = "Demande Hors Catalogue"
CHILD_DOCTYPE = "Ligne Demande Hors Catalogue"
MAX_OPEN_REQUESTS = 10
MAX_LINES = 20
MAX_DESIGNATION = 140
MAX_PHOTO_BYTES = 2 * 1024 * 1024
PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
CONVERTIBLE_STATUSES = frozenset({"Ouverte", "En cours"})
DESK_ROLES = frozenset({"Responsable", "System Manager"})
_ITEM_COUNT_SQL = (
	"(select count(*) from `tabLigne Demande Hors Catalogue` where parent=`tabDemande Hors Catalogue`.name)"
)
REQUEST_SORT_CLAUSES = {
	"date_desc": "creation desc, name desc",
	"date_asc": "creation asc, name asc",
	"delivery_desc": "date_livraison_souhaitee desc, creation desc",
	"delivery_asc": "date_livraison_souhaitee asc, creation asc",
	"qty_desc": f"{_ITEM_COUNT_SQL} desc, creation desc",
	"qty_asc": f"{_ITEM_COUNT_SQL} asc, creation asc",
}


def _clean_text(value: Any, *, max_length: int | None = None) -> str:
	text = strip_html(cstr(value)).strip()
	if max_length:
		return text[:max_length]
	return text


def _decode_photo(data: str) -> bytes:
	if not isinstance(data, str) or not data.strip():
		frappe.throw(_("La photo est invalide."))
	encoded = data.split(",", 1)[1] if "," in data else data
	try:
		content = base64.b64decode(encoded, validate=True)
	except (ValueError, binascii.Error):
		frappe.throw(_("La photo est invalide."))
	if not content:
		frappe.throw(_("La photo est invalide."))
	if len(content) > MAX_PHOTO_BYTES:
		frappe.throw(_("La photo dépasse la taille maximale de 2 Mo."))
	return content


def _photo_filename(filename: str) -> str:
	name = os.path.basename(cstr(filename).strip()) or "photo-demande.jpg"
	ext = os.path.splitext(name)[1].lower()
	if ext not in PHOTO_EXTENSIONS:
		frappe.throw(_("Le format de photo n'est pas pris en charge."))
	return name


def _assert_desk_manager():
	roles = set(frappe.get_roles())
	if not roles.intersection(DESK_ROLES):
		frappe.throw(_("Vous n'êtes pas autorisé à traiter cette demande."), frappe.PermissionError)


def owned_request(name: str, customer: str):
	if not name or not frappe.db.exists(DOCTYPE, name):
		frappe.throw(_("Demande introuvable."), frappe.DoesNotExistError)
	doc = frappe.get_doc(DOCTYPE, name)
	if doc.client != customer:
		frappe.throw(_("Vous n'êtes pas autorisé à consulter cette demande."), frappe.PermissionError)
	return doc


def desk_request(name: str):
	_assert_desk_manager()
	if not name or not frappe.db.exists(DOCTYPE, name):
		frappe.throw(_("Demande introuvable."), frappe.DoesNotExistError)
	doc = frappe.get_doc(DOCTYPE, name)
	if not frappe.has_permission(DOCTYPE, "write", doc):
		frappe.throw(_("Vous n'êtes pas autorisé à traiter cette demande."), frappe.PermissionError)
	return doc


def _open_request_count(customer: str) -> int:
	return cint(
		frappe.db.count(DOCTYPE, {"client": customer, "statut": "Ouverte"})
	)


def _normalise_line(raw: Any) -> dict[str, Any]:
	if not isinstance(raw, dict):
		frappe.throw(_("Une ligne de la demande est invalide."))
	designation = _clean_text(raw.get("designation") or raw.get("itemName"), max_length=MAX_DESIGNATION)
	quantity = flt(raw.get("quantity") or raw.get("quantite") or raw.get("qty"))
	if not designation:
		frappe.throw(_("La désignation est obligatoire."))
	if quantity <= 0 or quantity > 100000:
		frappe.throw(_("Les quantités de la demande sont invalides."))
	photo = raw.get("photo")
	photo_payload = None
	if photo:
		if not isinstance(photo, dict):
			frappe.throw(_("La photo est invalide."))
		photo_payload = {
			"filename": _photo_filename(cstr(photo.get("filename"))),
			"content": _decode_photo(cstr(photo.get("imageData") or photo.get("content"))),
		}
	return {
		"designation": designation,
		"quantite": quantity,
		"reference": _clean_text(raw.get("reference"), max_length=140),
		"notes": _clean_text(raw.get("notes"), max_length=1000),
		"photo": photo_payload,
	}


def _normalise_lines(raw_lines: Any) -> list[dict[str, Any]]:
	if isinstance(raw_lines, str):
		import json

		try:
			raw_lines = json.loads(raw_lines)
		except (TypeError, ValueError):
			frappe.throw(_("Les articles de la demande sont invalides."))
	if not isinstance(raw_lines, list) or not raw_lines:
		frappe.throw(_("Ajoutez au moins un article à la demande."))
	if len(raw_lines) > MAX_LINES:
		frappe.throw(_("Une demande ne peut pas contenir plus de 20 articles."))
	return [_normalise_line(row) for row in raw_lines]


def _attach_photos(doc, lines: list[dict[str, Any]]):
	changed = False
	for row, payload in zip(doc.articles, lines, strict=True):
		photo = payload.get("photo")
		if not photo:
			continue
		file_doc = frappe.get_doc(
			{
				"doctype": "File",
				"file_name": photo["filename"],
				"attached_to_doctype": CHILD_DOCTYPE,
				"attached_to_name": row.name,
				"attached_to_field": "photo",
				"content": photo["content"],
				"is_private": 0,
			}
		)
		file_doc.insert(ignore_permissions=True)
		row.photo = file_doc.file_url
		changed = True
	if changed:
		doc.flags.ignore_permissions = True
		doc.save(ignore_permissions=True)


def _notify_responsibles(doc):
	users = frappe.get_all(
		"Has Role",
		filters={"role": "Responsable", "parenttype": "User"},
		pluck="parent",
		distinct=True,
	)
	if not users:
		return
	users = frappe.get_all("User", filters={"name": ["in", users], "enabled": 1}, pluck="name")
	if not users:
		return
	enqueue_create_notification(
		users,
		{
			"type": "Alert",
			"title": _("Nouvelle demande hors catalogue"),
			"description": _("La demande {0} attend un traitement interne.").format(doc.name),
			"subject": _("Nouvelle demande hors catalogue {0}").format(doc.name),
			"document_type": DOCTYPE,
			"document_name": doc.name,
			"from_user": frappe.session.user,
			"link": f"/app/demande-hors-catalogue/{doc.name}",
		},
		dedupe_on=["type", "document_type", "document_name"],
	)


def serialize_request(doc, *, include_items: bool = False) -> dict[str, Any]:
	items = doc.get("articles") or []
	payload = {
		"name": doc.name,
		"status": doc.statut,
		"customer": doc.client,
		"deliveryDate": cstr(doc.date_livraison_souhaitee),
		"comment": doc.commentaire_client,
		"refusalReason": doc.motif_refus,
		"orderId": doc.commande,
		"modified": cstr(doc.modified),
		"creation": cstr(doc.creation),
		"itemCount": len(items),
		"canCancel": doc.statut == "Ouverte",
	}
	if include_items:
		payload["items"] = [
			{
				"name": row.name,
				"designation": row.designation,
				"quantity": flt(row.quantite),
				"reference": row.reference,
				"notes": row.notes,
				"photo": row.photo,
				"itemCode": row.article,
			}
			for row in items
		]
	return payload


def create_request(customer: str, portal_user: str, data: dict[str, Any]) -> dict[str, Any]:
	from log.api.client_portal import _validate_delivery_date

	if _open_request_count(customer) >= MAX_OPEN_REQUESTS:
		frappe.throw(_("Vous avez déjà trop de demandes ouvertes. Attendez leur traitement."))
	lines = _normalise_lines(data.get("items") or data.get("articles"))
	delivery_date = _validate_delivery_date(data.get("deliveryDate") or data.get("date_livraison_souhaitee"))
	doc = frappe.new_doc(DOCTYPE)
	doc.flags.ignore_permissions = True
	doc.client = customer
	doc.utilisateur_portail = portal_user
	doc.statut = "Ouverte"
	doc.date_livraison_souhaitee = delivery_date
	doc.commentaire_client = _clean_text(data.get("comment") or data.get("commentaire_client"), max_length=1000)
	for line in lines:
		doc.append(
			"articles",
			{
				"designation": line["designation"],
				"quantite": line["quantite"],
				"reference": line["reference"] or None,
				"notes": line["notes"] or None,
			},
		)
	doc.insert(ignore_permissions=True)
	doc.reload()
	_attach_photos(doc, lines)
	_notify_responsibles(doc)
	return serialize_request(doc, include_items=True)


def _iso_day(value: Any) -> str:
	text = cstr(value).strip()[:10]
	if len(text) == 10 and text[4] == "-" and text[7] == "-":
		return text
	return ""


def _apply_creation_range(filters: dict[str, Any], from_date: Any, to_date: Any) -> None:
	start = _iso_day(from_date)
	end = _iso_day(to_date)
	if start and end and start > end:
		start, end = end, start
	if start and end:
		filters["creation"] = ["between", [start, f"{end} 23:59:59"]]
	elif start:
		filters["creation"] = [">=", start]
	elif end:
		filters["creation"] = ["<=", f"{end} 23:59:59"]


def _request_sort_clause(order_by: Any = None) -> str:
	key = cstr(order_by).strip() or "date_desc"
	return REQUEST_SORT_CLAUSES.get(key, REQUEST_SORT_CLAUSES["date_desc"])


def list_requests(
	customer: str,
	*,
	page: int,
	page_length: int,
	status: str | None = None,
	search: str | None = None,
	from_date: str | None = None,
	to_date: str | None = None,
	order_by: str | None = None,
) -> dict[str, Any]:
	filters: dict[str, Any] = {"client": customer}
	label = cstr(status).strip()
	if label and label != "all":
		filters["statut"] = label
	_apply_creation_range(filters, from_date, to_date)
	term = cstr(search).strip()
	or_filters = [["name", "like", f"%{term}%"]] if term else None
	rows = frappe.get_all(
		DOCTYPE,
		filters=filters,
		or_filters=or_filters,
		fields=["name"],
		order_by=_request_sort_clause(order_by),
		limit_start=(page - 1) * page_length,
		limit_page_length=page_length + 1,
	)
	has_next = len(rows) > page_length
	items = [serialize_request(frappe.get_doc(DOCTYPE, row.name)) for row in rows[:page_length]]
	return {"items": items, "page": page, "pageLength": page_length, "hasNext": has_next}


def cancel_request(customer: str, name: str) -> dict[str, Any]:
	doc = owned_request(name, customer)
	if doc.statut != "Ouverte":
		frappe.throw(_("Cette demande n'est plus annulable."))
	doc_name = doc.name
	frappe.delete_doc(DOCTYPE, doc_name, ignore_permissions=True)
	return {"success": True, "name": doc_name}


def _mapped_order_lines(doc) -> list[dict[str, Any]]:
	rows = doc.get("articles") or []
	if not rows:
		frappe.throw(_("Ajoutez au moins un article à la demande."))
	missing = [row.designation for row in rows if not row.article]
	if missing:
		frappe.throw(_("Associez un article ERPNext à chaque ligne avant de créer la commande."))
	codes = [row.article for row in rows]
	items = {
		row.name: row
		for row in frappe.get_all(
			"Item",
			filters={"name": ["in", codes]},
			fields=["name", "stock_uom", "disabled", "is_sales_item"],
		)
	}
	lines = []
	for row in rows:
		item = items.get(row.article)
		if not item:
			frappe.throw(_("L'article {0} est introuvable.").format(row.article))
		if cint(item.disabled) or not cint(item.is_sales_item):
			frappe.throw(_("L'article {0} n'est pas vendable.").format(row.article))
		lines.append({"item_code": row.article, "qty": flt(row.quantite), "uom": item.stock_uom})
	return lines


def create_sales_order(name: str) -> dict[str, Any]:
	from log.api.client_portal import PORTAL_ORDER_SOURCE, _new_sales_order, _portal_order_write, _serialize_order

	doc = desk_request(name)
	if doc.statut not in CONVERTIBLE_STATUSES:
		frappe.throw(_("Cette demande ne peut plus être convertie en commande."))
	if doc.commande:
		frappe.throw(_("Une commande est déjà liée à cette demande."))
	lines = _mapped_order_lines(doc)
	delivery_date = cstr(doc.date_livraison_souhaitee)
	with _portal_order_write([line["item_code"] for line in lines]):
		order = _new_sales_order(
			doc.client,
			lines,
			delivery_date,
			portal_user=doc.utilisateur_portail or frappe.session.user,
		)
		if order.meta.has_field("custom_demande_hors_catalogue"):
			order.custom_demande_hors_catalogue = doc.name
		if order.meta.has_field("custom_origine_commande"):
			order.custom_origine_commande = PORTAL_ORDER_SOURCE
		order.insert(ignore_permissions=True)
	doc.flags.ignore_permissions = True
	doc.commande = order.name
	doc.statut = "Commande créée"
	doc.save(ignore_permissions=True)
	return {
		"request": serialize_request(doc, include_items=True),
		"order": _serialize_order(order, include_items=True),
	}


def refuse_request(name: str, reason: str) -> dict[str, Any]:
	doc = desk_request(name)
	if doc.statut not in CONVERTIBLE_STATUSES:
		frappe.throw(_("Cette demande ne peut plus être refusée."))
	motif = _clean_text(reason, max_length=1000)
	if not motif:
		frappe.throw(_("Le motif de refus est obligatoire."))
	doc.flags.ignore_permissions = True
	doc.motif_refus = motif
	doc.statut = "Refusée"
	doc.save(ignore_permissions=True)
	return serialize_request(doc, include_items=True)
