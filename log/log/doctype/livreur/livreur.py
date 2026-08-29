# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class Livreur(Document):
	def after_insert(self):
		from log.services.distribution_driver_cash import ensure_cash_box

		ensure_cash_box(self.name)
		if self.vehicule:
			self._sync_fleet_assignment(previous_vehicle=None)

	def on_update(self):
		if getattr(self.flags, "fleet_assignment_sync", False):
			return
		if not self.has_value_changed("vehicule"):
			return
		before = self.get_doc_before_save()
		self._sync_fleet_assignment(previous_vehicle=before.vehicule if before else None)

	def _sync_fleet_assignment(self, *, previous_vehicle):
		if getattr(self.flags, "fleet_assignment_sync", False):
			return
		from log.services.distribution_fleet import assign_driver_vehicle

		assign_driver_vehicle(
			self.name,
			self.vehicule or None,
			source="Desk",
			previous_vehicle=previous_vehicle,
		)
