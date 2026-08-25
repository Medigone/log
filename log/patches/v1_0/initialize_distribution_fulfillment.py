"""Initialise le cycle stock/facturation/caisse sans poster d'écriture rétroactive."""

import frappe
from frappe.utils import now_datetime


def execute():
	from log.install import ensure_distribution_roles

	ensure_distribution_roles()
	if frappe.db.table_exists("tabPaiement Client") and frappe.db.has_column("Paiement Client", "statut_controle"):
		frappe.db.sql(
			"""
			UPDATE `tabPaiement Client`
			SET statut_controle = 'À contrôler'
			WHERE COALESCE(statut_controle, '') IN ('', 'Déclaré')
			"""
		)
	if not frappe.db.table_exists("tabLivraison") or not frappe.db.has_column("Livraison", "statut_chargement"):
		return
	for route in frappe.get_all(
		"Livraison",
		filters={"etat_planification": ["in", ["En cours", "Retour dépôt", "Contrôle caisse"]]},
		fields=["name", "livreur", "vehicule"],
	):
		if frappe.db.get_value("Livraison", route.name, "stock_entry_chargement"):
			continue
		stops = frappe.get_all(
			"Livraison Bon de Livraison", filters={"parent": route.name}, pluck="bon_de_livraison", order_by="idx asc"
		)
		anomalous = [
			name
			for name in stops
			if frappe.db.get_value("Delivery Note", name, "custom_statut") in {"Enlevé", "Partiellement Livré", "Livré"}
		]
		if not anomalous:
			continue
		frappe.db.set_value(
			"Livraison",
			route.name,
			{
				"statut_chargement": "Exception",
				"a_revalider": 1,
				"motif_reouverture": "Chargement historique à régulariser avant clôture.",
			},
			update_modified=False,
		)
		if not frappe.db.exists(
			"Exception Distribution",
			{"tournee": route.name, "type_exception": "Régularisation historique", "statut": ["in", ["Ouverte", "En traitement"]]},
		):
			frappe.get_doc(
				{
					"doctype": "Exception Distribution",
					"statut": "Ouverte",
					"type_exception": "Régularisation historique",
					"priorite": "Critique",
					"date_signalement": now_datetime(),
					"signalee_par": "Administrator",
					"bon_de_livraison": anomalous[0],
					"tournee": route.name,
					"livreur": route.livreur,
					"vehicule": route.vehicule,
					"description": "Aucun Stock Entry de chargement n'est lié à cette tournée active.",
				}
			).insert(ignore_permissions=True)
