# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Conditions de paiement standards proposées à la saisie des commandes client."""

from __future__ import annotations

import frappe

AFTER_INVOICE = "Day(s) after invoice date"

PAYMENT_TERMS = (
	{"payment_term_name": "Comptant", "credit_days": 0},
	{"payment_term_name": "30 jours", "credit_days": 30},
	{"payment_term_name": "60 jours", "credit_days": 60},
	{"payment_term_name": "90 jours", "credit_days": 90},
)

# (nom du modèle, [(terme, part en %)])
PAYMENT_TERMS_TEMPLATES = (
	("Comptant", (("Comptant", 100),)),
	("30 jours", (("30 jours", 100),)),
	("60 jours", (("60 jours", 100),)),
	("50 % comptant / 50 % 30 jours", (("Comptant", 50), ("30 jours", 50))),
)


def ensure_payment_terms():
	if not frappe.db.exists("DocType", "Payment Terms Template"):
		return

	credit_days = {}
	for term in PAYMENT_TERMS:
		credit_days[term["payment_term_name"]] = term["credit_days"]
		if frappe.db.exists("Payment Term", term["payment_term_name"]):
			continue
		frappe.get_doc(
			{
				"doctype": "Payment Term",
				"payment_term_name": term["payment_term_name"],
				"due_date_based_on": AFTER_INVOICE,
				"credit_days": term["credit_days"],
			}
		).insert(ignore_permissions=True)

	for template_name, terms in PAYMENT_TERMS_TEMPLATES:
		if frappe.db.exists("Payment Terms Template", template_name):
			continue
		frappe.get_doc(
			{
				"doctype": "Payment Terms Template",
				"template_name": template_name,
				"terms": [
					{
						"payment_term": term,
						"invoice_portion": portion,
						"due_date_based_on": AFTER_INVOICE,
						"credit_days": credit_days[term],
					}
					for term, portion in terms
				],
			}
		).insert(ignore_permissions=True)
