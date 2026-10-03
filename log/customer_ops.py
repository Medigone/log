# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Fiches clients depuis Distribution : liste, fiche complète, contacts, adresses, conditions, activité et portail."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, getdate, now_datetime

from log.api.distribution import ORDER_ROLES, _payload, _require
from log.api.distribution_rules import parse_gps_value

LIST_LIMIT = 50
EXPORT_LIMIT = 5000
ACTIVITY_LIMIT = 20
CUSTOMER_STATUSES = ("Prospect", "Actif", "Dormant", "Perdu", "Exclu")
LIST_FILTERS = ("tous", *CUSTOMER_STATUSES, "sans_gps", "desactives")
SORTS = {
	"recent": "c.modified desc",
	"nom": "c.customer_name asc",
	"creation": "c.creation desc",
}
ADDRESS_TYPES = ("Shipping", "Billing", "Office", "Warehouse", "Shop", "Other")
FILE_FIELDS = {
	"rc": "custom_fichier_rc",
	"nif": "custom_fichier_nif",
	"nis": "custom_fichier_nis",
	"ai": "custom_fichier_ai",
}
# Clé API -> (champ Customer, type). Toute autre clé du payload est refusée.
EDITABLE_FIELDS = {
	"customer_name": ("customer_name", "text"),
	"customer_group": ("customer_group", "group"),
	"status": ("custom_status", "status"),
	"legal_form": ("custom_forme_juridique", "legal_form"),
	"phone": ("custom_téléphone", "phone"),
	"email": ("custom_email", "email"),
	"main_phone": ("custom_nº_téléphone_principal", "phone"),
	"fax": ("custom_nº_fax", "phone"),
	"main_email": ("custom_email_principal_client", "email"),
	"existence_date": ("custom_date_existence", "date"),
	"is_virtual": ("custom_est_virtuel", "check"),
	"key_account": ("custom_grand_compte", "check"),
	"small_quantities": ("custom_client_avec_petites_quantités", "check"),
	"rc": ("custom_nº_rc", "text"),
	"nif": ("custom_nº_nif", "text"),
	"nis": ("custom_nº_nis", "text"),
	"ai": ("custom_nº_ai", "text"),
	"default_price_list": ("default_price_list", "price_list"),
	"payment_terms": ("payment_terms", "payment_terms"),
	"disabled": ("disabled", "check"),
	"is_frozen": ("is_frozen", "check"),
	"quality_frequency": ("custom_qualité_fréquence", "int"),
	"quality_interaction": ("custom_qualité_interaction", "int"),
	"quality_payments": ("custom_qualité_paiements", "int"),
	"satisfaction": ("custom_satisfaction_client", "rating"),
}
BULK_FIELDS = ("status", "customer_group", "default_price_list", "payment_terms", "disabled")


def _text(value) -> str:
	return cstr(value).strip()


def _has(field: str) -> bool:
	return bool(frappe.db.has_column("Customer", field))


def _get_customer(name):
	name = _text(name)
	if not name or not frappe.db.exists("Customer", name):
		frappe.throw(_("Le client {0} n'existe pas.").format(name or "—"), frappe.DoesNotExistError)
	return frappe.get_doc("Customer", name)


def _save(doc):
	"""ERPNext revérifie les droits Customer/Account dans validate() même avec ignore_permissions."""
	from log.api.customer_signup import _ignore_permission_checks

	with _ignore_permission_checks():
		doc.save(ignore_permissions=True)


# --- Options ------------------------------------------------------------------


@frappe.whitelist()
def get_customer_options():
	_require(ORDER_ROLES)
	from log.order_entry_ops import LEGAL_FORMS, _company

	company = _company()
	return {
		"company": company,
		"currency": frappe.db.get_value("Company", company, "default_currency"),
		"companies": frappe.get_all("Company", pluck="name", order_by="name asc"),
		"statuses": list(CUSTOMER_STATUSES),
		"legal_forms": list(LEGAL_FORMS),
		"customer_groups": frappe.get_all(
			"Customer Group", filters={"is_group": 0}, pluck="name", order_by="name asc"
		),
		"price_lists": frappe.get_all(
			"Price List", filters={"selling": 1, "enabled": 1}, pluck="name", order_by="name asc"
		),
		"payment_terms_templates": frappe.get_all(
			"Payment Terms Template", pluck="name", order_by="name asc"
		),
		"wilayas": frappe.get_all("Wilaya", pluck="name", order_by="name asc")
		if frappe.db.exists("DocType", "Wilaya")
		else [],
		"address_types": list(ADDRESS_TYPES),
	}


# --- Liste --------------------------------------------------------------------


