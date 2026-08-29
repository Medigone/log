import frappe
from frappe.model.document import Document


class HistoriqueAffectationFlotte(Document):
	def before_insert(self):
		self.utilisateur = self.utilisateur or frappe.session.user
		self.date_evenement = self.date_evenement or frappe.utils.now_datetime()
		self.source = self.source or "Distribution"

	def validate(self):
		if not self.is_new() and not getattr(self.flags, "allow_fleet_history_update", False):
			frappe.throw("L'historique d'affectation est immuable.")

	def on_trash(self):
		if not getattr(self.flags, "allow_fleet_history_delete", False):
			frappe.throw("L'historique d'affectation ne peut pas être supprimé.")
