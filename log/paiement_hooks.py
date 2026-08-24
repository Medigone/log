# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.exceptions import ValidationError


def update_livraison_totals_on_paiement_change(doc, method=None):
	if not doc.livraison:
		return
	try:
		if frappe.db.exists("Livraison", doc.livraison):
			livraison_doc = frappe.get_doc("Livraison", doc.livraison)
			livraison_doc.calculate_totals()
			livraison_doc.save(ignore_permissions=True)
	except Exception:
		frappe.log_error(title="Paiement Hook Error", message=frappe.get_traceback())


def validate_paiement_client(doc, method=None):
	if doc.montant <= 0:
		frappe.throw(_("Le montant du paiement doit être supérieur à zéro."), exc=ValidationError)

	if doc.livraison:
		livraison_doc = frappe.get_doc("Livraison", doc.livraison)
		if livraison_doc.status == "Annulé":
			frappe.throw(_("Impossible d'effectuer un paiement pour une livraison annulée."), exc=ValidationError)

		if doc.client and not _client_has_bl_in_livraison(doc):
			frappe.throw(_("Le client sélectionné n'a aucun bon de livraison dans cette tournée."))


def _client_has_bl_in_livraison(doc):
	if not doc.livraison or not doc.client:
		return False
	livraison_doc = frappe.get_doc("Livraison", doc.livraison)
	bl_names = [row.bon_de_livraison for row in livraison_doc.bons_de_livraison if row.bon_de_livraison]
	if not bl_names:
		return False
	return bool(
		frappe.get_all(
			"Delivery Note",
			filters={"name": ["in", bl_names], "customer": doc.client},
			limit=1,
		)
	)