def _list_where(search, customer_group, wilaya, status) -> tuple[list[str], dict]:
	clauses, values = [], {}
	term = _text(search)
	if term:
		values["like"] = f"%{term}%"
		clauses.append(
			"(c.name like %(like)s or c.customer_name like %(like)s or c.mobile_no like %(like)s"
			" or c.`custom_téléphone` like %(like)s or co.nom like %(like)s or c.custom_wilaya like %(like)s"
			" or c.`custom_nº_nif` like %(like)s or c.`custom_nº_rc` like %(like)s)"
		)
	if _text(customer_group):
		values["customer_group"] = _text(customer_group)
		clauses.append("c.customer_group = %(customer_group)s")
	if _text(wilaya):
		values["wilaya"] = _text(wilaya)
		clauses.append("c.custom_wilaya = %(wilaya)s")
	status = _text(status) or "tous"
	if status not in LIST_FILTERS:
		frappe.throw(_("Filtre de statut invalide : {0}").format(status))
	if status == "desactives":
		clauses.append("c.disabled = 1")
	else:
		clauses.append("c.disabled = 0")
		if status == "sans_gps":
			clauses.append("ifnull(c.custom_gps, '') = ''")
		elif status in CUSTOMER_STATUSES:
			values["status"] = status
			clauses.append("c.custom_status = %(status)s")
	return clauses, values


def _customer_counts() -> dict:
	rows = frappe.db.sql(
		"""
		select
			sum(c.disabled = 0) as tous,
			sum(c.disabled = 1) as desactives,
			sum(c.disabled = 0 and ifnull(c.custom_gps, '') = '') as sans_gps,
			sum(c.disabled = 0 and c.custom_status = 'Prospect') as Prospect,
			sum(c.disabled = 0 and c.custom_status = 'Actif') as Actif,
			sum(c.disabled = 0 and c.custom_status = 'Dormant') as Dormant,
			sum(c.disabled = 0 and c.custom_status = 'Perdu') as Perdu,
			sum(c.disabled = 0 and c.custom_status = 'Exclu') as Exclu
		from `tabCustomer` c
		""",
		as_dict=True,
	)
	row = rows[0] if rows else {}
	return {key: cint(row.get(key)) for key in LIST_FILTERS}


def _balances(names: list[str]) -> dict[str, float]:
	if not names:
		return {}
	rows = frappe.db.sql(
		"""
		select party, sum(debit - credit) as balance
		from `tabGL Entry`
		where party_type = 'Customer' and is_cancelled = 0 and party in %(names)s
		group by party
		""",
		{"names": tuple(names)},
		as_dict=True,
	)
	return {row.party: flt(row.balance) for row in rows}


def _last_orders(names: list[str]) -> dict[str, str]:
	if not names:
		return {}
	rows = frappe.db.sql(
		"""
		select customer, max(transaction_date) as last_order
		from `tabSales Order`
		where docstatus = 1 and customer in %(names)s
		group by customer
		""",
		{"names": tuple(names)},
		as_dict=True,
	)
	return {row.customer: str(row.last_order) for row in rows if row.last_order}


def _serialize_row(row, balances, last_orders) -> dict:
	return {
		"name": row.name,
		"customer_name": row.customer_name or row.name,
		"customer_group": row.customer_group,
		"status": row.custom_status,
		"disabled": bool(cint(row.disabled)),
		"is_frozen": bool(cint(row.is_frozen)),
		"commune": row.custom_commune,
		"commune_name": row.commune_name or row.custom_commune,
		"wilaya": row.custom_wilaya,
		"phone": _text(row.get("custom_téléphone")) or _text(row.mobile_no) or None,
		"nif": row.get("custom_nº_nif"),
		"rc": row.get("custom_nº_rc"),
		"default_price_list": row.default_price_list,
		"payment_terms": row.payment_terms,
		"has_gps": bool(_text(row.custom_gps)),
		"key_account": bool(cint(row.get("custom_grand_compte"))),
		"balance": balances.get(row.name, 0.0),
		"last_order": last_orders.get(row.name),
		"creation": str(row.creation) if row.creation else None,
	}


def _query_customers(search, customer_group, wilaya, status, sort, start, limit) -> tuple[list[dict], int]:
	clauses, values = _list_where(search, customer_group, wilaya, status)
	where = " and ".join(clauses) or "1=1"
	join = "left join `tabCommune` co on co.name = c.custom_commune"
	total = cint(frappe.db.sql(f"select count(*) from `tabCustomer` c {join} where {where}", values)[0][0])
	rows = frappe.db.sql(
		f"""
		select c.name, c.customer_name, c.customer_group, c.custom_status, c.disabled, c.is_frozen,
			c.custom_commune, co.nom as commune_name, c.custom_wilaya, c.mobile_no, c.`custom_téléphone`,
			c.`custom_nº_nif`, c.`custom_nº_rc`, c.default_price_list, c.payment_terms, c.custom_gps,
			c.custom_grand_compte, c.creation
		from `tabCustomer` c {join}
		where {where}
		order by {SORTS.get(_text(sort), SORTS["recent"])}
		limit {cint(limit)} offset {max(cint(start), 0)}
		""",
		values,
		as_dict=True,
	)
	names = [row.name for row in rows]
	balances, last_orders = _balances(names), _last_orders(names)
	return [_serialize_row(row, balances, last_orders) for row in rows], total


