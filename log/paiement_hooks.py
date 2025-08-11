# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.exceptions import ValidationError

def update_livraison_totals_on_paiement_change(doc, method):
	"""Update livraison totals when a paiement client is created, updated or deleted."""
	if doc.livraison:
		try:
			# Log for debugging
			frappe.logger().info(f"Paiement hook triggered: method={method}, livraison={doc.livraison}")
			
			# Check if livraison still exists
			if frappe.db.exists("Livraison", doc.livraison):
				livraison_doc = frappe.get_doc("Livraison", doc.livraison)
				livraison_doc.calculate_totals()
				livraison_doc.save(ignore_permissions=True)
				frappe.logger().info(f"Livraison totals updated successfully for {doc.livraison}")
			else:
				frappe.logger().warning(f"Livraison {doc.livraison} not found during paiement hook")
		except Exception as e:
			frappe.log_error(f"Error updating livraison totals from paiement hook: {str(e)}", "Paiement Hook Error")
			frappe.logger().error(f"Hook error: {str(e)}")

def validate_paiement_client(doc, method):
	"""Validate the payment."""
	# Validate amount
	if doc.montant <= 0:
		frappe.throw(_("Le montant du paiement doit être supérieur à zéro."), exc=ValidationError)
	
	# Validate livraison if specified
	if doc.livraison:
		# Check if livraison is not cancelled
		livraison_doc = frappe.get_doc("Livraison", doc.livraison)
		if livraison_doc.status == "Annulé":
			frappe.throw(_("Impossible d'effectuer un paiement pour une livraison annulée."), exc=ValidationError)
		
		# Validate client has colis in this livraison
		if doc.client:
			client_has_colis = _check_client_has_colis_in_livraison(doc)
			if not client_has_colis:
				frappe.throw(_("Le client sélectionné n'a aucun colis dans cette livraison."), exc=ValidationError)

def _check_client_has_colis_in_livraison(doc):
	"""Check if the selected client has any colis in the selected livraison."""
	if not doc.livraison or not doc.client:
		return False
	
	# Get all colis for this livraison and client
	colis_list = frappe.get_all("Colis", 
		filters={
			"bl": ["in", _get_delivery_notes_from_livraison(doc)],
			"client": doc.client
		},
		fields=["name"]
	)
	
	return len(colis_list) > 0

def _get_delivery_notes_from_livraison(doc):
	"""Get all delivery notes from the selected livraison."""
	if not doc.livraison:
		return []
	
	livraison_doc = frappe.get_doc("Livraison", doc.livraison)
	return [row.bon_de_livraison for row in livraison_doc.bons_de_livraison if row.bon_de_livraison]