"""Candidature publique d'un nouveau client, sans accès portail."""

from __future__ import annotations

import json
import re
from contextlib import contextmanager
from typing import Any

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cstr, validate_email_address

SIGNUP_STATUS = "Prospect"
MAX_NAME_LENGTH = 140
MIN_PHONE_DIGITS = 8


def _payload(value: Any) -> dict[str, Any]:
	if isinstance(value, str):
		try:
			value = json.loads(value)
		except (TypeError, ValueError):
			frappe.throw(_("Le contenu de la requête est invalide."))
	if not isinstance(value, dict):
		frappe.throw(_("Le contenu de la requête est invalide."))
	return value


def _required_text(value: Any, message: str, *, max_length: int = MAX_NAME_LENGTH) -> str:
	text = cstr(value).strip()
	if not text:
		frappe.throw(_(message))
	if len(text) > max_length:
		frappe.throw(_("Ce champ ne peut pas dépasser {0} caractères.").format(max_length))
	return text


def _normalise_email(value: Any) -> str:
	email = validate_email_address(cstr(value).strip(), throw=True)
	if not email or "," in email:
		frappe.throw(_("Saisissez une seule adresse e-mail valide."))
	return email.lower()


def _normalise_phone(value: Any) -> str:
	phone = cstr(value).strip()
	if not phone:
		frappe.throw(_("Le numéro de téléphone est obligatoire."))
	digits = re.sub(r"\D", "", phone)
	if len(digits) < MIN_PHONE_DIGITS:
		frappe.throw(_("Saisissez un numéro de téléphone valide."))
	return phone


def _commune_items(search: str | None = None) -> list[dict[str, str]]:
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
		ignore_permissions=True,
	)
	return [
		{
			"name": row.name,
			"nom": row.nom or row.name,
			"wilaya": row.wilaya,
			"wilayaName": row.wilaya,
		}
		for row in rows
		if row.get("nom") or row.get("name")
	]


def _category_items() -> list[dict[str, str]]:
	rows = frappe.get_all(
		"Customer Group",
		filters={"is_group": 0},
		fields=["name", "customer_group_name"],
		order_by="customer_group_name asc",
		ignore_permissions=True,
	)
	return [
		{"name": row.name, "label": row.customer_group_name or row.name}
		for row in rows
		if row.get("name")
	]


def _resolve_commune(commune: str) -> frappe._dict:
	name = cstr(commune).strip()
	if not name:
		frappe.throw(_("La commune est obligatoire."))
	row = frappe.db.get_value("Commune", name, ["name", "nom", "wilaya", "region"], as_dict=True)
	if not row:
		frappe.throw(_("La commune sélectionnée est invalide."))
	if not row.get("wilaya"):
		frappe.throw(_("Cette commune n'est rattachée à aucune wilaya."))
	return row


def _resolve_customer_group(category: str) -> str:
	name = cstr(category).strip()
	if not name:
		frappe.throw(_("La catégorie client est obligatoire."))
	row = frappe.db.get_value("Customer Group", name, ["name", "is_group"], as_dict=True)
	if not row or cint_is_group(row.get("is_group")):
		frappe.throw(_("La catégorie client sélectionnée est invalide."))
	return row.name


def cint_is_group(value: Any) -> bool:
	return bool(int(value or 0))


def _assert_email_available(email: str) -> None:
	if frappe.db.exists("User", email):
		frappe.throw(_("Un compte existe déjà pour cette adresse e-mail."))
	if frappe.db.exists("Contact Email", {"email_id": email}):
		frappe.throw(_("Un contact existe déjà pour cette adresse e-mail."))


def _territory_for(commune: frappe._dict) -> str | None:
	region = cstr(commune.get("region")).strip()
	if region and frappe.db.exists("Territory", region):
		return region
	if frappe.db.exists("Territory", "Algeria"):
		return "Algeria"
	return frappe.db.get_value("Territory", {"is_group": 0}, "name")


@contextmanager
def _ignore_permission_checks():
	original = frappe.has_permission
	frappe.has_permission = lambda *_args, **_kwargs: True
	try:
		yield
	finally:
		frappe.has_permission = original


def _create_customer(commercial_name: str, category: str, commune: frappe._dict):
	customer = frappe.new_doc("Customer")
	customer.customer_name = commercial_name
	customer.customer_type = "Company"
	customer.customer_group = category
	territory = _territory_for(commune)
	if territory:
		customer.territory = territory
	if customer.meta.has_field("custom_status"):
		customer.custom_status = SIGNUP_STATUS
	if customer.meta.has_field("custom_commune"):
		customer.custom_commune = commune.name
	if customer.meta.has_field("custom_wilaya"):
		customer.custom_wilaya = commune.wilaya
	customer.flags.ignore_permissions = True
	with _ignore_permission_checks():
		customer.insert()
	return customer


def _create_contact(customer: str, first_name: str, last_name: str, email: str, phone: str):
	contact = frappe.get_doc(
		{
			"doctype": "Contact",
			"first_name": first_name,
			"last_name": last_name,
			"email_ids": [{"email_id": email, "is_primary": 1}],
			"phone_nos": [{"phone": phone, "is_primary_mobile_no": 1}],
			"links": [{"link_doctype": "Customer", "link_name": customer}],
		}
	)
	contact.insert(ignore_permissions=True)
	return contact


def signup_options(search=None):
	return {"communes": _commune_items(search), "categories": _category_items()}


def _submit_signup(payload):
	data = _payload(payload)
	commercial_name = _required_text(data.get("commercialName"), "Le nom commercial est obligatoire.")
	first_name = _required_text(data.get("firstName"), "Le prénom est obligatoire.")
	last_name = _required_text(data.get("lastName"), "Le nom est obligatoire.")
	phone = _normalise_phone(data.get("phone"))
	email = _normalise_email(data.get("email"))
	commune = _resolve_commune(data.get("commune"))
	category = _resolve_customer_group(data.get("category"))
	_assert_email_available(email)

	customer = _create_customer(commercial_name, category, commune)
	contact = _create_contact(customer.name, first_name, last_name, email, phone)
	customer.db_set("customer_primary_contact", contact.name)
	customer.db_set("mobile_no", phone)
	customer.db_set("email_id", email)
	return {
		"success": True,
		"message": _("Demande envoyée. Un conseiller vous contactera pour valider le compte."),
	}


@frappe.whitelist(allow_guest=True)
def get_signup_options(search=None):
	return signup_options(search)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=60 * 60)
def submit_signup(payload):
	return _submit_signup(payload)
