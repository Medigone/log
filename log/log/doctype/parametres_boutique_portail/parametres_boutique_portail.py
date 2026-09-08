# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import cint

from log.setup.item_groups import effective_store_groups, group_names_from_rows


class ParametresBoutiquePortail(Document):
	def validate(self):
		if cint(self.rail_limit) < 1:
			frappe.throw("Le nombre d'articles par rayon doit être au moins 1.")
		if cint(self.rail_limit) > 24:
			frappe.throw("Le nombre d'articles par rayon ne peut pas dépasser 24.")
		self._validate_unique_groups("store_groups")
		self._validate_unique_groups("featured_groups")
		allowed = set(effective_store_groups(self.get("store_groups")))
		for name in group_names_from_rows(self.get("featured_groups")):
			if name not in allowed:
				frappe.throw(f"Le groupe {name} n'est pas dans les rayons du Store.")

	def _validate_unique_groups(self, fieldname: str):
		seen = set()
		for row in self.get(fieldname) or []:
			if not row.item_group:
				continue
			if row.item_group in seen:
				frappe.throw(f"Le groupe {row.item_group} est déjà présent.")
			seen.add(row.item_group)

	def on_change(self):
		from log.services.portal_merchandising import clear_storefront_cache

		clear_storefront_cache()
