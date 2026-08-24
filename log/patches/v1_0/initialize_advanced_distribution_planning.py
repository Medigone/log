# Copyright (c) 2026, IntraPro and contributors

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.utils import cint


ACTIVE_STATES = {"Brouillon", "Publiée", "En cours"}


def _ensure_custom_fields():
	create_custom_fields(
		{
			"Delivery Note": [
				{"fieldname": "custom_tournee", "label": "Tournée actuelle", "fieldtype": "Link", "options": "Livraison", "insert_after": "custom_date_de_livraison", "read_only": 1, "allow_on_submit": 1},
				{"fieldname": "custom_date_planifiee", "label": "Date planifiée", "fieldtype": "Date", "insert_after": "custom_tournee", "read_only": 1, "allow_on_submit": 1},
				{"fieldname": "custom_statut_planification", "label": "Statut de planification", "fieldtype": "Select", "options": "Non planifié\nPlanifié\nPublié\nÀ revalider\nÀ repréparer\nEn cours\nTerminé\nException", "default": "Non planifié", "insert_after": "custom_date_planifiee", "read_only": 1, "allow_on_submit": 1},
				{"fieldname": "custom_revision_commande", "label": "Révision commande", "fieldtype": "Int", "default": "0", "insert_after": "custom_statut_planification", "read_only": 1, "allow_on_submit": 1},
				{"fieldname": "custom_motif_invalidation", "label": "Motif d'invalidation", "fieldtype": "Small Text", "insert_after": "custom_revision_commande", "read_only": 1, "allow_on_submit": 1},
				{"fieldname": "custom_affectation_suggeree", "label": "Affectation suggérée", "fieldtype": "JSON", "insert_after": "custom_motif_invalidation", "hidden": 1, "read_only": 1, "allow_on_submit": 1},
			],
			"Sales Order": [
				{"fieldname": "custom_distribution_revision", "label": "Révision Distribution", "fieldtype": "Int", "default": "0", "insert_after": "delivery_date", "hidden": 1, "read_only": 1, "allow_on_submit": 1},
			],
		},
		update=True,
	)


def execute():
	"""Reprend les affectations existantes sans toucher aux tournées historiques ni aux QR."""
	_ensure_custom_fields()
	if not frappe.db.has_column("Livraison", "revision"):
		return

	for row in frappe.get_all(
		"Livraison",
		fields=[
			"name", "date_liv", "etat_planification", "livreur", "vehicule",
			"depart_prevu", "fin_prevue", "revision", "revision_publiee",
		],
		order_by="creation asc",
	):
		state = row.etat_planification or "Brouillon"
		values = {"revision": max(cint(row.revision), 1)}
		if state in ACTIVE_STATES and (not row.depart_prevu or not row.fin_prevue):
			values.update(
				{
					"etat_planification": "Brouillon",
					"revision": max(cint(row.revision), 1) + 1,
					"revision_acceptee": 0,
					"accepte_par": None,
					"date_acceptation": None,
					"a_revalider": 1,
					"motif_reouverture": "Créneau à contrôler après migration du planning avancé.",
				}
			)
			state = "Brouillon"
		elif state == "Publiée" and not cint(row.revision_publiee):
			values["revision_publiee"] = values["revision"]
		frappe.db.set_value("Livraison", row.name, values, update_modified=False)

		planning_status = {
			"Brouillon": "Planifié",
			"Publiée": "Publié",
			"En cours": "En cours",
			"Terminée": "Terminé",
			"Annulée": "Non planifié",
		}.get(state, "Planifié")
		for delivery_note in frappe.get_all(
			"Livraison Bon de Livraison",
			filters={"parent": row.name},
			pluck="bon_de_livraison",
			order_by="idx asc",
		):
			if not delivery_note or not frappe.db.exists("Delivery Note", delivery_note):
				continue
			dn_values = {
				"custom_tournee": row.name if state != "Annulée" else None,
				"custom_date_planifiee": row.date_liv if state != "Annulée" else None,
				"custom_statut_planification": planning_status,
				"custom_livreur": row.livreur if state != "Annulée" else None,
				"custom_véhicule": row.vehicule if state != "Annulée" else None,
			}
			frappe.db.set_value("Delivery Note", delivery_note, dn_values, update_modified=False)

	frappe.db.sql(
		"""
		UPDATE `tabDelivery Note`
		SET custom_statut_planification = 'Non planifié'
		WHERE COALESCE(custom_statut_planification, '') = ''
		"""
	)
