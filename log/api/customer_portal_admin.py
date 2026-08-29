"""Création contrôlée d'accès au portail client depuis Frappe Desk."""

from __future__ import annotations

import json
import secrets
import string
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, cstr, validate_email_address


PASSWORD_LENGTH = 24
PASSWORD_CHANGE_FIELD = "custom_portal_password_change_required"


def _payload(value: Any) -> dict[str, Any]:
	if isinstance(value, str):
		try:
			value = json.loads(value)
		except (TypeError, ValueError):
			frappe.throw(_("Le contenu de la requête est invalide."))
	if not isinstance(value, dict):
		frappe.throw(_("Le contenu de la requête est invalide."))
	return value


def _customer_for_access(customer_name: Any):
	if not frappe.session.user or frappe.session.user == "Guest":
		frappe.throw(_("Authentification requise."), frappe.PermissionError)

	name = cstr(customer_name).strip()
	if not name or not frappe.db.exists("Customer", name):
		frappe.throw(_("La fiche client demandée n'existe pas."), frappe.DoesNotExistError)

	customer = frappe.get_doc("Customer", name)
	if not frappe.has_permission("Customer", "write", doc=customer, user=frappe.session.user):
		frappe.throw(
			_("Vous ne disposez pas du droit de modifier ce client."),
			frappe.PermissionError,
		)
	if cint(customer.disabled):
		frappe.throw(_("Un accès portail ne peut pas être créé pour un client désactivé."))
	if customer.meta.has_field("custom_status") and customer.get("custom_status") != "Actif":
		frappe.throw(_("Un accès portail ne peut être créé que pour un client au statut Actif."))
	return customer


def _normalise_email(value: Any) -> str:
	email = validate_email_address(cstr(value).strip(), throw=True)
	if not email or "," in email:
		frappe.throw(_("Saisissez une seule adresse e-mail valide."))
	return email.lower()


def _clean_name(value: Any, *, required: bool = False) -> str:
	name = cstr(value).strip()
	if required and not name:
		frappe.throw(_("Le prénom est obligatoire."))
	if len(name) > 140:
		frappe.throw(_("Le prénom et le nom ne peuvent pas dépasser 140 caractères."))
	return name


def _linked_contact(customer: str, contact_name: Any):
	name = cstr(contact_name).strip()
	if not name or not frappe.db.exists(
		"Dynamic Link",
		{
			"parenttype": "Contact",
			"parent": name,
			"link_doctype": "Customer",
			"link_name": customer,
		},
	):
		frappe.throw(_("Ce contact n'est pas rattaché au client demandé."), frappe.PermissionError)

	contact = frappe.get_doc("Contact", name)
	if not contact.email_id:
		frappe.throw(_("Le contact sélectionné ne possède pas d'adresse e-mail."))
	email = _normalise_email(contact.email_id)
	if contact.user and cstr(contact.user).lower() != email:
		frappe.throw(_("Ce contact est déjà rattaché à un autre utilisateur."))
	return contact, email


def _customer_parents(user: str) -> list[str]:
	return frappe.get_all(
		"Portal User",
		filters={"user": user, "parenttype": "Customer"},
		pluck="parent",
		distinct=True,
	)


def _generate_temporary_password(length: int = PASSWORD_LENGTH) -> str:
	length = max(cint(length), 18)
	groups = (string.ascii_uppercase, string.ascii_lowercase, string.digits, "!@#$%&*+-_=?.")
	characters = [secrets.choice(group) for group in groups]
	alphabet = "".join(groups)
	characters.extend(secrets.choice(alphabet) for _ in range(length - len(characters)))
	secrets.SystemRandom().shuffle(characters)
	return "".join(characters)


def _create_contact(customer: str, first_name: str, last_name: str, email: str):
	contact = frappe.get_doc(
		{
			"doctype": "Contact",
			"first_name": first_name,
			"last_name": last_name,
			"user": email,
			"email_ids": [{"email_id": email, "is_primary": 1}],
			"links": [{"link_doctype": "Customer", "link_name": customer}],
		}
	)
	contact.insert(ignore_permissions=True)
	return contact


def _link_contact(contact, user: str):
	if contact.user and contact.user != user:
		frappe.throw(_("Ce contact est déjà rattaché à un autre utilisateur."))
	if contact.user != user:
		contact.user = user
		contact.save(ignore_permissions=True)


def _ensure_customer_role(user_doc) -> None:
	roles = {row.role for row in user_doc.get("roles") or []}
	if "Customer" not in roles:
		user_doc.append("roles", {"role": "Customer"})
		user_doc.save(ignore_permissions=True)


def _ensure_portal_link(customer, user: str) -> None:
	if user in {row.user for row in customer.get("portal_users") or []}:
		return
	customer.append("portal_users", {"user": user})
	customer.save(ignore_permissions=True)


