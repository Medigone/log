"""Remplace le ciblage Territory des campagnes portail par Wilaya."""

import frappe
from frappe.utils import cstr


def execute():
	if not frappe.db.table_exists("Campagne Portail Cible"):
		return
	rows = frappe.get_all(
		"Campagne Portail Cible",
		filters={"target_type": "Territory"},
		fields=["name", "parent", "target_value"],
	)
	for row in rows:
		value = cstr(row.target_value).strip()
		if not value:
			continue
		if frappe.db.exists("Wilaya", value):
			frappe.db.set_value(
				"Campagne Portail Cible",
				row.name,
				"target_type",
				"Wilaya",
				update_modified=False,
			)
			continue
		frappe.logger("log.patches").warning(
			"Cible campagne %s : Territory %s n'a pas d'équivalent Wilaya, ignorée.",
			row.parent,
			value,
		)
	from log.services.portal_merchandising import clear_storefront_cache

	clear_storefront_cache()
