# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class MouvementCaisseLivreur(Document):
	def before_insert(self):
		self.date = self.date or now_datetime()
		if self.caisse and not self.livreur:
			self.livreur = frappe.db.get_value("Caisse Livreur", self.caisse, "livreur")
