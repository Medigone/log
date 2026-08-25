# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class CaisseLivreur(Document):
	def validate(self):
		if self.livreur and not self.nom_livreur:
			self.nom_livreur = frappe.db.get_value("Livreur", self.livreur, "nom")
