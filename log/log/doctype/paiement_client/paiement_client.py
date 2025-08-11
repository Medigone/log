# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


import frappe
from frappe.model.document import Document
from frappe import _
from frappe.exceptions import ValidationError

class PaiementClient(Document):

	
	def check_client_has_colis_in_livraison(self):
		"""Check if the selected client has any colis in the selected livraison."""
		if not self.livraison or not self.client:
			return False
		
		# Get all colis for this livraison and client
		colis_list = frappe.get_all("Colis", 
			filters={
				"bl": ["in", self.get_delivery_notes_from_livraison()],
				"client": self.client
			},
			fields=["name"]
		)
		
		return len(colis_list) > 0
	
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
	def get_available_colis_for_livraison(self):
		"""Get list of colis available for payment in the selected livraison."""
		if not self.livraison or not self.client:
			return []
		
		# Get delivery notes from livraison
		delivery_notes = self.get_delivery_notes_from_livraison()
		if not delivery_notes:
			return []
		
		# Get colis for this client in these delivery notes
		colis_list = frappe.get_all("Colis",
			filters={
				"bl": ["in", delivery_notes],
				"client": self.client
			},
			fields=["name", "custom_numero_sequence", "status", "bl"]
		)
		
		return colis_list
