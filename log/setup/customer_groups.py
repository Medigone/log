# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Groupes de clients Modern Pharma, créés à l’installation du site."""

from __future__ import annotations

import frappe
from frappe.utils.nestedset import get_root_of

# Parents d’abord : NestedSet exige que Gros et D.D existent avant leurs feuilles.
CUSTOMER_GROUPS = [
	{"customer_group_name": "Gros", "is_group": 1, "parent_customer_group": None},
	{"customer_group_name": "D.D", "is_group": 1, "parent_customer_group": None},
	{"customer_group_name": "Super Marché", "is_group": 0, "parent_customer_group": "Gros"},
	{"customer_group_name": "Laboratoire", "is_group": 0, "parent_customer_group": "Gros"},
	{"customer_group_name": "Grossiste Cosmétique", "is_group": 0, "parent_customer_group": "Gros"},
	{"customer_group_name": "Grossiste Alimentaire", "is_group": 0, "parent_customer_group": "Gros"},
	{"customer_group_name": "Grossiste Parapharm", "is_group": 0, "parent_customer_group": "Gros"},
	{"customer_group_name": "Interne", "is_group": 0, "parent_customer_group": "D.D"},
	{"customer_group_name": "Parapharm", "is_group": 0, "parent_customer_group": "D.D"},
	{"customer_group_name": "Cosmétique", "is_group": 0, "parent_customer_group": "D.D"},
	{"customer_group_name": "Supérette", "is_group": 0, "parent_customer_group": "D.D"},
	{"customer_group_name": "Pharmacie", "is_group": 0, "parent_customer_group": "D.D"},
]


def ensure_customer_groups():
	if not frappe.db.exists("DocType", "Customer Group"):
		return

	root = get_root_of("Customer Group")
	if not root:
		frappe.throw("Le groupe racine « Customer Group » est introuvable.")

	for row in CUSTOMER_GROUPS:
		name = row["customer_group_name"]
		parent = row["parent_customer_group"] or root
		is_group = 1 if row["is_group"] else 0
		if frappe.db.exists("Customer Group", name):
			doc = frappe.get_doc("Customer Group", name)
			if cint_equal(doc.is_group, is_group) and doc.parent_customer_group == parent:
				continue
			doc.is_group = is_group
			doc.parent_customer_group = parent
			doc.save(ignore_permissions=True)
			continue
		frappe.get_doc(
			{
				"doctype": "Customer Group",
				"customer_group_name": name,
				"is_group": is_group,
				"parent_customer_group": parent,
			}
		).insert(ignore_permissions=True)


def cint_equal(left, right) -> bool:
	return int(left or 0) == int(right or 0)
