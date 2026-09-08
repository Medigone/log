"""API sécurisée du portail client IntraPro."""

from __future__ import annotations

import base64
import binascii
import json
import os
from contextlib import contextmanager
from typing import Any

import frappe
from frappe import _
from frappe.core.doctype.user.user import update_password
from frappe.desk.doctype.notification_log.notification_log import enqueue_create_notification
from frappe.utils import cint, cstr, flt, getdate, now_datetime, today

from log.api.distribution_rules import parse_gps_value
from log.compat import desk_form_path


MAX_GPS_ACCURACY_METERS = 50
MAX_PAGE_LENGTH = 50
MAX_CUSTOMER_IMAGE_BYTES = 2 * 1024 * 1024
CUSTOMER_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
PORTAL_ORDER_SOURCE = "Portail client"
INTERNAL_ORDER_SOURCE = "Interne"
PORTAL_ORDER_SOURCES = frozenset({PORTAL_ORDER_SOURCE, INTERNAL_ORDER_SOURCE})
PASSWORD_CHANGE_FIELD = "custom_portal_password_change_required"
STORE_VISIBLE_FIELD = "custom_afficher_dans_store"
STORE_SHOW_PRICE_FIELD = "custom_afficher_prix_store"
ORDER_SORT_CLAUSES = {
	"date_desc": "transaction_date desc, creation desc",
	"date_asc": "transaction_date asc, creation asc",
	"delivery_desc": "delivery_date desc, transaction_date desc",
	"delivery_asc": "delivery_date asc, transaction_date asc",
	"amount_desc": "grand_total desc, transaction_date desc",
	"amount_asc": "grand_total asc, transaction_date asc",
}
DELIVERY_SORT_CLAUSES = {
	"date_desc": "posting_date desc, creation desc",
	"date_asc": "posting_date asc, creation asc",
	"amount_desc": "grand_total desc, posting_date desc",
	"amount_asc": "grand_total asc, posting_date asc",
	"qty_desc": "total_qty desc, posting_date desc",
	"qty_asc": "total_qty asc, posting_date asc",
}
CATALOG_SORT_CLAUSES = {
	"relevance": "item_name asc, name asc",
	"name_asc": "item_name asc, name asc",
	"name_desc": "item_name desc, name desc",
	"recent": "creation desc, item_name asc",
}
_CLOSED_ORDER_STATUSES = ["Closed", "Clôturé"]
_HELD_ORDER_STATUSES = ["On Hold", "En pause"]
_BLOCKED_PROGRESS_STATUSES = _CLOSED_ORDER_STATUSES + _HELD_ORDER_STATUSES


def _payload(value: Any) -> dict[str, Any]:
	if isinstance(value, str):
		try:
			value = json.loads(value)
		except (TypeError, ValueError):
			frappe.throw(_("Le contenu de la requête est invalide."))
	if not isinstance(value, dict):
		frappe.throw(_("Le contenu de la requête est invalide."))
	return value


def _page_args(page: Any = 1, page_length: Any = 20) -> tuple[int, int, int]:
	page_number = max(cint(page), 1)
	length = min(max(cint(page_length), 1), MAX_PAGE_LENGTH)
	return page_number, length, (page_number - 1) * length


def _current_portal_customer() -> tuple[str, frappe._dict]:
	user = frappe.session.user
	if not user or user == "Guest":
		frappe.throw(_("Authentification requise."), frappe.PermissionError)

	user_fields = ["name", "enabled", "user_type", "full_name", "email", "mobile_no"]
	if frappe.db.has_column("User", PASSWORD_CHANGE_FIELD):
		user_fields.append(PASSWORD_CHANGE_FIELD)
	user_row = frappe.db.get_value("User", user, user_fields, as_dict=True)
	if not user_row or not user_row.enabled or user_row.user_type != "Website User":
		frappe.throw(_("Ce compte n'est pas autorisé à utiliser le portail client."), frappe.PermissionError)
	if "Customer" not in set(frappe.get_roles(user)):
		frappe.throw(_("Le rôle Customer est requis pour accéder au portail."), frappe.PermissionError)

	parents = frappe.get_all(
		"Portal User",
		filters={"user": user, "parenttype": "Customer"},
		pluck="parent",
		distinct=True,
	)
	customers = [
		name for name in parents if name and not cint(frappe.db.get_value("Customer", name, "disabled"))
	]
	if len(customers) != 1:
		frappe.throw(
			_("Votre compte doit être rattaché à une seule fiche client active. Contactez votre responsable."),
			frappe.PermissionError,
		)
	return customers[0], user_row


def _customer_data(customer: str) -> frappe._dict:
	fields = [
		"name",
		"customer_name",
		"default_currency",
		"default_price_list",
		"customer_primary_address",
		"primary_address",
		"mobile_no",
		"email_id",
	]
	if frappe.db.has_column("Customer", "image"):
		fields.append("image")
	if frappe.db.has_column("Customer", "custom_gps"):
		fields.append("custom_gps")
	if frappe.db.has_column("Customer", "custom_gps_precision_m"):
		fields.append("custom_gps_precision_m")
	if frappe.db.has_column("Customer", "custom_gps_capture_date"):
		fields.append("custom_gps_capture_date")
	if frappe.db.has_column("Customer", "custom_commune"):
		fields.append("custom_commune")
	if frappe.db.has_column("Customer", "custom_wilaya"):
		fields.append("custom_wilaya")
	return frappe.db.get_value("Customer", customer, fields, as_dict=True) or frappe._dict()


def _commune_label(commune: str | None) -> str | None:
	if not commune:
		return None
	return cstr(frappe.db.get_value("Commune", commune, "nom")) or commune


def _portal_customer_payload(customer: frappe._dict, user: frappe._dict | None = None) -> dict[str, Any]:
	commune = customer.get("custom_commune")
	wilaya = customer.get("custom_wilaya")
	user_email = cstr((user or {}).get("email") or (user or {}).get("name") or "")
	user_phone = (user or {}).get("mobile_no") or (user or {}).get("phone")
	return {
		"name": customer.name,
		"customerName": customer.customer_name or customer.name,
		"phone": customer.mobile_no or user_phone,
		"email": customer.email_id or user_email or None,
		"commune": commune,
		"communeName": _commune_label(commune),
		"wilaya": wilaya,
		"wilayaName": wilaya,
		"image": customer.get("image"),
	}


def _company() -> str:
	from erpnext import get_default_company

	company = get_default_company()
	if not company:
		frappe.throw(_("Aucune société par défaut n'est configurée."))
	return company


def _currency(customer: frappe._dict, company: str) -> str:
	return customer.get("default_currency") or frappe.get_cached_value("Company", company, "default_currency")


def _item_has_column(fieldname: str) -> bool:
	has_column = getattr(getattr(frappe, "db", None), "has_column", None)
	return bool(has_column and has_column("Item", fieldname))


def _catalog_item_filters() -> dict[str, Any]:
	filters: dict[str, Any] = {"disabled": 0, "is_sales_item": 1, "has_variants": 0}
	if _item_has_column(STORE_VISIBLE_FIELD):
		filters[STORE_VISIBLE_FIELD] = 1
	return filters


def _shows_store_price(row) -> bool:
	if not _item_has_column(STORE_SHOW_PRICE_FIELD):
		return True
	return bool(cint(row.get(STORE_SHOW_PRICE_FIELD)))


