# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

from frappe.model.document import Document
from frappe.utils import getdate


class ObjectifPilotage(Document):
	"""Objectifs mensuels du responsable : CA HT, marge brute, encaissements."""

	def before_naming(self):
		self._normalize_month()

	def validate(self):
		self._normalize_month()

	def _normalize_month(self):
		month = getdate(self.mois).replace(day=1)
		self.mois = str(month)
		self.cle_mois = month.strftime("%Y-%m")
