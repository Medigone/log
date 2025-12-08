# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _


class PaiementClient(Document):

	def get_delivery_notes_from_livraison(self):
		"""Get all delivery notes associated with this livraison."""
		if not self.livraison:
			return []
		
		# Get all delivery notes from the livraison
		livraison_doc = frappe.get_doc("Livraison", self.livraison)
		delivery_notes = []
		
		# Check if livraison has bons_de_livraison field
		if hasattr(livraison_doc, 'bons_de_livraison'):
			for dn in livraison_doc.bons_de_livraison:
				if dn.bon_de_livraison:
					delivery_notes.append(dn.bon_de_livraison)
		
		return delivery_notes

	@frappe.whitelist()
	def get_available_delivery_notes_for_livraison(self):
		"""Get list of delivery notes available for payment in the selected livraison."""
		if not self.livraison or not self.client:
			return []
		
		# Get delivery notes from livraison
		delivery_notes = self.get_delivery_notes_from_livraison()
		if not delivery_notes:
			return []
		
		# Get delivery notes for this client
		dn_list = frappe.get_all("Delivery Note",
			filters={
				"name": ["in", delivery_notes],
				"customer": self.client
			},
			fields=["name", "customer", "grand_total", "status"]
		)
		
		return dn_list
