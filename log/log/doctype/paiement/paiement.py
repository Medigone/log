# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


import frappe
from frappe.model.document import Document
from frappe import _
from frappe.exceptions import ValidationError

class Paiement(Document):
	def validate(self):
		"""Validate the payment amount."""
		if self.montant <= 0:
			frappe.throw(_("Le montant du paiement doit être supérieur à zéro."), exc=ValidationError)