def _normalise_lines(lines: Any) -> list[dict[str, Any]]:
	if isinstance(lines, str):
		try:
			lines = json.loads(lines)
		except (TypeError, ValueError):
			frappe.throw(_("Le panier est invalide."))
	if not isinstance(lines, list) or not lines:
		frappe.throw(_("Votre panier est vide."))

	grouped: dict[str, float] = {}
	for raw in lines:
		if not isinstance(raw, dict):
			frappe.throw(_("Une ligne du panier est invalide."))
		item_code = cstr(raw.get("itemCode") or raw.get("item_code")).strip()
		quantity = flt(raw.get("quantity") or raw.get("qty"))
		if not item_code or quantity <= 0 or quantity > 100000:
			frappe.throw(_("Les articles et quantités du panier sont invalides."))
		grouped[item_code] = grouped.get(item_code, 0) + quantity

	items = frappe.get_all(
		"Item",
		filters={"name": ["in", list(grouped)], **_catalog_item_filters()},
		fields=["name", "stock_uom"],
	)
	valid = {row.name: row for row in items}
	missing = [code for code in grouped if code not in valid]
	if missing:
		frappe.throw(_("Ces articles ne sont plus disponibles à la vente : {0}").format(", ".join(missing)))
	return _grouped_order_lines(grouped, valid, attribution_by_code=_line_attribution(lines, grouped))


def _line_attribution(raw_lines: list, grouped: dict[str, float]) -> dict[str, dict[str, str | None]]:
	attribution: dict[str, dict[str, str | None]] = {code: {"campaign": None, "placement": None} for code in grouped}
	if not isinstance(raw_lines, list):
		return attribution
	for raw in raw_lines:
		if not isinstance(raw, dict):
			continue
		item_code = cstr(raw.get("itemCode") or raw.get("item_code")).strip()
		if item_code not in attribution:
			continue
		campaign = cstr(raw.get("campaign")).strip() or None
		placement = cstr(raw.get("placement")).strip() or None
		if campaign or placement:
			attribution[item_code] = {"campaign": campaign, "placement": placement}
	return attribution


def _grouped_order_lines(grouped: dict[str, float], valid: dict, attribution_by_code: dict[str, dict[str, str | None]]):
	return [
		{
			"item_code": code,
			"qty": quantity,
			"uom": valid[code].stock_uom,
			"campaign": (attribution_by_code.get(code) or {}).get("campaign"),
			"placement": (attribution_by_code.get(code) or {}).get("placement"),
		}
		for code, quantity in grouped.items()
	]


def _validate_delivery_date(value: Any) -> str:
	if not value:
		frappe.throw(_("La date de livraison souhaitée est obligatoire."))
	requested = _iso_date(value)
	if requested is None:
		try:
			requested = getdate(value)
		except Exception:
			requested = None
	if not requested:
		frappe.throw(_("La date de livraison est invalide."))
	if requested < getdate(today()):
		frappe.throw(_("La date de livraison ne peut pas être antérieure à aujourd'hui."))
	return cstr(requested)


def _validate_coordinates(data: dict[str, Any]) -> tuple[float, float]:
	try:
		latitude = float(data.get("latitude"))
		longitude = float(data.get("longitude"))
	except (TypeError, ValueError):
		frappe.throw(_("La position GPS est invalide."))
	if not (-90 <= latitude <= 90 and -180 <= longitude <= 180) or (latitude == 0 and longitude == 0):
		frappe.throw(_("La position GPS est invalide."))
	return latitude, longitude


def _validate_gps(value: Any) -> dict[str, float]:
	data = _payload(value)
	latitude, longitude = _validate_coordinates(data)
	try:
		accuracy = float(data.get("accuracy"))
	except (TypeError, ValueError):
		frappe.throw(_("La position GPS est invalide."))
	if accuracy < 0 or accuracy > MAX_GPS_ACCURACY_METERS:
		frappe.throw(
			_("La géolocalisation doit avoir une précision de {0} m ou meilleure.").format(
				MAX_GPS_ACCURACY_METERS
			)
		)
	return {"latitude": latitude, "longitude": longitude, "accuracy": accuracy}


def _validate_map_gps(value: Any) -> dict[str, float]:
	data = value if isinstance(value, dict) else _payload(value)
	latitude, longitude = _validate_coordinates(data)
	accuracy = flt(data.get("accuracy"))
	if accuracy < 0:
		frappe.throw(_("La position GPS est invalide."))
	return {"latitude": latitude, "longitude": longitude, "accuracy": accuracy}


def _resolve_gps(payload: Any) -> dict[str, float]:
	data = _payload(payload)
	source = cstr(data.get("source") or "device").strip().lower()
	gps = data.get("gps") if isinstance(data.get("gps"), dict) else data
	if source == "map":
		return _validate_map_gps(gps)
	if source == "device":
		return _validate_gps(gps)
	frappe.throw(_("Le mode de géolocalisation est invalide."))


def _gps_context(customer: frappe._dict) -> dict[str, Any]:
	latitude, longitude = parse_gps_value(customer.get("custom_gps"))
	accuracy = flt(customer.get("custom_gps_precision_m"))
	return {
		"gpsConfigured": latitude is not None and longitude is not None,
		"gpsLatitude": latitude,
		"gpsLongitude": longitude,
		"gpsAccuracy": accuracy if latitude is not None else None,
		"gpsCapturedAt": cstr(customer.get("custom_gps_capture_date")) or None,
	}


def _customer_has_gps(customer: frappe._dict) -> bool:
	latitude, longitude = parse_gps_value(customer.get("custom_gps"))
	return latitude is not None and longitude is not None


def _save_customer_gps(customer: str, gps: dict[str, float]) -> str:
	coordinates = f"{gps['latitude']:.8f},{gps['longitude']:.8f}"
	values: dict[str, Any] = {"custom_gps": coordinates}
	optional = {
		"custom_gps_precision_m": gps["accuracy"],
		"custom_gps_capture_date": now_datetime(),
		"custom_gps_capture_user": frappe.session.user,
		"custom_gps_source_bl": None,
	}
	for fieldname, value in optional.items():
		if frappe.db.has_column("Customer", fieldname):
			values[fieldname] = value
	frappe.db.set_value("Customer", customer, values)
	return coordinates


@contextmanager
def _allow_item_details(item_codes: list[str]):
	docs = []
	for item_code in item_codes:
		doc = frappe.get_cached_doc("Item", item_code)
		docs.append((doc, bool(doc.flags.ignore_permissions)))
		doc.flags.ignore_permissions = True
	try:
		yield
	finally:
		for doc, previous in docs:
			doc.flags.ignore_permissions = previous


@contextmanager
def _ignore_permission_checks():
	"""ERPNext re-checks Account/Customer perms in validate(), even with insert(ignore_permissions=True)."""
	original = frappe.has_permission
	frappe.has_permission = lambda *args, **kwargs: True
	try:
		yield
	finally:
		frappe.has_permission = original


@contextmanager
def _portal_order_write(item_codes: list[str]):
	with _allow_item_details(item_codes), _ignore_permission_checks():
		yield


