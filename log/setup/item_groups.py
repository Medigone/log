# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Taxonomie Item Group Modern Pharma, créée à l’installation du site."""

from __future__ import annotations

from typing import Any, Iterable

import frappe
from frappe.utils.nestedset import get_root_of

PARENT_NUTRITION = "Nutrition infantile"
PARENT_PARA = "Parapharmacie"

# Parents d’abord : NestedSet exige qu’ils existent avant leurs feuilles.
# `featured` marque les chips Store par défaut ; ignoré à la création ERP.
ITEM_GROUPS = [
	{"item_group_name": PARENT_NUTRITION, "is_group": 1, "parent_item_group": None},
	{"item_group_name": PARENT_PARA, "is_group": 1, "parent_item_group": None},
	{"item_group_name": "Laits infantiles", "is_group": 0, "parent_item_group": PARENT_NUTRITION, "featured": True},
	{"item_group_name": "Céréales & farines", "is_group": 0, "parent_item_group": PARENT_NUTRITION},
	{"item_group_name": "Compotes & gourdes", "is_group": 0, "parent_item_group": PARENT_NUTRITION, "featured": True},
	{"item_group_name": "Bébé & maman", "is_group": 0, "parent_item_group": PARENT_PARA, "featured": True},
	{"item_group_name": "Visage & dermocosmétique", "is_group": 0, "parent_item_group": PARENT_PARA, "featured": True},
	{"item_group_name": "Corps & hydratation", "is_group": 0, "parent_item_group": PARENT_PARA},
	{"item_group_name": "Cheveux & cuir chevelu", "is_group": 0, "parent_item_group": PARENT_PARA},
	{"item_group_name": "Protection solaire", "is_group": 0, "parent_item_group": PARENT_PARA, "featured": True},
	{"item_group_name": "Hygiène & toilette", "is_group": 0, "parent_item_group": PARENT_PARA},
	{"item_group_name": "Hygiène bucco-dentaire", "is_group": 0, "parent_item_group": PARENT_PARA},
	{"item_group_name": "Santé intime", "is_group": 0, "parent_item_group": PARENT_PARA},
	{"item_group_name": "Compléments alimentaires", "is_group": 0, "parent_item_group": PARENT_PARA, "featured": True},
	{"item_group_name": "Nutrition sportive", "is_group": 0, "parent_item_group": PARENT_PARA},
	{"item_group_name": "Nutrition clinique", "is_group": 0, "parent_item_group": PARENT_PARA},
	{"item_group_name": "ORL & respiration", "is_group": 0, "parent_item_group": PARENT_PARA},
	{"item_group_name": "Premiers soins & pansements", "is_group": 0, "parent_item_group": PARENT_PARA},
	{"item_group_name": "Consommables médicaux", "is_group": 0, "parent_item_group": PARENT_PARA},
	{"item_group_name": "Matériel médical & diagnostic", "is_group": 0, "parent_item_group": PARENT_PARA},
	{"item_group_name": "Orthopédie & maintien", "is_group": 0, "parent_item_group": PARENT_PARA},
	{"item_group_name": "Pieds & podologie", "is_group": 0, "parent_item_group": PARENT_PARA},
	{"item_group_name": "Parfums & senteurs", "is_group": 0, "parent_item_group": PARENT_PARA},
]

CANONICAL_LEAF_GROUPS = tuple(row["item_group_name"] for row in ITEM_GROUPS if not row["is_group"])
DEFAULT_FEATURED_GROUPS = tuple(row["item_group_name"] for row in ITEM_GROUPS if row.get("featured"))


def group_names_from_rows(rows: Iterable[Any] | None) -> list[str]:
	ordered: list[str] = []
	seen: set[str] = set()
	for row in rows or []:
		if isinstance(row, str):
			name = row.strip()
		elif isinstance(row, dict):
			name = str(row.get("item_group") or "").strip()
		else:
			name = str(getattr(row, "item_group", None) or "").strip()
		if not name or name in seen:
			continue
		seen.add(name)
		ordered.append(name)
	return ordered


def effective_store_groups(configured: Iterable[Any] | None = None) -> list[str]:
	names = group_names_from_rows(configured)
	return names if names else list(CANONICAL_LEAF_GROUPS)


def effective_featured_groups(
	configured: Iterable[Any] | None = None,
	*,
	store_groups: Iterable[str] | None = None,
) -> list[str]:
	allowed = list(store_groups) if store_groups is not None else effective_store_groups()
	allowed_set = set(allowed)
	names = group_names_from_rows(configured)
	source = names if names else list(DEFAULT_FEATURED_GROUPS)
	return [name for name in source if name in allowed_set]


def ensure_item_groups():
	if not frappe.db.exists("DocType", "Item Group"):
		return

	root = get_root_of("Item Group")
	if not root:
		frappe.throw("Le groupe racine « Item Group » est introuvable.")

	for row in ITEM_GROUPS:
		name = row["item_group_name"]
		parent = row["parent_item_group"] or root
		is_group = 1 if row["is_group"] else 0
		if frappe.db.exists("Item Group", name):
			doc = frappe.get_doc("Item Group", name)
			changed = False
			if not _cint_equal(doc.is_group, is_group):
				doc.is_group = is_group
				changed = True
			if doc.parent_item_group != parent:
				doc.parent_item_group = parent
				changed = True
			if changed:
				doc.save(ignore_permissions=True)
			continue
		frappe.get_doc(
			{
				"doctype": "Item Group",
				"item_group_name": name,
				"is_group": is_group,
				"parent_item_group": parent,
			}
		).insert(ignore_permissions=True)


def _cint_equal(left, right) -> bool:
	return int(left or 0) == int(right or 0)
