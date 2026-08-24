# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

from datetime import datetime

import frappe
from frappe.model.document import Document


class Livraison(Document):
	def autoname(self):
		now = datetime.now()
		prefix = f"LIV-{now.strftime('%y')}-{now.strftime('%m')}-"
		existing = frappe.db.sql(
			"""
			SELECT name FROM `tabLivraison`
			WHERE name LIKE %s
			ORDER BY name DESC
			LIMIT 1
			""",
			(prefix + "%",),
		)
		if existing and existing[0][0]:
			try:
				next_seq = int(existing[0][0].split("-")[-1]) + 1
			except (ValueError, IndexError):
				next_seq = 1
		else:
			next_seq = 1
		self.name = f"{prefix}{next_seq:05d}"

	def validate(self):
		self.calculate_totals()
		self.refresh_status_from_delivery_notes()

	def before_save(self):
		self.calculate_totals()

	def calculate_totals(self):
		self.nombre_bons_de_livraison = len(self.bons_de_livraison) if self.bons_de_livraison else 0

		total_articles = 0
		total_montant = 0
		for bon_row in self.bons_de_livraison or []:
			total_articles += bon_row.total_qty or 0
			total_montant += bon_row.grand_total or 0
		self.total_articles = total_articles
		self.total_montant_a_encaisser = total_montant

		total_paiements = 0
		if self.name:
			for paiement in frappe.get_all("Paiement Client", filters={"livraison": self.name}, fields=["montant"]):
				total_paiements += paiement.montant or 0
		self.total_paiements = total_paiements
		self.solde_restant = (self.total_montant_a_encaisser or 0) - total_paiements

	def refresh_status_from_delivery_notes(self):
		from log.livraison_hooks import calculate_livraison_status_from_dns

		self.status = calculate_livraison_status_from_dns(self)

	def auto_load_delivery_notes_by_date(self):
		if not self.date_liv:
			return

		delivery_notes = frappe.db.sql(
			"""
			SELECT
				dn.name, dn.customer, dn.custom_date_de_livraison,
				dn.custom_commune, dn.custom_wilaya, dn.total_qty,
				dn.grand_total, dn.status, dn.custom_type, dn.custom_statut
			FROM `tabDelivery Note` dn
			WHERE dn.custom_date_de_livraison = %s
			AND dn.docstatus < 2
			AND NOT EXISTS (
				SELECT 1 FROM `tabLivraison Bon de Livraison` lbdl
				JOIN `tabLivraison` l ON lbdl.parent = l.name
				WHERE lbdl.bon_de_livraison = dn.name
				AND l.name != %s
				AND l.docstatus < 2
			)
			""",
			(self.date_liv, self.name or "NEW"),
			as_dict=True,
		)

		self.bons_de_livraison = []
		for dn in delivery_notes:
			self.append(
				"bons_de_livraison",
				{
					"bon_de_livraison": dn.name,
					"customer": dn.customer,
					"custom_date_de_livraison": dn.custom_date_de_livraison,
					"custom_commune": dn.custom_commune,
					"custom_wilaya": dn.custom_wilaya,
					"total_qty": dn.total_qty,
					"grand_total": dn.grand_total,
					"status": dn.custom_statut or dn.status,
					"type": dn.custom_type,
				},
			)

	@frappe.whitelist()
	def load_delivery_notes(self):
		self.auto_load_delivery_notes_by_date()
		self.calculate_totals()
		return True