def _new_sales_order(
	customer: str,
	lines: list[dict[str, Any]],
	delivery_date: str,
	*,
	portal_user: str,
	coordinates: str | None = None,
	gps_accuracy: float | None = None,
	coupon_code: str | None = None,
):
	order = frappe.new_doc("Sales Order")
	order.flags.ignore_permissions = True
	order.customer = customer
	order.company = _company()
	order.order_type = "Sales"
	order.transaction_date = today()
	order.delivery_date = delivery_date
	if coupon_code and order.meta.has_field("coupon_code"):
		order.coupon_code = coupon_code
	if order.meta.has_field("custom_type"):
		order.custom_type = "BL"
	if order.meta.has_field("custom_origine_commande"):
		order.custom_origine_commande = PORTAL_ORDER_SOURCE
	if order.meta.has_field("custom_utilisateur_portail"):
		order.custom_utilisateur_portail = portal_user
	if gps_accuracy is not None and order.meta.has_field("custom_gps_precision_m"):
		order.custom_gps_precision_m = gps_accuracy
	if coordinates and order.meta.has_field("custom_coordonnées_gps"):
		order.set("custom_coordonnées_gps", coordinates)
	for line in lines:
		order.append(
			"items",
			{
				"item_code": line["item_code"],
				"qty": line["qty"],
				"uom": line["uom"],
				"delivery_date": delivery_date,
			},
		)
	order.set_missing_values()
	if coordinates and order.meta.has_field("custom_coordonnées_gps"):
		order.set("custom_coordonnées_gps", coordinates)
	order.calculate_taxes_and_totals()
	return order


def _item_totals_ttc(order) -> dict[str, float]:
	tax_by_item: dict[str, float] = {}
	for tax in order.get("taxes") or []:
		details = tax.get("item_wise_tax_detail")
		if not details:
			continue
		if isinstance(details, str):
			try:
				details = json.loads(details)
			except (TypeError, ValueError):
				continue
		for item_code, values in (details or {}).items():
			amount = values[1] if isinstance(values, (list, tuple)) and len(values) > 1 else 0
			tax_by_item[item_code] = tax_by_item.get(item_code, 0) + flt(amount)
	return {
		row.item_code: flt(row.net_amount) + tax_by_item.get(row.item_code, 0)
		for row in order.get("items") or []
	}


def _item_images(item_codes: list[str]) -> dict[str, str | None]:
	codes = [code for code in dict.fromkeys(item_codes) if code]
	if not codes:
		return {}
	rows = frappe.get_all(
		"Item",
		filters={"name": ["in", codes]},
		fields=["name", "image"],
		limit_page_length=len(codes),
	)
	return {row.name: row.image for row in rows}


def _preview(order) -> dict[str, Any]:
	line_totals = _item_totals_ttc(order)
	items = []
	images = _item_images([row.item_code for row in order.get("items") or []])
	for row in order.get("items") or []:
		line_total = line_totals.get(row.item_code, flt(row.amount))
		items.append(
			{
				"itemCode": row.item_code,
				"itemName": row.item_name,
				"quantity": flt(row.qty),
				"uom": row.uom,
				"unitPriceTtc": flt(line_total / row.qty) if flt(row.qty) else 0,
				"lineTotalTtc": flt(line_total),
				"image": images.get(row.item_code),
				"isFreeItem": bool(cint(row.get("is_free_item"))),
				"discountPercentage": flt(row.get("discount_percentage")),
				"pricingRule": row.get("pricing_rules"),
			}
		)
	applied_rules = []
	for rule in order.get("pricing_rules") or []:
		name = cstr(rule.get("pricing_rule"))
		if name and name not in applied_rules:
			applied_rules.append(name)
	return {
		"items": items,
		"totalQuantity": flt(order.total_qty),
		"totalTtc": flt(order.rounded_total or order.grand_total),
		"discountAmount": flt(order.discount_amount),
		"netTotal": flt(order.net_total),
		"currency": order.currency,
		"deliveryDate": cstr(order.delivery_date),
		"pricingRules": applied_rules,
		"couponCode": order.get("coupon_code"),
	}


TERMINAL_PORTAL_DELIVERY_STATUSES = frozenset(
	{"Livré", "Partiellement Livré", "Non Livré", "Annulé", "Retour"}
)


def _delivery_is_on_started_route(doc) -> bool:
	"""True seulement si le livreur a réellement démarré la tournée liée au BL."""
	route = cstr(doc.get("custom_tournee")).strip()
	if not route:
		return False
	try:
		return cstr(frappe.db.get_value("Livraison", route, "etat_planification")) == "En cours"
	except Exception:
		return False


def _in_progress_order_ids(customer: str) -> list[str]:
	"""Commandes dont un BL est sur une tournée déjà démarrée par le livreur."""
	if not customer or not frappe.db.exists("DocType", "Livraison"):
		return []
	try:
		rows = frappe.db.sql(
			"""
			select distinct dni.against_sales_order
			from `tabLivraison` l
			inner join `tabLivraison Bon de Livraison` stop
				on stop.parent = l.name and stop.parenttype = 'Livraison'
			inner join `tabDelivery Note` dn
				on dn.name = stop.bon_de_livraison
			inner join `tabDelivery Note Item` dni
				on dni.parent = dn.name
			where l.etat_planification = 'En cours'
				and ifnull(l.docstatus, 0) < 2
				and dn.customer = %s
				and ifnull(dn.docstatus, 0) < 2
				and ifnull(dni.against_sales_order, '') != ''
			order by dni.against_sales_order
			""",
			customer,
		)
	except Exception:
		frappe.log_error(title="Portail client : tournées en cours")
		return []
	return [cstr(row[0]) for row in rows or [] if row and row[0]]


def _in_progress_delivery_ids(customer: str) -> list[str]:
	"""Bons de livraison dont la tournée a déjà été démarrée par le livreur."""
	if not customer or not frappe.db.exists("DocType", "Livraison"):
		return []
	try:
		rows = frappe.db.sql(
			"""
			select distinct dn.name
			from `tabLivraison` l
			inner join `tabLivraison Bon de Livraison` stop
				on stop.parent = l.name and stop.parenttype = 'Livraison'
			inner join `tabDelivery Note` dn
				on dn.name = stop.bon_de_livraison
			where l.etat_planification = 'En cours'
				and ifnull(l.docstatus, 0) < 2
				and dn.customer = %s
				and ifnull(dn.docstatus, 0) < 2
			order by dn.name
			""",
			customer,
		)
	except Exception:
		frappe.log_error(title="Portail client : BL en cours")
		return []
	return [cstr(row[0]) for row in rows or [] if row and row[0]]


def _portal_order_status(order, *, in_progress: bool = False) -> str:
	"""Statut visible par le client : livraison uniquement, jamais la facturation."""
	raw = cstr(order.get("status")).strip().lower()
	docstatus = cint(order.get("docstatus"))
	if docstatus == 0 or raw == "draft":
		return "En attente de validation"
	if docstatus == 2 or raw in {"cancelled", "canceled"}:
		return "Annulé"
	if raw in {"closed", "clôturé"}:
		return "Clôturé"
	if raw in {"on hold", "en pause"}:
		return "En pause"
	delivered = flt(order.get("per_delivered"))
	if delivered >= 100:
		return "Livré"
	if in_progress:
		return "Livraison en cours"
	if delivered > 0:
		return "Partiellement Livré"
	return "À livrer"


