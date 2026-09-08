# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Marques produit Modern Pharma, créées à l’installation du site."""

from __future__ import annotations

import frappe

BRANDS = (
	"BIOMIL",
	"COMPY",
	"AVENE",
	"ACM",
	"VICHY",
	"NIVEA",
	"CHICCO",
	"COTIFLEX",
	"ROSSMAX",
	"BIOMAX",
	"NUTRICIA",
)


def ensure_brands():
	if not frappe.db.exists("DocType", "Brand"):
		return

	for name in BRANDS:
		if frappe.db.exists("Brand", name):
			continue
		frappe.get_doc({"doctype": "Brand", "brand": name}).insert(ignore_permissions=True)
