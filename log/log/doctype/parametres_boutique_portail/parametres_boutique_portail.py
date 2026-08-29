# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import cint


class ParametresBoutiquePortail(Document):
	def validate(self):
		if cint(self.rail_limit) < 1:
			frappe.throw("Le nombre d'articles par rayon doit être au moins 1.")
		if cint(self.rail_limit) > 24:
			frappe.throw("Le nombre d'articles par rayon ne peut pas dépasser 24.")
		seen = set()
		for row in self.get("featured_groups") or []:
			if not row.item_group:
				continue
			if row.item_group in seen:
				frappe.throw(f"Le groupe {row.item_group} est déjà présent.")
			seen.add(row.item_group)

	def on_change(self):
		from log.services.portal_merchandising import clear_storefront_cache

		clear_storefront_cache()