@frappe.whitelist()
def list_customers(
	search=None, customer_group=None, wilaya=None, status="tous", sort="recent", start=0, limit=LIST_LIMIT
):
	_require(ORDER_ROLES)
	limit = min(max(cint(limit) or LIST_LIMIT, 1), 200)
	customers, total = _query_customers(search, customer_group, wilaya, status, sort, start, limit)
	return {
		"customers": customers,
		"total": total,
		"start": max(cint(start), 0),
		"limit": limit,
		"counts": _customer_counts(),
	}


@frappe.whitelist()
def export_customers(search=None, customer_group=None, wilaya=None, status="tous", sort="nom"):
	_require(ORDER_ROLES)
	customers, total = _query_customers(search, customer_group, wilaya, status, sort, 0, EXPORT_LIMIT)
	return {"customers": customers, "total": total, "truncated": total > len(customers)}


# --- Fiche --------------------------------------------------------------------


def _contacts(customer: str) -> list[dict]:
	names = frappe.get_all(
		"Dynamic Link",
		filters={"parenttype": "Contact", "link_doctype": "Customer", "link_name": customer},
		pluck="parent",
		distinct=True,
	)
	if not names:
		return []
	result = []
	for row in frappe.get_all(
		"Contact",
		filters={"name": ["in", names]},
		fields=[
			"name",
			"first_name",
			"last_name",
			"full_name",
			"designation",
			"email_id",
			"phone",
			"mobile_no",
			"is_primary_contact",
			"user",
		],
		order_by="is_primary_contact desc, full_name asc",
	):
		result.append(
			{
				"name": row.name,
				"first_name": row.first_name or "",
				"last_name": row.last_name or "",
				"full_name": row.full_name or row.name,
				"designation": row.designation or "",
				"email": row.email_id or "",
				"phone": row.phone or "",
				"mobile": row.mobile_no or "",
				"is_primary": bool(cint(row.is_primary_contact)),
				"user": row.user,
			}
		)
	return result


def _addresses(customer: str) -> list[dict]:
	names = frappe.get_all(
		"Dynamic Link",
		filters={"parenttype": "Address", "link_doctype": "Customer", "link_name": customer},
		pluck="parent",
		distinct=True,
	)
	if not names:
		return []
	return [
		{
			"name": row.name,
			"address_title": row.address_title or "",
			"address_type": row.address_type,
			"address_line1": row.address_line1 or "",
			"address_line2": row.address_line2 or "",
			"city": row.city or "",
			"state": row.state or "",
			"pincode": row.pincode or "",
			"country": row.country,
			"phone": row.phone or "",
			"email": row.email_id or "",
			"is_primary": bool(cint(row.is_primary_address)),
			"is_shipping": bool(cint(row.is_shipping_address)),
			"disabled": bool(cint(row.disabled)),
		}
		for row in frappe.get_all(
			"Address",
			filters={"name": ["in", names]},
			fields=[
				"name",
				"address_title",
				"address_type",
				"address_line1",
				"address_line2",
				"city",
				"state",
				"pincode",
				"country",
				"phone",
				"email_id",
				"is_primary_address",
				"is_shipping_address",
				"disabled",
			],
			order_by="disabled asc, is_primary_address desc, is_shipping_address desc, address_title asc",
		)
	]


def _gps(doc) -> dict:
	latitude, longitude = parse_gps_value(doc.get("custom_gps"))
	return {
		"raw": _text(doc.get("custom_gps")),
		"latitude": latitude,
		"longitude": longitude,
		"precision_m": flt(doc.get("custom_gps_precision_m")) or None,
		"captured_at": str(doc.get("custom_gps_capture_date"))
		if doc.get("custom_gps_capture_date")
		else None,
		"captured_by": doc.get("custom_gps_capture_user"),
		"source_bl": doc.get("custom_gps_source_bl"),
	}


