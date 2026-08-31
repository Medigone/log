# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

ALLOWED_TRANSITIONS = {
	"Ouverte": frozenset({"Ouverte", "En cours", "Refusée", "Commande créée"}),
	"En cours": frozenset({"En cours", "Refusée", "Commande créée"}),
	"Commande créée": frozenset({"Commande créée"}),
	"Refusée": frozenset({"Refusée"}),
}


class DemandeHorsCatalogue(Document):
	def validate(self):
		self._validate_lines()
		self._validate_status()
		if self.statut == "Refusée" and not (self.motif_refus or "").strip():
			frappe.throw(_("Le motif de refus est obligatoire."))
		if self.statut == "Commande créée" and not self.commande:
			frappe.throw(_("Une commande doit être liée avant de passer au statut Commande créée."))

	def _validate_lines(self):
		rows = self.get("articles") or []
		if not rows:
			frappe.throw(_("Ajoutez au moins un article à la demande."))
		if len(rows) > 20:
			frappe.throw(_("Une demande ne peut pas contenir plus de 20 articles."))
		for row in rows:
			if not (row.designation or "").strip():
				frappe.throw(_("La désignation est obligatoire sur chaque ligne."))
			if flt(row.quantite) <= 0:
				frappe.throw(_("La quantité doit être supérieure à zéro."))

	def _validate_status(self):
		previous = self.get_doc_before_save()
		if not previous:
			if self.statut not in {"Ouverte", "En cours"}:
				frappe.throw(_("Une nouvelle demande doit être ouverte."))
			return
		allowed = ALLOWED_TRANSITIONS.get(previous.statut) or frozenset()
		if self.statut not in allowed:
			frappe.throw(_("Impossible de passer de {0} à {1}.").format(previous.statut, self.statut))