def _safe_access_result(status: str, user: str, contact: str | None = None) -> dict[str, Any]:
	return {
		"status": status,
		"user": user,
		"email": user,
		"contact": contact,
		"temporaryPassword": None,
		"requiresPasswordChange": bool(
			frappe.db.get_value("User", user, PASSWORD_CHANGE_FIELD)
			if frappe.db.has_column("User", PASSWORD_CHANGE_FIELD)
			else False
		),
	}


@frappe.whitelist()
def get_customer_portal_access_setup(customer):
	customer_doc = _customer_for_access(customer)
	contact_names = frappe.get_all(
		"Dynamic Link",
		filters={
			"parenttype": "Contact",
			"link_doctype": "Customer",
			"link_name": customer_doc.name,
		},
		pluck="parent",
		distinct=True,
	)
	contacts = []
	if contact_names:
		for row in frappe.get_all(
			"Contact",
			filters={"name": ["in", contact_names], "email_id": ["is", "set"]},
			fields=["name", "first_name", "last_name", "full_name", "email_id", "user"],
			order_by="is_primary_contact desc, full_name asc",
		):
			contacts.append(
				{
					"name": row.name,
					"firstName": row.first_name,
					"lastName": row.last_name,
					"fullName": row.full_name or row.name,
					"email": row.email_id,
					"user": row.user,
				}
			)

	portal_users = [row.user for row in customer_doc.get("portal_users") or [] if row.user]
	user_rows = {}
	if portal_users:
		user_rows = {
			row.name: row
			for row in frappe.get_all(
				"User",
				filters={"name": ["in", portal_users]},
				fields=["name", "full_name", "enabled", "user_type"],
			)
		}
	accesses = []
	for user in portal_users:
		row = user_rows.get(user)
		accesses.append(
			{
				"user": user,
				"fullName": row.full_name if row else user,
				"enabled": bool(row and row.enabled),
				"userType": row.user_type if row else None,
			}
		)

	return {
		"customer": customer_doc.name,
		"primaryContact": customer_doc.customer_primary_contact,
		"contacts": contacts,
		"accesses": accesses,
	}


@frappe.whitelist(methods=["POST"])
def create_customer_portal_user(payload):
	data = _payload(payload)
	customer = _customer_for_access(data.get("customer"))
	contact_name = cstr(data.get("contact")).strip()

	contact = None
	manual_contact = not contact_name
	if contact_name:
		contact, email = _linked_contact(customer.name, contact_name)
		first_name = _clean_name(contact.first_name or contact.full_name, required=True)
		last_name = _clean_name(contact.last_name)
	else:
		first_name = _clean_name(data.get("firstName"), required=True)
		last_name = _clean_name(data.get("lastName"))
		email = _normalise_email(data.get("email"))

	user_name = frappe.db.get_value("User", {"email": email}, "name")
	if user_name:
		user_doc = frappe.get_doc("User", user_name)
		if not cint(user_doc.enabled):
			frappe.throw(_("Un utilisateur désactivé existe déjà avec cette adresse e-mail."))
		if user_doc.user_type != "Website User":
			frappe.throw(_("Cette adresse e-mail appartient déjà à un utilisateur système."))

		parents = _customer_parents(user_doc.name)
		if any(parent != customer.name for parent in parents):
			frappe.throw(_("Cet utilisateur est déjà rattaché à un autre client."), frappe.PermissionError)
		if customer.name in parents:
			return _safe_access_result("already_linked", user_doc.name, contact.name if contact else None)

		_ensure_customer_role(user_doc)
		if manual_contact:
			contact = _create_contact(customer.name, first_name, last_name, email)
		else:
			_link_contact(contact, user_doc.name)
		_ensure_portal_link(customer, user_doc.name)
		return _safe_access_result("linked_existing", user_doc.name, contact.name)

	temporary_password = _generate_temporary_password()
	user_doc = frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": first_name,
			"last_name": last_name,
			"enabled": 1,
			"user_type": "Website User",
			"send_welcome_email": 0,
			"new_password": temporary_password,
			"roles": [{"role": "Customer"}],
			PASSWORD_CHANGE_FIELD: 1,
		}
	)
	user_doc.flags.no_welcome_mail = True
	user_doc.insert(ignore_permissions=True)

	if manual_contact:
		contact = _create_contact(customer.name, first_name, last_name, user_doc.name)
	else:
		_link_contact(contact, user_doc.name)
	_ensure_portal_link(customer, user_doc.name)

	return {
		"status": "created",
		"user": user_doc.name,
		"email": user_doc.name,
		"contact": contact.name,
		"temporaryPassword": temporary_password,
		"requiresPasswordChange": True,
	}
