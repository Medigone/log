# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class Livreur(Document):
	def after_insert(self):
		from log.services.distribution_driver_cash import ensure_cash_box

		ensure_cash_box(self.name)
