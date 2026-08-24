# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from log.delivery_note_ops import QR_FIELD, generate_qr_code


def execute():
	_delete_html_field()
	_delete_colis_client_script()
	_ensure_qr_image_field()
	_ensure_image_field_property()
	_generate_missing_qr_codes()
	frappe.clear_cache()


def _delete_html_field():
	name = "Delivery Note-custom_html"
	if frappe.db.exists("Custom Field", name):
		frappe.delete_doc("Custom Field", name, force=1, ignore_permissions=True)
		print("Removed Custom Field Delivery Note-custom_html")


def _delete_colis_client_script():
	if not frappe.db.table_exists("Client Script"):
		return
	scripts = frappe.get_all(
		"Client Script",
		filters={"dt": "Delivery Note"},
		fields=["name", "script"],
	)
	markers = (
		"can_create_colis",
		"create_colis",
		"get_colis_for_delivery_note",
		"get_unpacked_items",
		"log.delivery_note_hooks",
		"custom_html",
		"Créer Colis",
	)
	for script in scripts:
		body = script.script or ""
		if not any(marker in body for marker in markers):
			continue
		frappe.delete_doc("Client Script", script.name, force=1, ignore_permissions=True)
		print(f"Deleted Client Script '{script.name}'")


def _ensure_qr_image_field():
	if frappe.db.exists("Custom Field", f"Delivery Note-{QR_FIELD}"):
		return
	create_custom_fields(
		{
			"Delivery Note": [
				{
					"fieldname": QR_FIELD,
					"label": "Image",
					"fieldtype": "Attach Image",
					"insert_after": "custom_statut",
					"read_only": 1,
					"allow_on_submit": 1,
					"in_preview": 1,
				}
			]
		},
		ignore_validate=True,
		update=True,
	)
	print(f"Created Custom Field Delivery Note-{QR_FIELD}")


def _ensure_image_field_property():
	filters = {"doc_type": "Delivery Note", "property": "image_field", "doctype_or_field": "DocType"}
	existing = frappe.db.exists("Property Setter", filters)
	if existing:
		frappe.db.set_value("Property Setter", existing, "value", QR_FIELD)
		return
	frappe.get_doc(
		{
			"doctype": "Property Setter",
			"doctype_or_field": "DocType",
			"doc_type": "Delivery Note",
			"property": "image_field",
			"property_type": "Data",
			"value": QR_FIELD,
		}
	).insert(ignore_permissions=True)


def _generate_missing_qr_codes():
	if not frappe.db.has_column("Delivery Note", QR_FIELD):
		return
	names = [
		row[0]
		for row in frappe.db.sql(
			f"SELECT name FROM `tabDelivery Note` WHERE ifnull(`{QR_FIELD}`, '') = ''"
		)
	]
	for name in names:
		try:
			generate_qr_code(name, force=False)
		except Exception:
			frappe.log_error(title=f"QR Delivery Note {name}")
	if names:
		print(f"Generated QR for {len(names)} Delivery Note(s)")