def _iso_date(value: Any):
	text = cstr(value).strip()[:10]
	if not text or len(text) != 10 or text[4] != "-" or text[7] != "-":
		return None
	try:
		return getdate(text)
	except Exception:
		return None


def _apply_date_range(filters: dict[str, Any], field: str, from_date: Any, to_date: Any) -> None:
	start = _iso_date(from_date)
	end = _iso_date(to_date)
	if start and end and start > end:
		start, end = end, start
	if start and end:
		filters[field] = ["between", [start, end]]
	elif start:
		filters[field] = [">=", start]
	elif end:
		filters[field] = ["<=", end]


def _sort_clause(order_by: Any, clauses: dict[str, str], default_key: str) -> str:
	key = cstr(order_by).strip() or default_key
	return clauses.get(key, clauses[default_key])


def _order_sort_clause(order_by: Any = None) -> str:
	return _sort_clause(order_by, ORDER_SORT_CLAUSES, "date_desc")


def _order_status_filters(status: str, in_progress_ids: list[str]) -> dict[str, Any] | None:
	"""Filtres SQL alignés sur `_portal_order_status`. None = aucun résultat possible."""
	label = cstr(status).strip()
	if not label or label == "all":
		return {}
	if label == "En attente de validation":
		return {"docstatus": 0}
	if label == "Annulé":
		return {"docstatus": 2}
	if label == "Clôturé":
		return {"docstatus": 1, "status": ["in", _CLOSED_ORDER_STATUSES]}
	if label == "En pause":
		return {"docstatus": 1, "status": ["in", _HELD_ORDER_STATUSES]}
	if label == "Livré":
		return {
			"docstatus": 1,
			"per_delivered": [">=", 100],
			"status": ["not in", _BLOCKED_PROGRESS_STATUSES],
		}
	if label == "Livraison en cours":
		if not in_progress_ids:
			return None
		return {
			"docstatus": 1,
			"per_delivered": ["<", 100],
			"status": ["not in", _BLOCKED_PROGRESS_STATUSES],
			"name": ["in", in_progress_ids],
		}
	if label == "Partiellement Livré":
		filters: dict[str, Any] = {
			"docstatus": 1,
			"per_delivered": ["between", [0.0001, 99.9999]],
			"status": ["not in", _BLOCKED_PROGRESS_STATUSES],
		}
		if in_progress_ids:
			filters["name"] = ["not in", in_progress_ids]
		return filters
	if label == "À livrer":
		filters = {
			"docstatus": 1,
			"per_delivered": 0,
			"status": ["not in", _BLOCKED_PROGRESS_STATUSES],
		}
		if in_progress_ids:
			filters["name"] = ["not in", in_progress_ids]
		return filters
	return {}


def _order_list_filters(
	customer: str,
	*,
	search: Any = None,
	status: Any = None,
	source: Any = None,
	from_date: Any = None,
	to_date: Any = None,
	in_progress_ids: list[str] | None = None,
) -> tuple[dict[str, Any], list | None] | None:
	status_filters = _order_status_filters(cstr(status), list(in_progress_ids or []))
	if status_filters is None:
		return None
	filters: dict[str, Any] = {"customer": customer, **status_filters}
	origin = cstr(source).strip()
	if origin in PORTAL_ORDER_SOURCES and frappe.db.has_column("Sales Order", "custom_origine_commande"):
		if origin == INTERNAL_ORDER_SOURCE:
			# Desk laisse souvent le Select vide (option blanche en tête du champ).
			filters["custom_origine_commande"] = ["in", [INTERNAL_ORDER_SOURCE, ""]]
		else:
			filters["custom_origine_commande"] = origin
	_apply_date_range(filters, "transaction_date", from_date, to_date)
	term = cstr(search).strip()
	or_filters = [["name", "like", f"%{term}%"]] if term else None
	return filters, or_filters


def _delivery_sort_clause(order_by: Any = None) -> str:
	return _sort_clause(order_by, DELIVERY_SORT_CLAUSES, "date_desc")


def _delivery_status_filters(status: str, in_progress_ids: list[str]) -> dict[str, Any] | None:
	"""Filtres SQL alignés sur `_portal_delivery_status`. None = aucun résultat possible."""
	label = cstr(status).strip()
	if not label or label == "all":
		return {}
	if label == "Livraison en cours":
		if not in_progress_ids:
			return None
		return {"name": ["in", in_progress_ids]}
	if label == "Brouillon":
		filters: dict[str, Any] = {"docstatus": 0}
		if in_progress_ids:
			filters["name"] = ["not in", in_progress_ids]
		if frappe.db.has_column("Delivery Note", "custom_statut"):
			filters["custom_statut"] = ["in", [""]]
		return filters
	if label == "Annulé":
		if frappe.db.has_column("Delivery Note", "custom_statut"):
			return {"custom_statut": "Annulé"}
		return {"docstatus": 2}
	if label == "Clôturé":
		return {"docstatus": 1, "status": ["in", ["Closed", "Clôturé"]]}
	if label == "Retour":
		if frappe.db.has_column("Delivery Note", "custom_statut"):
			return {"custom_statut": "Retour"}
		return {"status": ["in", ["Return Issued", "Return"]]}
	if frappe.db.has_column("Delivery Note", "custom_statut"):
		filters = {"custom_statut": label}
		if label not in TERMINAL_PORTAL_DELIVERY_STATUSES and in_progress_ids:
			filters["name"] = ["not in", in_progress_ids]
		return filters
	if label == "Livré":
		return {"docstatus": 1, "status": ["in", ["Completed", "To Bill", "Closed"]]}
	if label == "Partiellement Livré":
		return {"status": ["in", ["Partly Delivered", "Partially Delivered"]]}
	if label == "Non Livré":
		return {"status": "Not Delivered"}
	return {}


def _delivery_search_or_filters(term: str) -> list | None:
	needle = cstr(term).strip()
	if not needle:
		return None
	or_filters: list = [["name", "like", f"%{needle}%"]]
	try:
		linked = frappe.db.sql_list(
			"""
			select distinct parent
			from `tabDelivery Note Item`
			where against_sales_order like %s
			""",
			f"%{needle}%",
		)
	except Exception:
		linked = []
	if linked:
		or_filters.append(["name", "in", linked])
	return or_filters


def _delivery_list_filters(
	customer: str,
	*,
	search: Any = None,
	status: Any = None,
	from_date: Any = None,
	to_date: Any = None,
	in_progress_ids: list[str] | None = None,
) -> tuple[dict[str, Any], list | None] | None:
	status_filters = _delivery_status_filters(cstr(status), list(in_progress_ids or []))
	if status_filters is None:
		return None
	filters: dict[str, Any] = {"customer": customer, **status_filters}
	_apply_date_range(filters, "posting_date", from_date, to_date)
	return filters, _delivery_search_or_filters(cstr(search))


def _portal_delivery_status(doc) -> str:
	custom = cstr(doc.get("custom_statut")).strip()
	if custom in TERMINAL_PORTAL_DELIVERY_STATUSES:
		return custom
	if _delivery_is_on_started_route(doc):
		return "Livraison en cours"
	if custom:
		return custom
	raw = cstr(doc.get("status")).strip().lower()
	docstatus = cint(doc.get("docstatus"))
	if docstatus == 0 or raw == "draft":
		return "Brouillon"
	if docstatus == 2 or raw in {"cancelled", "canceled"}:
		return "Annulé"
	if raw in {"closed", "clôturé"}:
		return "Clôturé"
	if raw in {"return", "return issued"}:
		return "Retour"
	if raw in {"not delivered"}:
		return "Non Livré"
	if raw in {"partly delivered", "partially delivered"}:
		return "Partiellement Livré"
	return "Livré"


