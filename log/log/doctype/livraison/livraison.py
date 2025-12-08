# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _
from datetime import datetime


class Livraison(Document):

	def autoname(self):
		"""Generate name in format LIV-.YY.-.MM.-.#####"""
		now = datetime.now()
		year = now.strftime("%y")
		month = now.strftime("%m")
		
		# Get the next sequence number for this year and month
		prefix = f"LIV-{year}-{month}-"
		
		# Find the highest existing sequence number for this prefix
		existing = frappe.db.sql("""
			SELECT name FROM `tabLivraison`
			WHERE name LIKE %s
			ORDER BY name DESC
			LIMIT 1
		""", (prefix + "%",))
		
		if existing and existing[0][0]:
			# Extract the sequence number from the last name
			last_name = existing[0][0]
			try:
				last_seq = int(last_name.split("-")[-1])
				next_seq = last_seq + 1
			except (ValueError, IndexError):
				next_seq = 1
		else:
			next_seq = 1
		
		# Format sequence number with 5 digits
		self.name = f"{prefix}{next_seq:05d}"

	def validate(self):
		"""Validate the document and calculate totals."""
		self.calculate_totals()

	def before_save(self):
		"""Calculate totals before saving."""
		self.calculate_totals()

	def calculate_totals(self):
		"""Calculate nombre bons de livraison, total articles, total amount to collect, total payments and remaining balance."""
		# Calculate nombre bons de livraison
		self.nombre_bons_de_livraison = len(self.bons_de_livraison) if self.bons_de_livraison else 0
		
		# Calculate total articles from bons de livraison total_qty
		total_articles = 0
		for bon_row in self.bons_de_livraison or []:
			if bon_row.total_qty:
				total_articles += bon_row.total_qty
		self.total_articles = total_articles
		
		# Calculate total amount to collect from bons de livraison grand_total
		total_montant = 0
		for bon_row in self.bons_de_livraison or []:
			if bon_row.grand_total:
				total_montant += bon_row.grand_total
		self.total_montant_a_encaisser = total_montant
		
		# Calculate total payments from Paiement Client doctype
		total_paiements = 0
		paiements = frappe.get_all("Paiement Client", 
			filters={"livraison": self.name}, 
			fields=["montant"]
		)
		for paiement in paiements:
			if paiement.montant:
				total_paiements += paiement.montant
		self.total_paiements = total_paiements
		
		# Calculate remaining balance
		self.solde_restant = self.total_montant_a_encaisser - self.total_paiements
	
	def auto_load_delivery_notes_by_date(self):
		"""Automatically load delivery notes that match the livraison date and are not already assigned."""
		if not self.date_liv:
			return
		
		# Get delivery notes with matching custom_date_de_livraison that are NOT already assigned to other livraisons
		delivery_notes = frappe.db.sql("""
			SELECT 
				dn.name, dn.customer, dn.custom_date_de_livraison, 
				dn.custom_commune, dn.custom_wilaya, dn.total_qty, 
				dn.grand_total, dn.status, dn.custom_type
			FROM `tabDelivery Note` dn
			WHERE dn.custom_date_de_livraison = %s
			AND dn.docstatus = 0  # Seulement les bons non soumis
			AND NOT EXISTS (
				SELECT 1 FROM `tabLivraison Bon de Livraison` lbdl
				JOIN `tabLivraison` l ON lbdl.parent = l.name
				WHERE lbdl.bon_de_livraison = dn.name
				AND l.name != %s  # Exclure la livraison actuelle
				AND l.docstatus < 2  # Exclure les livraisons supprimées
			)
		""", (self.date_liv, self.name or "NEW"), as_dict=True)
		
		# Clear existing delivery notes
		self.bons_de_livraison = []
		
		# Add found delivery notes to the child table
		for dn in delivery_notes:
			self.append("bons_de_livraison", {
				"bon_de_livraison": dn.name,
				"customer": dn.customer,
				"custom_date_de_livraison": dn.custom_date_de_livraison,
				"custom_commune": dn.custom_commune,
				"custom_wilaya": dn.custom_wilaya,
				"total_qty": dn.total_qty,
				"grand_total": dn.grand_total,
				"status": dn.status,
				"type": dn.custom_type
			})

	@frappe.whitelist()
	def load_delivery_notes(self):
		"""Load delivery notes for this livraison."""
		# This method can be called from frontend to populate delivery notes
		pass
	
	@frappe.whitelist()
	def get_client_summary(self):
		"""Get summary of amounts by client for this livraison."""
		client_summary = {}
		
		# Calculate amounts to collect by client from bons de livraison
		for bon_row in self.bons_de_livraison or []:
			client = bon_row.customer
			if client:
				if client not in client_summary:
					client_summary[client] = {
						"client": client,
						"montant_a_encaisser": 0,
						"montant_paye": 0,
						"solde": 0,
						"bons_count": 0
					}
				client_summary[client]["montant_a_encaisser"] += bon_row.grand_total or 0
				client_summary[client]["bons_count"] += 1
		
		# Calculate payments by client from Paiement Client
		paiements = frappe.get_all("Paiement Client",
			filters={"livraison": self.name},
			fields=["client", "montant"]
		)
		for paiement in paiements:
			client = paiement.client
			if client and client in client_summary:
				client_summary[client]["montant_paye"] += paiement.montant or 0
		
		# Calculate balance for each client
		for client in client_summary:
			client_summary[client]["solde"] = client_summary[client]["montant_a_encaisser"] - client_summary[client]["montant_paye"]
		
		return list(client_summary.values())