def serialize_customer(doc) -> dict:
	from log.api.client_portal import _balance_rows
	from log.order_entry_ops import _customer_price_list

	commune_name = (
		frappe.db.get_value("Commune", doc.get("custom_commune"), "nom")
		if doc.get("custom_commune")
		else None
	)
	return {
		"name": doc.name,
		"customer_name": doc.customer_name,
		"customer_type": doc.customer_type,
		"customer_group": doc.customer_group,
		"territory": doc.territory,
		"status": doc.get("custom_status"),
		"legal_form": doc.get("custom_forme_juridique"),
		"disabled": bool(cint(doc.disabled)),
		"is_frozen": bool(cint(doc.get("is_frozen"))),
		"image": doc.get("image"),
		"phone": doc.get("custom_téléphone") or doc.get("mobile_no") or "",
		"email": doc.get("custom_email") or "",
		"main_phone": doc.get("custom_nº_téléphone_principal") or "",
		"fax": doc.get("custom_nº_fax") or "",
		"main_email": doc.get("custom_email_principal_client") or "",
		"main_contact_name": doc.get("custom_nom_contact_principal") or "",
		"primary_contact": doc.get("customer_primary_contact"),
		"primary_address": doc.get("customer_primary_address"),
		"existence_date": str(doc.get("custom_date_existence")) if doc.get("custom_date_existence") else None,
		"is_virtual": bool(cint(doc.get("custom_est_virtuel"))),
		"key_account": bool(cint(doc.get("custom_grand_compte"))),
		"small_quantities": bool(cint(doc.get("custom_client_avec_petites_quantités"))),
		"rc": doc.get("custom_nº_rc") or "",
		"nif": doc.get("custom_nº_nif") or "",
		"nis": doc.get("custom_nº_nis") or "",
		"ai": doc.get("custom_nº_ai") or "",
		"files": {key: doc.get(field) or None for key, field in FILE_FIELDS.items()},
		"commune": doc.get("custom_commune"),
		"commune_name": commune_name or doc.get("custom_commune"),
		"wilaya": doc.get("custom_wilaya"),
		"region": doc.get("custom_région"),
		"gps": _gps(doc),
		"default_price_list": doc.get("default_price_list"),
		"effective_price_list": _customer_price_list(doc.name),
		"payment_terms": doc.get("payment_terms"),
		"credit_limits": [
			{
				"company": row.company,
				"credit_limit": flt(row.credit_limit),
				"bypass_credit_limit_check": bool(cint(row.get("bypass_credit_limit_check"))),
			}
			for row in doc.get("credit_limits") or []
		],
		"quality": {
			"client": flt(doc.get("custom_qualité_client")),
			"frequency": cint(doc.get("custom_qualité_fréquence")),
			"interaction": cint(doc.get("custom_qualité_interaction")),
			"payments": cint(doc.get("custom_qualité_paiements")),
			"satisfaction": flt(doc.get("custom_satisfaction_client")),
		},
		"portal_users": [row.user for row in doc.get("portal_users") or [] if row.user],
		"contacts": _contacts(doc.name),
		"addresses": _addresses(doc.name),
		"balance": _balance_rows(doc.name),
		"creation": str(doc.creation) if doc.creation else None,
		"modified": str(doc.modified),
	}


@frappe.whitelist()
def get_customer(name):
	_require(ORDER_ROLES)
	return serialize_customer(_get_customer(name))


# --- Écritures fiche ----------------------------------------------------------


def _clean_value(key: str, kind: str, value):
	from log.order_entry_ops import LEGAL_FORMS, _normalise_phone

	if kind == "check":
		return 1 if cint(value) else 0
	if kind == "int":
		return max(cint(value), 0)
	if kind == "rating":
		rating = flt(value)
		if not 0 <= rating <= 1:
			frappe.throw(_("La note de satisfaction doit être comprise entre 0 et 1."))
		return rating
	text = _text(value)
	if kind == "text":
		if key == "customer_name" and not text:
			frappe.throw(_("La raison sociale est obligatoire."))
		return text or None
	if kind == "phone":
		return _normalise_phone(text)
	if kind == "email":
		if not text:
			return None
		from frappe.utils import validate_email_address

		return validate_email_address(text, throw=True)
	if kind == "date":
		return str(getdate(text)) if text else None
	if kind == "status":
		if text not in CUSTOMER_STATUSES:
			frappe.throw(_("Statut client invalide : {0}").format(text))
		return text
	if kind == "legal_form":
		if text not in LEGAL_FORMS:
			frappe.throw(_("Forme juridique invalide : {0}").format(text))
		return text
	if kind == "group":
		from log.api.customer_signup import _resolve_customer_group

		return _resolve_customer_group(text)
	if kind == "price_list":
		if text and not frappe.db.exists("Price List", {"name": text, "selling": 1}):
			frappe.throw(_("Liste de prix de vente invalide : {0}").format(text))
		return text or None
	if kind == "payment_terms":
		if text and not frappe.db.exists("Payment Terms Template", text):
			frappe.throw(_("Conditions de paiement invalides : {0}").format(text))
		return text or None
	frappe.throw(_("Champ non modifiable."))


