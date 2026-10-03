# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Permissions ERPNext des rôles qui gèrent les commandes client depuis Distribution.

Les fonctions ERPNext (modification des articles d'une commande validée, annulation, suppression)
contrôlent les droits de l'utilisateur réel : on les accorde aux rôles Distribution concernés,
après la copie des permissions standard faite par Frappe (`setup_custom_perms`).
"""

from __future__ import annotations

import frappe

ORDER_MANAGER_ROLES = ("Commercial", "Responsable")
ORDER_PERMISSIONS = {
	"Sales Order": ("read", "write", "create", "submit", "cancel", "delete", "amend", "print", "report", "email", "export"),
	# Lus pendant l'enregistrement d'une commande (détails client, articles).
	"Customer": ("read", "report"),
	"Item": ("read", "report"),
}


CATALOG_MANAGER_ROLES = ("Gestionnaire catalogue", "Responsable")
_CATALOG_WRITE = ("read", "write", "create", "report", "export")
CATALOG_PERMISSIONS = {
	"Item": _CATALOG_WRITE,
	"Item Price": (*_CATALOG_WRITE, "delete"),
	"Price List": _CATALOG_WRITE,
	"Item Group": _CATALOG_WRITE,
	"Brand": _CATALOG_WRITE,
	"Pricing Rule": _CATALOG_WRITE,
	"UOM": ("read", "report"),
	"Item Tax Template": ("read", "report"),
	"Parametres Boutique Portail": ("read", "write"),
}


def ensure_order_permissions():
	_grant(ORDER_PERMISSIONS, ORDER_MANAGER_ROLES)


def ensure_catalog_permissions():
	"""Droits Desk cohérents avec l'écran Catalogue de Distribution (articles, prix, promotions)."""
	_grant(CATALOG_PERMISSIONS, CATALOG_MANAGER_ROLES)


def _grant(permissions, roles):
	from frappe.permissions import add_permission, update_permission_property

	for doctype, ptypes in permissions.items():
		if not frappe.db.exists("DocType", doctype):
			continue
		changed = False
		for role in roles:
			if not frappe.db.exists("Role", role):
				continue
			rule = {"parent": doctype, "role": role, "permlevel": 0, "if_owner": 0}
			if not frappe.db.exists("Custom DocPerm", rule):
				add_permission(doctype, role, 0)
				changed = True
			current = frappe.db.get_value("Custom DocPerm", rule, list(ptypes), as_dict=True) or {}
			for ptype in ptypes:
				if not current.get(ptype):
					update_permission_property(doctype, role, 0, ptype, 1, validate=False)
					changed = True
		if changed:
			frappe.clear_cache(doctype=doctype)
