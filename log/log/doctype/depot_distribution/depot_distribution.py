# Copyright (c) 2025, Amine Melizi and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DepotDistribution(Document):
	def validate(self):
		"""Assure qu'il n'y a qu'un seul dépôt principal."""
		if self.is_default:
			# Désactiver tous les autres dépôts principaux
			frappe.db.sql(
				"UPDATE `tabDepot Distribution` SET is_default=0 WHERE name!=%s",
				self.name
			)