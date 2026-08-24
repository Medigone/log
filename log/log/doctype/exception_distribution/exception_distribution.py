import frappe
from frappe.model.document import Document


class ExceptionDistribution(Document):
	def before_insert(self):
		self.signalee_par = self.signalee_par or frappe.session.user
		self.date_signalement = self.date_signalement or frappe.utils.now_datetime()

	def validate(self):
		if self.statut == "Résolue" and not self.resolution:
			frappe.throw("La résolution est obligatoire.")

