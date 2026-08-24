# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

from datetime import datetime

import frappe
from frappe.model.document import Document
from frappe.utils import cint, flt, get_datetime, getdate

from log.api.distribution_rules import can_transition_route, capacity_error, intervals_overlap

ACTIVE_ROUTE_STATES = ("Brouillon", "Publiée", "En cours")


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
		self.validate_distribution_route()
		self.calculate_totals()
		self.refresh_status_from_delivery_notes()

	def before_save(self):
		self.calculate_totals()

	def validate_distribution_route(self):
		if not self.meta.has_field("etat_planification"):
			return
		state = self.etat_planification or "Brouillon"
		self.revision = max(cint(self.revision), 1)
		before = self.get_doc_before_save()
		previous = before.etat_planification if before else None
		if previous and previous != state and not can_transition_route(previous, state):
			frappe.throw(f"Transition de tournée invalide : {previous} → {state}")
		if previous == "Publiée" and state == "Brouillon" and not self.motif_reouverture:
			frappe.throw("Le motif de remise en brouillon est obligatoire.")

		rows = [row.bon_de_livraison for row in self.bons_de_livraison or [] if row.bon_de_livraison]
		if len(rows) != len(set(rows)):
			frappe.throw("Un bon de livraison ne peut apparaître qu'une fois dans une tournée.")
		if state in ACTIVE_ROUTE_STATES:
			for delivery_note in rows:
				conflict = frappe.db.sql(
					"""
					SELECT l.name
					FROM `tabLivraison Bon de Livraison` child
					JOIN `tabLivraison` l ON l.name = child.parent
					WHERE child.bon_de_livraison = %s
					  AND l.name != %s
					  AND l.etat_planification IN (%s, %s, %s)
					  AND l.docstatus < 2
					LIMIT 1
					""",
					(delivery_note, self.name or "NEW", *ACTIVE_ROUTE_STATES),
				)
				if conflict:
					frappe.throw(f"Le bon {delivery_note} appartient déjà à la tournée {conflict[0][0]}.")

		if self.depart_prevu or self.fin_prevue:
			if not self.depart_prevu or not self.fin_prevue:
				frappe.throw("Le départ et la fin prévus doivent être renseignés ensemble.")
			if get_datetime(self.fin_prevue) <= get_datetime(self.depart_prevu):
				frappe.throw("La fin prévue doit être postérieure au départ prévu.")
			if self.date_liv and getdate(self.depart_prevu) != getdate(self.date_liv):
				frappe.throw("Le départ prévu doit correspondre à la date de la tournée.")

		if state in {"Publiée", "En cours"}:
			if not self.livreur or not self.vehicule or not rows or not self.depart_prevu or not self.fin_prevue:
				frappe.throw("Un créneau, un livreur, un véhicule et au moins un arrêt sont requis.")
			for other in frappe.get_all(
				"Livraison",
				filters={
					"name": ["!=", self.name or ""],
					"etat_planification": ["in", ["Publiée", "En cours"]],
					"docstatus": ["<", 2],
				},
				fields=["name", "livreur", "vehicule", "depart_prevu", "fin_prevue"],
			):
				if not other.depart_prevu or not other.fin_prevue:
					continue
				if not (other.livreur == self.livreur or other.vehicule == self.vehicule):
					continue
				if intervals_overlap(
					get_datetime(self.depart_prevu), get_datetime(self.fin_prevue),
					get_datetime(other.depart_prevu), get_datetime(other.fin_prevue),
				):
					frappe.throw(f"Le créneau chevauche la tournée {other.name}.")
			capacity_value = frappe.db.get_value("Vehicule", self.vehicule, "capacite_max_articles")
			capacity = cint(capacity_value) if capacity_value not in (None, "", 0) else None
			quantity = 0.0
			for row in self.bons_de_livraison or []:
				items = frappe.get_all(
					"Delivery Note Item",
					filters={"parent": row.bon_de_livraison},
					fields=["qty", "custom_quantite_livree"],
				)
				quantity += sum(max(flt(item.qty) - flt(item.custom_quantite_livree), 0) for item in items)
			error = capacity_error(capacity, quantity)
			if error:
				frappe.throw(error)

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