def _assert_unique_name(customer_name: str, current: str | None = None):
	for candidate in {customer_name, customer_name.upper()}:
		existing = frappe.db.get_value("Customer", {"customer_name": candidate}, "name")
		if existing and existing != current:
			frappe.throw(_("Le client {0} existe déjà ({1}).").format(customer_name, existing))


def _apply_commune(doc, commune):
	from log.api.customer_signup import _resolve_commune, _territory_for

	row = _resolve_commune(commune)
	doc.custom_commune = row.name
	doc.custom_wilaya = row.wilaya
	territory = _territory_for(row)
	if territory:
		doc.territory = territory


def _apply_gps(doc, value):
	raw = _text(value)
	if not raw:
		doc.custom_gps = None
		return
	latitude, longitude = parse_gps_value(raw)
	if latitude is None:
		frappe.throw(_("Coordonnées GPS invalides : {0}").format(raw))
	coordinates = f"{latitude:.8f},{longitude:.8f}"
	if coordinates == _text(doc.get("custom_gps")):
		return
	doc.custom_gps = coordinates
	audit = {
		"custom_gps_precision_m": None,
		"custom_gps_capture_date": now_datetime(),
		"custom_gps_capture_user": frappe.session.user,
		"custom_gps_source_bl": None,
	}
	for field, audit_value in audit.items():
		if doc.meta.has_field(field):
			doc.set(field, audit_value)


def _apply_credit_limits(doc, rows):
	if not isinstance(rows, list):
		frappe.throw(_("Les plafonds de crédit sont invalides."))
	seen = set()
	doc.set("credit_limits", [])
	for row in rows:
		company = _text((row or {}).get("company"))
		if not company or not frappe.db.exists("Company", company):
			frappe.throw(_("Société invalide pour le plafond de crédit : {0}").format(company or "—"))
		if company in seen:
			frappe.throw(_("Un seul plafond de crédit par société ({0}).").format(company))
		seen.add(company)
		limit = flt(row.get("credit_limit"))
		if limit < 0:
			frappe.throw(_("Le plafond de crédit ne peut pas être négatif."))
		doc.append(
			"credit_limits",
			{
				"company": company,
				"credit_limit": limit,
				"bypass_credit_limit_check": 1 if cint(row.get("bypass_credit_limit_check")) else 0,
			},
		)


def apply_customer_changes(doc, data: dict):
	unknown = set(data) - set(EDITABLE_FIELDS) - {"name", "commune", "gps", "credit_limits"}
	if unknown:
		frappe.throw(_("Champs non modifiables : {0}").format(", ".join(sorted(unknown))))
	for key, (field, kind) in EDITABLE_FIELDS.items():
		if key not in data:
			continue
		value = _clean_value(key, kind, data[key])
		if key == "customer_name":
			_assert_unique_name(value, doc.name if not doc.is_new() else None)
		if not doc.meta.has_field(field):
			continue
		doc.set(field, value)
		if key == "phone" and doc.meta.has_field("mobile_no"):
			doc.mobile_no = value
	if "commune" in data:
		_apply_commune(doc, data["commune"])
	if "gps" in data:
		_apply_gps(doc, data["gps"])
	if "credit_limits" in data:
		_apply_credit_limits(doc, data["credit_limits"])


@frappe.whitelist(methods=["POST"])
def update_customer(payload):
	_require(ORDER_ROLES)
	data = _payload(payload)
	doc = _get_customer(data.get("name"))
	apply_customer_changes(doc, data)
	_save(doc)
	return serialize_customer(doc)


@frappe.whitelist(methods=["POST"])
def create_customer(payload):
	"""Création complète : socle commun avec la saisie rapide, puis champs complémentaires."""
	_require(ORDER_ROLES)
	from log.order_entry_ops import create_customer as quick_create

	data = _payload(payload)
	base_keys = ("customer_name", "customer_group", "commune", "legal_form", "phone", "nif", "rc", "gps")
	created = quick_create({key: data.get(key) for key in base_keys if data.get(key) not in (None, "")})
	extra = {key: value for key, value in data.items() if key not in base_keys}
	doc = frappe.get_doc("Customer", created["name"])
	if extra:
		apply_customer_changes(doc, extra)
		_save(doc)
	return serialize_customer(doc)