def _with_line_delivery_progress(rows, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
	enriched = []
	for item, row in zip(items, rows or []):
		qty = flt(item.get("quantity"))
		delivered = flt(row.get("delivered_qty"))
		line_ttc = flt(item.get("lineTotalTtc"))
		updated = dict(item)
		updated["deliveredQuantity"] = delivered
		updated["remainingQuantity"] = max(qty - delivered, 0)
		updated["deliveredLineTotalTtc"] = flt(line_ttc * delivered / qty) if qty else 0.0
		enriched.append(updated)
	return enriched


def _order_delivered_quantity(order) -> float:
	return sum(flt(row.get("delivered_qty")) for row in order.get("items") or [])


def _linked_delivery_notes(order) -> list[dict[str, Any]]:
	"""Bons liés à la commande, y compris les brouillons encore en tournée."""
	order_name = cstr(order.get("name"))
	customer = cstr(order.get("customer"))
	if not order_name:
		return []
	names = frappe.db.sql_list(
		"""
		select parent
		from `tabDelivery Note Item`
		where against_sales_order = %s and docstatus < 2
		group by parent
		order by max(creation) desc
		""",
		order_name,
	)
	notes = []
	for name in names or []:
		doc = frappe.get_doc("Delivery Note", name)
		if customer and cstr(doc.customer) != customer:
			continue
		notes.append(_serialize_delivery_note(doc))
	return notes


def _serialize_order(order, include_items: bool = False, *, in_progress: bool = False) -> dict[str, Any]:
	delivered_quantity = _order_delivered_quantity(order)
	total_quantity = flt(order.total_qty)
	result = {
		"name": order.name,
		"transactionDate": cstr(order.transaction_date),
		"deliveryDate": cstr(order.delivery_date),
		"status": _portal_order_status(order, in_progress=in_progress),
		"docstatus": cint(order.docstatus),
		"totalQuantity": total_quantity,
		"deliveredQuantity": delivered_quantity,
		"remainingQuantity": max(total_quantity - delivered_quantity, 0),
		"totalTtc": flt(order.rounded_total or order.grand_total),
		"currency": order.currency,
		"modified": cstr(order.modified),
		"source": order.get("custom_origine_commande"),
		"canEdit": _can_edit_order(order),
	}
	if include_items:
		items = _with_line_delivery_progress(order.get("items") or [], _preview(order)["items"])
		deliveries = _linked_delivery_notes(order)
		from_notes = sum(flt(note.get("totalTtc")) for note in deliveries)
		from_lines = sum(flt(item.get("deliveredLineTotalTtc")) for item in items)
		result["items"] = items
		result["deliveries"] = deliveries
		result["deliveredTotalTtc"] = from_notes or from_lines
	return result


def _linked_sales_orders(doc) -> list[str]:
	return list(
		dict.fromkeys(
			cstr(row.get("against_sales_order"))
			for row in doc.get("items") or []
			if row.get("against_sales_order")
		)
	)


def _serialize_delivery_note(doc, include_items: bool = False) -> dict[str, Any]:
	result = {
		"name": doc.name,
		"postingDate": cstr(doc.posting_date),
		"deliveryDate": cstr(doc.get("custom_date_de_livraison") or doc.posting_date),
		"status": _portal_delivery_status(doc),
		"docstatus": cint(doc.docstatus),
		"totalQuantity": flt(doc.total_qty),
		"totalTtc": flt(doc.rounded_total or doc.grand_total),
		"currency": doc.currency,
		"salesOrders": _linked_sales_orders(doc),
	}
	if include_items:
		images = _item_images([row.item_code for row in doc.get("items") or []])
		result["items"] = [
			{
				"itemCode": row.item_code,
				"itemName": row.item_name,
				"quantity": flt(row.qty),
				"uom": row.uom,
				"image": images.get(row.item_code),
			}
			for row in doc.get("items") or []
		]
	return result


def _can_edit_order(order) -> bool:
	return cint(order.docstatus) == 0 and order.get("custom_origine_commande") == PORTAL_ORDER_SOURCE


def _owned_order(name: str, customer: str, *, editable: bool = False):
	if not name or not frappe.db.exists("Sales Order", name):
		frappe.throw(_("Commande introuvable."), frappe.DoesNotExistError)
	order = frappe.get_doc("Sales Order", name)
	if order.customer != customer:
		frappe.throw(_("Vous n'êtes pas autorisé à consulter cette commande."), frappe.PermissionError)
	if editable and not _can_edit_order(order):
		frappe.throw(_("Cette commande n'est plus modifiable depuis le portail."), frappe.PermissionError)
	return order


def _assert_modified(order, expected_modified: Any):
	if not expected_modified or cstr(order.modified) != cstr(expected_modified):
		frappe.throw(_("La commande a été modifiée. Actualisez la page avant de recommencer."))


def _notify_responsibles(order):
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
			"title": _("Nouvelle commande portail"),
			"description": _("La commande {0} attend une validation interne.").format(order.name),
			"subject": _("Nouvelle commande portail {0}").format(order.name),
			"document_type": "Sales Order",
			"document_name": order.name,
			"from_user": frappe.session.user,
			"link": desk_form_path("Sales Order", order.name),
		},
		dedupe_on=["type", "document_type", "document_name"],
	)


def _unread_notifications(customer: str, user: str) -> int:
	try:
		from log.services.portal_notifications import unread_count

		return unread_count(customer, user)
	except Exception:
		return 0


@frappe.whitelist()
def get_portal_context():
	customer_name, user = _current_portal_customer()
	customer = _customer_data(customer_name)
	company = _company()
	return {
		"user": {
			"name": user.name,
			"fullName": user.full_name or user.email or user.name,
			"email": user.email or user.name,
		},
		"customer": _portal_customer_payload(customer, user),
		"company": company,
		"currency": _currency(customer, company),
		**_gps_context(customer),
		"mustChangePassword": bool(cint(user.get(PASSWORD_CHANGE_FIELD))),
		"today": today(),
		"balances": _balance_rows(customer_name),
		"inProgressOrders": _in_progress_order_ids(customer_name),
		"unreadNotifications": _unread_notifications(customer_name, user.name),
	}


def _resolve_commune(commune: str) -> frappe._dict:
	name = cstr(commune).strip()
	if not name:
		frappe.throw(_("La commune est obligatoire."))
	row = frappe.db.get_value("Commune", name, ["name", "nom", "wilaya"], as_dict=True)
	if not row:
		frappe.throw(_("La commune sélectionnée est invalide."))
	if not row.get("wilaya"):
		frappe.throw(_("Cette commune n'est rattachée à aucune wilaya."))
	return row


