# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def update_livraisons_on_delivery_note_change(doc, method=None):
	if not doc.get("__islocal") and doc.has_value_changed("custom_statut"):
		update_livraison_status_from_delivery_note(doc.name)


def remove_delivery_note_from_livraisons(delivery_note_name, delivery_date):
	livraisons = frappe.get_all(
		"Livraison",
		filters={"date_liv": delivery_date, "docstatus": 0},
		fields=["name", "batch_id"],
	)
	for livraison in livraisons:
		if livraison.batch_id:
			continue
		try:
			livraison_doc = frappe.get_doc("Livraison", livraison.name)
			livraison_doc.bons_de_livraison = [
				row for row in livraison_doc.bons_de_livraison if row.bon_de_livraison != delivery_note_name
			]
			livraison_doc.calculate_totals()
			livraison_doc.save()
		except Exception:
			frappe.log_error(title=f"Retrait BL {delivery_note_name} de {livraison.name}", message=frappe.get_traceback())


def add_delivery_note_to_livraisons(delivery_note_name, delivery_date):
	bon_info = frappe.get_doc("Delivery Note", delivery_note_name)
	livraisons = frappe.get_all(
		"Livraison",
		filters={"date_liv": delivery_date, "docstatus": 0},
		fields=["name", "batch_id"],
	)
	if not livraisons:
		return
	for livraison in livraisons:
		if livraison.batch_id:
			continue
		try:
			livraison_doc = frappe.get_doc("Livraison", livraison.name)
			existing = [row.bon_de_livraison for row in livraison_doc.bons_de_livraison]
			if delivery_note_name not in existing:
				livraison_doc.append(
					"bons_de_livraison",
					{
						"bon_de_livraison": delivery_note_name,
						"customer": bon_info.customer,
						"custom_date_de_livraison": bon_info.custom_date_de_livraison,
						"custom_commune": bon_info.custom_commune,
						"custom_wilaya": bon_info.custom_wilaya,
						"total_qty": bon_info.total_qty,
						"grand_total": bon_info.grand_total,
						"status": bon_info.get("custom_statut") or bon_info.status,
					},
				)
				livraison_doc.calculate_totals()
				livraison_doc.save()
		except Exception:
			frappe.log_error(title=f"Ajout BL {delivery_note_name} à {livraison.name}", message=frappe.get_traceback())


def remove_deleted_delivery_note(doc, method=None):
	if doc.custom_date_de_livraison:
		remove_delivery_note_from_livraisons(doc.name, doc.custom_date_de_livraison)


def update_livraison_on_date_change(doc, method=None):
	if not doc.get("__islocal") and doc.has_value_changed("date_liv"):
		if doc.batch_id:
			return
		if doc.date_liv and not doc.bons_de_livraison:
			doc.auto_load_delivery_notes_by_date()
		elif not doc.date_liv:
			doc.bons_de_livraison = []
		if not doc.batch_id:
			doc.calculate_totals()


def update_delivery_notes_on_livraison_change(doc, method=None):
	if doc.get("__islocal") or not doc.has_value_changed("livreur"):
		return
	for bon_row in doc.bons_de_livraison or []:
		if not bon_row.bon_de_livraison:
			continue
		try:
			delivery_note = frappe.get_doc("Delivery Note", bon_row.bon_de_livraison)
			delivery_note.custom_livreur = doc.livreur
			if doc.livreur:
				livreur_doc = frappe.get_doc("Livreur", doc.livreur)
				delivery_note.custom_nom_livreur = livreur_doc.nom
				delivery_note.custom_véhicule = livreur_doc.vehicule
			else:
				delivery_note.custom_nom_livreur = None
				delivery_note.custom_véhicule = None
			delivery_note.save()
		except Exception:
			frappe.log_error(
				title=f"Maj livreur BL {bon_row.bon_de_livraison}",
				message=frappe.get_traceback(),
			)


def update_livraison_status_from_delivery_note(delivery_note_name):
	parents = frappe.db.sql(
		"""
		SELECT DISTINCT parent
		FROM `tabLivraison Bon de Livraison`
		WHERE bon_de_livraison = %s AND parenttype = 'Livraison'
		""",
		(delivery_note_name,),
		as_dict=True,
	)
	for row in parents:
		try:
			livraison_doc = frappe.get_doc("Livraison", row.parent)
			new_status = calculate_livraison_status_from_bls(livraison_doc)
			if livraison_doc.status != new_status:
				livraison_doc.db_set("status", new_status)
		except Exception:
			frappe.log_error(title=f"Maj statut {row.parent}", message=frappe.get_traceback())


def after_insert_livraison(doc, method=None):
	if doc.batch_id:
		return
	if doc.date_liv:
		doc.auto_load_delivery_notes_by_date()
		doc.calculate_totals()
		doc.save()


def validate_livraison(doc, method=None):
	doc.calculate_totals()


def calculate_livraison_status_from_dns(livraison_doc):
	return calculate_livraison_status_from_bls(livraison_doc)


def calculate_livraison_status_from_bls(livraison_doc):
	statuses = []
	for row in livraison_doc.bons_de_livraison or []:
		if not row.bon_de_livraison:
			continue
		status = frappe.db.get_value("Delivery Note", row.bon_de_livraison, "custom_statut") or "Nouveau"
		statuses.append(status)

	if not statuses:
		return "Nouveau"

	total = len(statuses)
	livres = statuses.count("Livré")
	partiels = statuses.count("Partiellement Livré")
	enleves = statuses.count("Enlevé")
	prepares = statuses.count("Préparé")
	annules = statuses.count("Annulé")

	if livres == total:
		return "Livré"
	if livres > 0 or partiels > 0:
		return "Partiellement Livré"
	if enleves == total:
		return "Enlevé"
	if enleves > 0:
		return "Partiellement Enlevé"
	if prepares == total:
		return "Préparé"
	if prepares > 0:
		return "Partiellement Préparé"
	if annules == total:
		return "Annulé"
	return "Nouveau"