@frappe.whitelist(methods=["POST"])
def set_customer_file(name, kind, file_url=None):
	_require(ORDER_ROLES)
	field = FILE_FIELDS.get(_text(kind))
	if not field:
		frappe.throw(_("Type de document invalide : {0}").format(kind))
	doc = _get_customer(name)
	url = _text(file_url) or None
	if url:
		_attach_uploaded_file(url, doc.name, field)
	doc.set(field, url)
	_save(doc)
	return serialize_customer(doc)


def _attach_uploaded_file(url: str, customer: str, field: str):
	"""Le Commercial n'a pas l'écriture Desk sur Customer : le fichier est envoyé libre puis rattaché ici."""
	file_name = frappe.db.get_value(
		"File",
		{"file_url": url, "owner": frappe.session.user, "attached_to_name": ["is", "not set"]},
		"name",
		order_by="creation desc",
	) or frappe.db.get_value(
		"File", {"file_url": url, "attached_to_doctype": "Customer", "attached_to_name": customer}, "name"
	)
	if not file_name:
		frappe.throw(_("Le fichier envoyé est introuvable."))
	frappe.db.set_value(
		"File",
		file_name,
		{"attached_to_doctype": "Customer", "attached_to_name": customer, "attached_to_field": field},
	)


@frappe.whitelist(methods=["POST"])
def bulk_update_customers(payload):
	_require(ORDER_ROLES)
	data = _payload(payload)
	names = [name for name in (data.get("names") or []) if _text(name)]
	changes = data.get("changes") or {}
	if not names:
		frappe.throw(_("Sélectionnez au moins un client."))
	if len(names) > 500:
		frappe.throw(_("500 clients maximum par action groupée."))
	unknown = set(changes) - set(BULK_FIELDS)
	if unknown or not changes:
		frappe.throw(_("Modification groupée invalide."))
	clean = {key: _clean_value(key, EDITABLE_FIELDS[key][1], value) for key, value in changes.items()}
	updated, errors = [], []
	for name in names:
		try:
			doc = _get_customer(name)
			for key, value in clean.items():
				doc.set(EDITABLE_FIELDS[key][0], value)
			_save(doc)
			updated.append(name)
		except Exception as error:
			frappe.clear_last_message()
			errors.append({"name": name, "error": cstr(error) or error.__class__.__name__})
	return {"updated": updated, "errors": errors}


# --- Contacts -----------------------------------------------------------------


def _linked(doctype: str, name, customer: str):
	name = _text(name)
	if not name or not frappe.db.exists(
		"Dynamic Link",
		{"parenttype": doctype, "parent": name, "link_doctype": "Customer", "link_name": customer},
	):
		frappe.throw(
			_("Cet enregistrement n'est pas rattaché au client {0}.").format(customer), frappe.PermissionError
		)
	return frappe.get_doc(doctype, name)


def _set_primary_contact(customer, contact_name: str | None):
	for other in _contacts(customer.name):
		if other["is_primary"] and other["name"] != contact_name:
			frappe.db.set_value("Contact", other["name"], "is_primary_contact", 0)
	if customer.get("customer_primary_contact") == contact_name:
		return
	if contact_name:
		customer.customer_primary_contact = contact_name
		_save(customer)
	else:
		# Un save() sans contact principal ferait recréer un contact par ERPNext (create_primary_contact).
		frappe.db.set_value("Customer", customer.name, "customer_primary_contact", None)


@frappe.whitelist(methods=["POST"])
def save_contact(payload):
	_require(ORDER_ROLES)
	from log.order_entry_ops import _normalise_phone

	data = _payload(payload)
	customer = _get_customer(data.get("customer"))
	first_name = _text(data.get("first_name"))
	if not first_name:
		frappe.throw(_("Le prénom du contact est obligatoire."))
	email = _text(data.get("email")).lower()
	if email:
		from frappe.utils import validate_email_address

		email = validate_email_address(email, throw=True)
	phone = _normalise_phone(data.get("phone"))
	mobile = _normalise_phone(data.get("mobile"))
	primary = bool(cint(data.get("is_primary")))

	if _text(data.get("name")):
		contact = _linked("Contact", data.get("name"), customer.name)
		if contact.user and email and email != _text(contact.email_id).lower():
			frappe.throw(_("L'e-mail d'un contact lié à un accès portail ne peut pas être modifié ici."))
	else:
		contact = frappe.new_doc("Contact")
		contact.append("links", {"link_doctype": "Customer", "link_name": customer.name})
	contact.first_name = first_name
	contact.last_name = _text(data.get("last_name")) or None
	contact.designation = _text(data.get("designation")) or None
	contact.is_primary_contact = 1 if primary else 0
	contact.set("email_ids", [{"email_id": email, "is_primary": 1}] if email else [])
	phones = []
	if mobile:
		phones.append({"phone": mobile, "is_primary_mobile_no": 1, "is_primary_phone": 0 if phone else 1})
	if phone:
		phones.append({"phone": phone, "is_primary_phone": 1, "is_primary_mobile_no": 0})
	contact.set("phone_nos", phones)
	if contact.is_new():
		contact.insert(ignore_permissions=True)
	else:
		contact.save(ignore_permissions=True)
	if primary:
		_set_primary_contact(customer, contact.name)
	elif customer.get("customer_primary_contact") == contact.name:
		_set_primary_contact(customer, None)
	return serialize_customer(_get_customer(customer.name))