@frappe.whitelist()
def get_communes(search=None):
	_current_portal_customer()
	term = cstr(search).strip()
	or_filters = None
	if term:
		like = f"%{term}%"
		or_filters = [
			["nom", "like", like],
			["nom_ar", "like", like],
			["wilaya", "like", like],
		]
	rows = frappe.get_all(
		"Commune",
		or_filters=or_filters,
		fields=["name", "nom", "wilaya"],
		order_by="nom asc",
		limit_page_length=500 if term else 2000,
	)
	return {
		"items": [
			{
				"name": row.name,
				"nom": row.nom or row.name,
				"wilaya": row.wilaya,
				"wilayaName": row.wilaya,
			}
			for row in rows
			if row.get("nom") or row.get("name")
		]
	}


@frappe.whitelist(methods=["POST"])
def update_customer_profile(payload):
	customer_name, user = _current_portal_customer()
	data = _payload(payload)
	full_name = cstr(data.get("fullName")).strip()
	email = cstr(data.get("email")).strip()
	phone = cstr(data.get("phone")).strip()
	if not full_name:
		frappe.throw(_("Le nom affiché est obligatoire."))
	if email:
		from frappe.utils import validate_email_address

		if not validate_email_address(email, throw=False):
			frappe.throw(_("L'adresse e-mail est invalide."))
	commune = _resolve_commune(cstr(data.get("commune")))

	doc = frappe.get_doc("Customer", customer_name)
	doc.flags.ignore_permissions = True
	doc.mobile_no = phone or None
	doc.email_id = email or None
	if doc.meta.has_field("custom_commune"):
		doc.custom_commune = commune.name
	if doc.meta.has_field("custom_wilaya"):
		doc.custom_wilaya = commune.wilaya
	with _ignore_permission_checks():
		doc.save(ignore_permissions=True)

	frappe.db.set_value("User", user.name, "full_name", full_name, update_modified=False)
	updated = _customer_data(customer_name)
	return {
		"success": True,
		"user": {
			"name": user.name,
			"fullName": full_name,
			"email": user.email or user.name,
		},
		"customer": _portal_customer_payload(updated, user),
	}


def _decode_customer_image(data: str) -> bytes:
	if not isinstance(data, str) or not data.strip():
		frappe.throw(_("La photo est obligatoire."))
	encoded = data.split(",", 1)[1] if "," in data else data
	try:
		content = base64.b64decode(encoded, validate=True)
	except (ValueError, binascii.Error):
		frappe.throw(_("La photo est invalide."))
	if not content:
		frappe.throw(_("La photo est invalide."))
	if len(content) > MAX_CUSTOMER_IMAGE_BYTES:
		frappe.throw(_("La photo dépasse la taille maximale de 2 Mo."))
	return content


def _customer_image_filename(filename: str) -> str:
	name = os.path.basename(cstr(filename).strip()) or "photo-client.jpg"
	ext = os.path.splitext(name)[1].lower()
	if ext not in CUSTOMER_IMAGE_EXTENSIONS:
		frappe.throw(_("Le format de photo n'est pas pris en charge."))
	return name


@frappe.whitelist(methods=["POST"])
def update_customer_image(payload):
	customer_name, user = _current_portal_customer()
	data = _payload(payload)
	filename = _customer_image_filename(cstr(data.get("filename")))
	content = _decode_customer_image(cstr(data.get("imageData")))
	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": filename,
			"attached_to_doctype": "Customer",
			"attached_to_name": customer_name,
			"attached_to_field": "image",
			"content": content,
			"is_private": 0,
		}
	).insert(ignore_permissions=True)
	frappe.db.set_value("Customer", customer_name, "image", file_doc.file_url)
	updated = _customer_data(customer_name)
	return {"success": True, "customer": _portal_customer_payload(updated, user)}


@frappe.whitelist(methods=["POST"])
def update_customer_gps(payload):
	customer_name, _user = _current_portal_customer()
	gps = _resolve_gps(payload)
	_save_customer_gps(customer_name, gps)
	return {
		"success": True,
		"gpsConfigured": True,
		"gpsLatitude": gps["latitude"],
		"gpsLongitude": gps["longitude"],
		"gpsAccuracy": gps["accuracy"],
		"gpsCapturedAt": cstr(now_datetime()),
	}


@frappe.whitelist(methods=["POST"])
def change_initial_password(payload):
	_customer_name, user = _current_portal_customer()
	if not frappe.db.has_column("User", PASSWORD_CHANGE_FIELD) or not cint(
		user.get(PASSWORD_CHANGE_FIELD)
	):
		frappe.throw(_("Aucun changement de mot de passe initial n'est requis pour ce compte."))

	data = _payload(payload)
	current_password = cstr(data.get("currentPassword"))
	new_password = cstr(data.get("newPassword"))
	if not current_password or not new_password:
		frappe.throw(_("Le mot de passe temporaire et le nouveau mot de passe sont obligatoires."))
	if current_password == new_password:
		frappe.throw(_("Le nouveau mot de passe doit être différent du mot de passe temporaire."))

	update_password(
		new_password=new_password,
		old_password=current_password,
		logout_all_sessions=1,
	)
	frappe.db.set_value("User", user.name, PASSWORD_CHANGE_FIELD, 0, update_modified=False)
	return {"success": True, "mustChangePassword": False}


def _catalog_or_filters(search: Any):
	term = cstr(search).strip()
	if not term:
		return None
	like = f"%{term}%"
	return [
		["name", "like", like],
		["item_name", "like", like],
		["description", "like", like],
		["item_group", "like", like],
	]


def _catalog_total(filters: dict[str, Any], or_filters) -> int:
	if or_filters:
		return len(frappe.get_all("Item", filters=filters, or_filters=or_filters, pluck="name"))
	return cint(frappe.db.count("Item", filters))


def _catalog_groups() -> list[str]:
	return frappe.get_all("Item Group", filters={"is_group": 0}, pluck="name", order_by="name asc")


def _empty_catalog(page_number: int, length: int) -> dict[str, Any]:
	return {
		"items": [],
		"groups": _catalog_groups(),
		"page": page_number,
		"pageLength": length,
		"hasNext": False,
		"total": 0,
	}


@frappe.whitelist()
def get_catalog(search=None, item_group=None, page=1, page_length=12, order_by=None, offers_only=0, campaign=None):
	from log.services import portal_merchandising as merchandising

	customer_name, user = _current_portal_customer()
	page_number, length, offset = _page_args(page, page_length)
	filters = _catalog_item_filters()
	if item_group:
		filters["item_group"] = cstr(item_group)
	campaigns = merchandising.campaigns_by_item(customer_name)
	campaign_name = cstr(campaign).strip()
	live = merchandising.get_live_campaign(customer_name, campaign_name) if campaign_name else None
	campaign_codes = merchandising.campaign_visible_item_codes(live) if live else []
	if campaign_name and not campaign_codes:
		return _empty_catalog(page_number, length)
	if campaign_codes:
		if cint(offers_only):
			offer_set = set(campaigns)
			campaign_codes = [code for code in campaign_codes if code in offer_set]
			if not campaign_codes:
				return _empty_catalog(page_number, length)
		filters["name"] = ["in", campaign_codes]
	elif cint(offers_only):
		offer_codes = [code for code in campaigns if code]
		if not offer_codes:
			return _empty_catalog(page_number, length)
		filters["name"] = ["in", offer_codes]
	or_filters = _catalog_or_filters(search)
	fields = ["name", "item_name", "description", "item_group", "stock_uom", "image"]
	if _item_has_column(STORE_SHOW_PRICE_FIELD):
		fields.append(STORE_SHOW_PRICE_FIELD)
	sort_key = _sort_clause(order_by, CATALOG_SORT_CLAUSES, "relevance")
	use_campaign_order = bool(campaign_codes) and sort_key == CATALOG_SORT_CLAUSES["relevance"]
	rows = frappe.get_all(
		"Item",
		filters=filters,
		or_filters=or_filters,
		fields=fields,
		order_by=sort_key,
		limit_start=0 if use_campaign_order else offset,
		limit_page_length=500 if use_campaign_order else length + 1,
	)
	if use_campaign_order:
		rank = {code: index for index, code in enumerate(campaign_codes)}
		rows.sort(key=lambda row: rank.get(row.name, 10_000))
		total = len(rows)
		has_next = offset + length < total
		rows = rows[offset : offset + length]
	else:
		has_next = len(rows) > length
		rows = rows[:length]
		total = _catalog_total(filters, or_filters)
	currency = _currency(_customer_data(customer_name), _company())
	products = []
	for row in rows:
		linked = live or campaigns.get(row.name)
		products.append(
			merchandising.serialize_item_row(
				row,
				currency=currency,
				campaign=linked,
				placement=linked.placement if linked else None,
			)
		)
	merchandising.apply_prices(products, customer_name, user.name)
	return {
		"items": products,
		"groups": _catalog_groups(),
		"page": page_number,
		"pageLength": length,
		"hasNext": has_next,
		"total": total,
	}


