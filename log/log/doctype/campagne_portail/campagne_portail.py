# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class CampagnePortail(Document):
	def validate(self):
		from log.services.portal_merchandising import validate_campaign

		validate_campaign(self)

	def on_change(self):
		from log.services.portal_merchandising import clear_storefront_cache

		clear_storefront_cache()