@frappe.whitelist(methods=["POST"])
def delete_contact(name, customer):
	_require(ORDER_ROLES)
	customer_doc = _get_customer(customer)
	contact = _linked("Contact", name, customer_doc.name)
	if contact.user:
		frappe.throw(
			_("Ce contact est lié à un accès portail ({0}) : il ne peut pas être supprimé.").format(
				contact.user
			)
		)
	if customer_doc.get("customer_primary_contact") == contact.name:
		_set_primary_contact(customer_doc, None)
	others = [
		link
		for link in contact.links
		if not (link.link_doctype == "Customer" and link.link_name == customer_doc.name)
	]
	if others:
		contact.set("links", others)
		contact.save(ignore_permissions=True)
	else:
		frappe.delete_doc("Contact", contact.name, ignore_permissions=True)
	return serialize_customer(_get_customer(customer_doc.name))


# --- Adresses -----------------------------------------------------------------


def _default_country() -> str:
	country = frappe.db.get_default("country")
	if country and frappe.db.exists("Country", country):
		return country
	return "Algeria" if frappe.db.exists("Country", "Algeria") else frappe.db.get_value("Country", {}, "name")


@frappe.whitelist(methods=["POST"])
def save_address(payload):
	_require(ORDER_ROLES)
	data = _payload(payload)
	customer = _get_customer(data.get("customer"))
	line1 = _text(data.get("address_line1"))
	if not line1:
		frappe.throw(_("L'adresse est obligatoire."))
	city = _text(data.get("city")) or (
		frappe.db.get_value("Commune", customer.get("custom_commune"), "nom")
		if customer.get("custom_commune")
		else None
	)
	if not city:
		frappe.throw(_("La ville est obligatoire."))
	address_type = _text(data.get("address_type")) or "Shipping"
	if address_type not in ADDRESS_TYPES:
		frappe.throw(_("Type d'adresse invalide : {0}").format(address_type))

	if _text(data.get("name")):
		address = _linked("Address", data.get("name"), customer.name)
	else:
		address = frappe.new_doc("Address")
		address.append("links", {"link_doctype": "Customer", "link_name": customer.name})
		address.country = _default_country()
	address.address_title = _text(data.get("address_title")) or customer.customer_name
	address.address_type = address_type
	address.address_line1 = line1
	address.address_line2 = _text(data.get("address_line2")) or None
	address.city = city
	address.state = _text(data.get("state")) or customer.get("custom_wilaya") or None
	address.pincode = _text(data.get("pincode")) or None
	address.phone = _text(data.get("phone")) or None
	address.email_id = _text(data.get("email")) or None
	address.is_primary_address = 1 if cint(data.get("is_primary")) else 0
	address.is_shipping_address = 1 if cint(data.get("is_shipping")) else 0
	if address.is_new():
		address.insert(ignore_permissions=True)
	else:
		address.save(ignore_permissions=True)
	if address.is_primary_address and customer.get("customer_primary_address") != address.name:
		customer.customer_primary_address = address.name
		_save(customer)
	return serialize_customer(_get_customer(customer.name))


@frappe.whitelist(methods=["POST"])
def delete_address(name, customer):
	"""Supprime l'adresse ; si des documents la référencent, elle est seulement désactivée."""
	_require(ORDER_ROLES)
	customer_doc = _get_customer(customer)
	address = _linked("Address", name, customer_doc.name)
	if customer_doc.get("customer_primary_address") == address.name:
		customer_doc.customer_primary_address = None
		_save(customer_doc)
	try:
		frappe.delete_doc("Address", address.name, ignore_permissions=True)
	except frappe.LinkExistsError:
		frappe.clear_last_message()
		frappe.db.set_value("Address", address.name, "disabled", 1)
	return serialize_customer(_get_customer(customer_doc.name))


# --- Activité -----------------------------------------------------------------