@frappe.whitelist()
def get_recent_order_items(limit=8):
	from log.services import portal_merchandising as merchandising

	customer_name, user = _current_portal_customer()
	max_items = min(max(cint(limit), 1), 12)
	order_names = frappe.get_all(
		"Sales Order",
		filters={"customer": customer_name, "docstatus": ["<", 2]},
		pluck="name",
		order_by="transaction_date desc, creation desc",
		limit_page_length=30,
	)
	if not order_names:
		return {"items": []}

	item_fields = ["item_code", "item_name", "qty", "uom", "parent", "idx"]
	has_column = getattr(getattr(frappe, "db", None), "has_column", None)
	if has_column and has_column("Sales Order Item", "is_free_item"):
		item_fields.append("is_free_item")
	rows = frappe.get_all(
		"Sales Order Item",
		filters={"parent": ["in", order_names], "parenttype": "Sales Order"},
		fields=item_fields,
		order_by="idx asc",
	)
	order_rank = {name: index for index, name in enumerate(order_names)}
	rows.sort(key=lambda row: (order_rank.get(row.parent, 999), cint(row.idx)))

	seen: dict[str, Any] = {}
	for row in rows:
		code = cstr(row.item_code)
		if not code or code in seen or cint(row.get("is_free_item")):
			continue
		seen[code] = row
		if len(seen) >= max_items:
			break

	item_rows = merchandising.fetch_item_rows(list(seen))
	currency = _currency(_customer_data(customer_name), _company())
	campaigns = merchandising.campaigns_by_item(customer_name)
	products = []
	for code, row in seen.items():
		item_row = item_rows.get(code)
		if not item_row:
			continue
		campaign = campaigns.get(code)
		payload = merchandising.serialize_item_row(
			item_row,
			currency=currency,
			campaign=campaign,
			placement=campaign.placement if campaign else None,
		)
		payload["lastQuantity"] = flt(row.qty) or 1
		products.append(payload)
	merchandising.apply_prices(products, customer_name, user.name)
	return {"items": products}


def _prepare_order_lines(customer: str, items: Any) -> list[dict[str, Any]]:
	from log.services import portal_merchandising as merchandising

	return merchandising.sanitize_line_attribution(customer, _normalise_lines(items))


@frappe.whitelist(methods=["POST"])
def preview_order(payload):
	from log.services import portal_merchandising as merchandising

	customer_name, user = _current_portal_customer()
	data = _payload(payload)
	lines = _prepare_order_lines(customer_name, data.get("items"))
	delivery_date = _validate_delivery_date(data.get("deliveryDate"))
	customer = _customer_data(customer_name)
	coordinates = customer.get("custom_gps") if _customer_has_gps(customer) else None
	gps_accuracy = flt(customer.get("custom_gps_precision_m")) or None
	coupon = merchandising.coupon_from_lines(customer_name, lines)
	with _allow_item_details([line["item_code"] for line in lines]):
		order = _new_sales_order(
			customer_name,
			lines,
			delivery_date,
			portal_user=user.name,
			coordinates=coordinates,
			gps_accuracy=gps_accuracy,
			coupon_code=coupon,
		)
	result = _preview(order)
	result["requiresGps"] = not _customer_has_gps(customer)
	result["attributedCampaigns"] = [line["campaign"] for line in lines if line.get("campaign")]
	return result


@frappe.whitelist(methods=["POST"])
def create_order(payload):
	from log.services import portal_merchandising as merchandising

	customer_name, user = _current_portal_customer()
	data = _payload(payload)
	lines = _prepare_order_lines(customer_name, data.get("items"))
	delivery_date = _validate_delivery_date(data.get("deliveryDate"))
	customer = _customer_data(customer_name)
	coordinates = customer.get("custom_gps") if _customer_has_gps(customer) else None
	gps_accuracy = flt(customer.get("custom_gps_precision_m")) or None
	if not coordinates:
		gps = _validate_gps(data.get("gps"))
		coordinates = _save_customer_gps(customer_name, gps)
		gps_accuracy = gps["accuracy"]
	coupon = merchandising.coupon_from_lines(customer_name, lines)

	with _portal_order_write([line["item_code"] for line in lines]):
		order = _new_sales_order(
			customer_name,
			lines,
			delivery_date,
			portal_user=user.name,
			coordinates=coordinates,
			gps_accuracy=gps_accuracy,
			coupon_code=coupon,
		)
		merchandising.apply_order_attribution(order, lines)
		order.insert(ignore_permissions=True)
	_notify_responsibles(order)
	return _serialize_order(order, include_items=True)


@frappe.whitelist(methods=["POST"])
def update_order(payload):
	from log.services import portal_merchandising as merchandising

	customer_name, user = _current_portal_customer()
	data = _payload(payload)
	order = _owned_order(cstr(data.get("orderId")), customer_name, editable=True)
	_assert_modified(order, data.get("expectedModified"))
	lines = _prepare_order_lines(customer_name, data.get("items"))
	delivery_date = _validate_delivery_date(data.get("deliveryDate"))
	coupon = merchandising.coupon_from_lines(customer_name, lines)
	order.set("items", [])
	order.set("taxes", [])
	order.delivery_date = delivery_date
	if coupon and order.meta.has_field("coupon_code"):
		order.coupon_code = coupon
	if order.meta.has_field("custom_utilisateur_portail"):
		order.custom_utilisateur_portail = user.name
	for line in lines:
		order.append(
			"items",
			{
				"item_code": line["item_code"],
				"qty": line["qty"],
				"uom": line["uom"],
				"delivery_date": delivery_date,
			},
		)
	order.flags.ignore_permissions = True
	with _portal_order_write([line["item_code"] for line in lines]):
		order.set_missing_values()
		merchandising.apply_order_attribution(order, lines)
		order.calculate_taxes_and_totals()
		order.save(ignore_permissions=True)
	return _serialize_order(order, include_items=True)


