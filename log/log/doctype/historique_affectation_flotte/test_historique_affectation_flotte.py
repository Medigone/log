import unittest
from unittest.mock import patch

import frappe

from log.log.doctype.historique_affectation_flotte.historique_affectation_flotte import (
	HistoriqueAffectationFlotte,
)


class TestHistoriqueAffectationFlotte(unittest.TestCase):
	def test_validate_blocks_update(self):
		doc = object.__new__(HistoriqueAffectationFlotte)
		doc.flags = frappe._dict()
		with (
			patch.object(HistoriqueAffectationFlotte, "is_new", return_value=False),
			patch.object(frappe, "throw", side_effect=frappe.ValidationError),
		):
			with self.assertRaises(frappe.ValidationError):
				doc.validate()

	def test_on_trash_blocks_delete(self):
		doc = object.__new__(HistoriqueAffectationFlotte)
		doc.flags = frappe._dict()
		with patch.object(frappe, "throw", side_effect=frappe.ValidationError):
			with self.assertRaises(frappe.ValidationError):
				doc.on_trash()
