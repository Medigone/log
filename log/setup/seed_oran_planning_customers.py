# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

"""Clients de démo Oran, répartis sur plusieurs communes, pour tester la planification."""

from __future__ import annotations

import frappe
from frappe.utils import flt, today

from log.delivery_note_ops import _apply_named_status

COMPANY = "Modern Pharma"
CUSTOMER_GROUP = "Commercial"
TERRITORY = "Algeria"
WAREHOUSE = "Magasins - MP"
ITEM_CODE = "Article 1"
ITEM_RATE = 720

# nom, commune, lat, lng, téléphone, qty BL
CLIENTS = [
	("Pharmacie Saint-Michel", "Oran", 35.69710, -0.63370, "041 33 21 10", 8),
	("Pharmacie El Bahia", "Oran", 35.70540, -0.64120, "041 40 18 44", 12),
	("Pharmacie du Plateau", "Oran", 35.69180, -0.64190, "041 35 62 07", 6),
	("Pharmacie Bir El Djir", "Bir El Djir", 35.72010, -0.55540, "041 50 22 91", 10),
	("Pharmacie USTO", "Bir El Djir", 35.70480, -0.57960, "041 51 73 28", 14),
	("Pharmacie Es Senia", "Es Senia", 35.64790, -0.62380, "041 82 14 55", 9),
	("Pharmacie Ain Turk", "Ain Turk", 35.74390, -0.76940, "041 46 30 12", 7),
	("Pharmacie Arzew Centre", "Arzew", 35.85610, -0.31190, "041 37 41 80", 16),
	("Pharmacie Gdyel", "Gdyel", 35.78330, -0.42640, "041 89 20 63", 5),
	("Pharmacie Sidi Chami", "Sidi Chami", 35.65580, -0.52140, "041 84 11 29", 11),
	("Pharmacie El Kerma", "El Kerma", 35.61670, -0.58330, "041 83 55 40", 8),
	("Pharmacie Mers El Kebir", "Mers El Kebir", 35.72780, -0.70830, "041 39 12 76", 4),
	("Pharmacie Tafraoui", "Tafraoui", None, None, "041 88 04 19", 6),
]


def execute():
	frappe.flags.ignore_permissions = True
	delivery_date = today()
	created_customers = 0
	updated_customers = 0
	created_notes = 0

	for row in CLIENTS:
		customer, customer_created = _ensure_customer(*row[:5])
		if customer_created:
			created_customers += 1
		else:
			updated_customers += 1
		if _ensure_delivery_note(customer, row[5], delivery_date):
			created_notes += 1

	frappe.db.commit()
	print(f"Clients créés : {created_customers}, mis à jour : {updated_customers}")
	print(f"Bons de livraison préparés pour {delivery_date} : {created_notes}")


def _ensure_customer(label: str, commune_nom: str, latitude, longitude, phone: str):
	commune = frappe.db.get_value("Commune", {"nom": commune_nom, "wilaya": "Oran"}, ["name", "wilaya"], as_dict=True)
	if not commune:
		frappe.throw(f"Commune introuvable : {commune_nom} (Oran)")

	gps = f"{latitude:.8f},{longitude:.8f}" if latitude is not None and longitude is not None else None
	existing = frappe.db.get_value("Customer", {"customer_name": label.upper()}, "name")
	if existing:
		doc = frappe.get_doc("Customer", existing)
	else:
		doc = frappe.new_doc("Customer")
		doc.customer_name = label
		doc.customer_type = "Company"
		doc.customer_group = CUSTOMER_GROUP
		if frappe.db.exists("Territory", TERRITORY):
			doc.territory = TERRITORY

	doc.customer_group = CUSTOMER_GROUP
	doc.mobile_no = phone
	if doc.meta.has_field("custom_commune"):
		doc.custom_commune = commune.name
	if doc.meta.has_field("custom_wilaya"):
		doc.custom_wilaya = commune.wilaya
	if doc.meta.has_field("custom_gps"):
		doc.custom_gps = gps
	if gps and doc.meta.has_field("custom_gps_precision_m"):
		doc.custom_gps_precision_m = 15

	if existing:
		doc.save(ignore_permissions=True)
		return doc.name, False
	doc.insert(ignore_permissions=True)
	return doc.name, True


def _ensure_delivery_note(customer: str, qty: float, delivery_date: str) -> bool:
	filters = {
		"customer": customer,
		"docstatus": 0,
		"custom_date_de_livraison": delivery_date,
		"custom_statut": ["in", ["Nouveau", "Préparé"]],
	}
	if frappe.db.exists("Delivery Note", filters):
		return False

	customer_doc = frappe.get_doc("Customer", customer)
	doc = frappe.new_doc("Delivery Note")
	doc.flags.ignore_permissions = True
	doc.customer = customer
	doc.company = COMPANY
	doc.posting_date = delivery_date
	doc.set_warehouse = WAREHOUSE
	if doc.meta.has_field("custom_type"):
		doc.custom_type = "BL"
	if doc.meta.has_field("custom_commune"):
		doc.custom_commune = customer_doc.get("custom_commune")
	if doc.meta.has_field("custom_wilaya"):
		doc.custom_wilaya = customer_doc.get("custom_wilaya")
	if doc.meta.has_field("custom_date_de_livraison"):
		doc.custom_date_de_livraison = delivery_date
	if doc.meta.has_field("custom_statut_planification"):
		doc.custom_statut_planification = "Non planifié"
	if doc.meta.has_field("custom_gps"):
		doc.custom_gps = customer_doc.get("custom_gps")
	doc.append(
		"items",
		{
			"item_code": ITEM_CODE,
			"qty": flt(qty),
			"rate": ITEM_RATE,
			"warehouse": WAREHOUSE,
		},
	)
	doc.insert(ignore_permissions=True)
	_apply_named_status(doc.name, "Préparé")
	return True