@frappe.whitelist(methods=["POST"])
def delete_order(payload):
	customer_name, _user = _current_portal_customer()
	data = _payload(payload)
	order = _owned_order(cstr(data.get("orderId")), customer_name, editable=True)
	_assert_modified(order, data.get("expectedModified"))
	name = order.name
	frappe.delete_doc("Sales Order", name, ignore_permissions=True)
	return {"success": True, "name": name}


@frappe.whitelist()
def get_orders(
	page=1,
	page_length=20,
	search=None,
	status=None,
	source=None,
	from_date=None,
	to_date=None,
	order_by=None,
):
	customer_name, _user = _current_portal_customer()
	page_number, length, offset = _page_args(page, page_length)
	in_progress = set(_in_progress_order_ids(customer_name))
	query = _order_list_filters(
		customer_name,
		search=search,
		status=status,
		source=source,
		from_date=from_date,
		to_date=to_date,
		in_progress_ids=list(in_progress),
	)
	if query is None:
		return {"items": [], "page": page_number, "pageLength": length, "hasNext": False}
	filters, or_filters = query
	rows = frappe.get_all(
		"Sales Order",
		filters=filters,
		or_filters=or_filters,
		fields=["name"],
		order_by=_order_sort_clause(order_by),
		limit_start=offset,
		limit_page_length=length + 1,
	)
	has_next = len(rows) > length
	orders = [
		_serialize_order(frappe.get_doc("Sales Order", row.name), in_progress=row.name in in_progress)
		for row in rows[:length]
	]
	return {"items": orders, "page": page_number, "pageLength": length, "hasNext": has_next}


@frappe.whitelist()
def get_order(order_id):
	customer_name, _user = _current_portal_customer()
	order = _owned_order(cstr(order_id), customer_name)
	return _serialize_order(
		order,
		include_items=True,
		in_progress=order.name in set(_in_progress_order_ids(customer_name)),
	)


@frappe.whitelist()
def get_delivery_notes(
	page=1,
	page_length=20,
	search=None,
	status=None,
	from_date=None,
	to_date=None,
	order_by=None,
):
	customer_name, _user = _current_portal_customer()
	page_number, length, offset = _page_args(page, page_length)
	in_progress = _in_progress_delivery_ids(customer_name)
	query = _delivery_list_filters(
		customer_name,
		search=search,
		status=status,
		from_date=from_date,
		to_date=to_date,
		in_progress_ids=in_progress,
	)
	if query is None:
		return {"items": [], "page": page_number, "pageLength": length, "hasNext": False}
	filters, or_filters = query
	rows = frappe.get_all(
		"Delivery Note",
		filters=filters,
		or_filters=or_filters,
		fields=["name"],
		order_by=_delivery_sort_clause(order_by),
		limit_start=offset,
		limit_page_length=length + 1,
	)
	has_next = len(rows) > length
	notes = [_serialize_delivery_note(frappe.get_doc("Delivery Note", row.name)) for row in rows[:length]]
	return {"items": notes, "page": page_number, "pageLength": length, "hasNext": has_next}


@frappe.whitelist()
def get_delivery_note(delivery_note_id):
	customer_name, _user = _current_portal_customer()
	name = cstr(delivery_note_id)
	if not name or not frappe.db.exists("Delivery Note", name):
		frappe.throw(_("Bon de livraison introuvable."), frappe.DoesNotExistError)
	doc = frappe.get_doc("Delivery Note", name)
	if doc.customer != customer_name:
		frappe.throw(_("Vous n'êtes pas autorisé à consulter ce bon."), frappe.PermissionError)
	return _serialize_delivery_note(doc, include_items=True)


@frappe.whitelist()
def get_payments(page=1, page_length=20):
	customer_name, _user = _current_portal_customer()
	page_number, length, offset = _page_args(page, page_length)
	rows = frappe.get_all(
		"Paiement Client",
		filters={"client": customer_name},
		fields=["name", "date", "moyen_paiement", "montant", "statut_controle", "bon_livraison", "payment_entry"],
		order_by="date desc, creation desc",
		limit_start=offset,
		limit_page_length=length + 1,
	)
	has_next = len(rows) > length
	items = [
		{
			"name": row.name,
			"date": cstr(row.date),
			"method": row.moyen_paiement,
			"amount": flt(row.montant),
			"status": row.statut_controle,
			"deliveryNote": row.bon_livraison,
			"paymentEntry": row.payment_entry,
		}
		for row in rows[:length]
	]
	return {"items": items, "page": page_number, "pageLength": length, "hasNext": has_next}


def _balance_rows(customer: str) -> list[dict[str, Any]]:
	rows = frappe.db.sql(
		"""
		SELECT gle.company,
			COALESCE(NULLIF(gle.account_currency, ''), company.default_currency) AS currency,
			SUM(gle.debit_in_account_currency - gle.credit_in_account_currency) AS balance
		FROM `tabGL Entry` gle
		INNER JOIN `tabCompany` company ON company.name = gle.company
		WHERE gle.party_type = 'Customer'
			AND gle.party = %s
			AND gle.is_cancelled = 0
		GROUP BY gle.company, COALESCE(NULLIF(gle.account_currency, ''), company.default_currency)
		ORDER BY gle.company, currency
		""",
		(customer,),
		as_dict=True,
	)
	if rows:
		return [
			{"company": row.company, "currency": row.currency, "amount": flt(row.balance)} for row in rows
		]
	company = _company()
	return [
		{
			"company": company,
			"currency": frappe.get_cached_value("Company", company, "default_currency"),
			"amount": 0,
		}
	]


@frappe.whitelist()
def get_current_balance():
	customer_name, _user = _current_portal_customer()
	return {"balances": _balance_rows(customer_name), "asOf": cstr(now_datetime())}


@frappe.whitelist()
def get_storefront():
	from log.services import portal_merchandising as merchandising

	customer_name, user = _current_portal_customer()
	return merchandising.build_storefront(customer_name, user.name)


@frappe.whitelist()
def get_product(item_code):
	from log.services import portal_merchandising as merchandising

	customer_name, user = _current_portal_customer()
	return merchandising.get_product(customer_name, user.name, item_code)


@frappe.whitelist(methods=["POST"])
def log_promotion_event(payload):
	from log.services.portal_promotion_events import log_event

	customer_name, _user = _current_portal_customer()
	data = _payload(payload)
	return log_event(
		customer=customer_name,
		event_type=data.get("eventType") or data.get("event_type"),
		campaign=data.get("campaign"),
		placement=data.get("placement"),
		item_code=data.get("itemCode") or data.get("item_code"),
	)


@frappe.whitelist()
def preview_campaign(campaign, customer):
	from log.services import portal_merchandising as merchandising

	if not frappe.has_permission("Campagne Portail", "write"):
		frappe.throw(_("Vous n'êtes pas autorisé à prévisualiser cette campagne."), frappe.PermissionError)
	name = cstr(campaign).strip()
	customer_name = cstr(customer).strip()
	if not name or not frappe.db.exists("Campagne Portail", name):
		frappe.throw(_("Campagne introuvable."), frappe.DoesNotExistError)
	if not customer_name or not frappe.db.exists("Customer", customer_name):
		frappe.throw(_("Client introuvable."), frappe.DoesNotExistError)
	return merchandising.build_storefront(customer_name, frappe.session.user, include_unpublished=name)