@frappe.whitelist()
def get_customer_activity(name):
	_require(ORDER_ROLES)
	from log.api.client_portal import _balance_rows
	from log.order_entry_ops import _company

	customer = _get_customer(name).name
	company = _company()
	currency = frappe.db.get_value("Company", company, "default_currency") or "DZD"
	orders = frappe.get_all(
		"Sales Order",
		filters={"customer": customer, "docstatus": ["<", 2]},
		fields=[
			"name",
			"transaction_date",
			"delivery_date",
			"grand_total",
			"status",
			"docstatus",
			"per_delivered",
			"per_billed",
		],
		order_by="transaction_date desc, creation desc",
		limit_page_length=ACTIVITY_LIMIT,
	)
	deliveries = frappe.get_all(
		"Delivery Note",
		filters={"customer": customer, "docstatus": 1},
		fields=["name", "posting_date", "grand_total", "status", "is_return"],
		order_by="posting_date desc, creation desc",
		limit_page_length=ACTIVITY_LIMIT,
	)
	invoices = frappe.get_all(
		"Sales Invoice",
		filters={"customer": customer, "docstatus": 1},
		fields=[
			"name",
			"posting_date",
			"due_date",
			"grand_total",
			"outstanding_amount",
			"status",
			"is_return",
		],
		order_by="posting_date desc, creation desc",
		limit_page_length=ACTIVITY_LIMIT,
	)
	payments = []
	if frappe.db.exists("DocType", "Paiement Client"):
		payments = frappe.get_all(
			"Paiement Client",
			filters={"client": customer},
			fields=[
				"name",
				"date",
				"montant",
				"moyen_paiement",
				"statut_controle",
				"bon_livraison",
				"numero_cheque",
			],
			order_by="date desc, creation desc",
			limit_page_length=ACTIVITY_LIMIT,
		)
	outstanding = frappe.db.sql(
		"""
		select ifnull(sum(outstanding_amount), 0) as total,
			ifnull(sum(case when due_date < curdate() then outstanding_amount else 0 end), 0) as overdue,
			count(*) as count
		from `tabSales Invoice`
		where customer = %s and docstatus = 1 and outstanding_amount > 0
		""",
		(customer,),
		as_dict=True,
	)[0]
	stats = frappe.db.sql(
		"""
		select count(*) as orders, ifnull(sum(grand_total), 0) as revenue, max(transaction_date) as last_order
		from `tabSales Order`
		where customer = %s and docstatus = 1 and transaction_date >= date_sub(curdate(), interval 12 month)
		""",
		(customer,),
		as_dict=True,
	)[0]
	return {
		"currency": currency,
		"balance": _balance_rows(customer),
		"outstanding": {
			"total": flt(outstanding.total),
			"overdue": flt(outstanding.overdue),
			"count": cint(outstanding["count"]),
		},
		"last_12_months": {
			"orders": cint(stats.orders),
			"revenue": flt(stats.revenue),
			"last_order": str(stats.last_order) if stats.last_order else None,
		},
		"orders": [
			{
				"name": row.name,
				"date": str(row.transaction_date),
				"delivery_date": str(row.delivery_date) if row.delivery_date else None,
				"grand_total": flt(row.grand_total),
				"status": "Brouillon" if row.docstatus == 0 else row.status,
				"per_delivered": flt(row.per_delivered),
				"per_billed": flt(row.per_billed),
			}
			for row in orders
		],
		"deliveries": [
			{
				"name": row.name,
				"date": str(row.posting_date),
				"grand_total": flt(row.grand_total),
				"status": row.status,
				"is_return": bool(cint(row.is_return)),
			}
			for row in deliveries
		],
		"invoices": [
			{
				"name": row.name,
				"date": str(row.posting_date),
				"due_date": str(row.due_date) if row.due_date else None,
				"grand_total": flt(row.grand_total),
				"outstanding_amount": flt(row.outstanding_amount),
				"status": row.status,
				"is_return": bool(cint(row.is_return)),
			}
			for row in invoices
		],
		"payments": [
			{
				"name": row.name,
				"date": str(row.date) if row.date else None,
				"amount": flt(row.montant),
				"mode": row.moyen_paiement,
				"status": row.statut_controle,
				"delivery_note": row.bon_livraison,
				"cheque_number": row.numero_cheque,
			}
			for row in payments
		],
	}


# --- Portail client -----------------------------------------------------------


@frappe.whitelist()
def get_portal_access(name):
	_require(ORDER_ROLES)
	from log.api.customer_portal_admin import _customer_for_access, portal_access_setup

	return portal_access_setup(_customer_for_access(name, check_permission=False, require_active=False))


@frappe.whitelist(methods=["POST"])
def create_portal_user(payload):
	_require(ORDER_ROLES)
	from log.api.customer_portal_admin import _customer_for_access, create_portal_user_for
	from log.api.customer_signup import _ignore_permission_checks

	data = _payload(payload)
	customer = _customer_for_access(data.get("customer"), check_permission=False)
	with _ignore_permission_checks():
		return create_portal_user_for(customer, data)
