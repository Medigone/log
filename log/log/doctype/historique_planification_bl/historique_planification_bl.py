import frappe
from frappe.model.document import Document


class HistoriquePlanificationBL(Document):
	def before_insert(self):
		self.utilisateur = self.utilisateur or frappe.session.user
		self.date_evenement = self.date_evenement or frappe.utils.now_datetime()

	def validate(self):
		if not self.is_new() and not getattr(self.flags, "allow_distribution_update", False):
			frappe.throw("L'historique de planification est immuable.")

	def on_trash(self):
		if not getattr(self.flags, "allow_distribution_delete", False):
			frappe.throw("L'historique de planification ne peut pas être supprimé.")
