"""Ajoute l'audit de géolocalisation sans modifier les GPS clients existants."""

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields(
		{
			"Customer": [
				{
					"fieldname": "custom_gps_precision_m",
					"label": "Précision GPS (m)",
					"fieldtype": "Float",
					"insert_after": "custom_gps",
					"read_only": 1,
				},
				{
					"fieldname": "custom_gps_capture_date",
					"label": "Date de géolocalisation",
					"fieldtype": "Datetime",
					"insert_after": "custom_gps_precision_m",
					"read_only": 1,
				},
				{
					"fieldname": "custom_gps_capture_user",
					"label": "Géolocalisé par",
					"fieldtype": "Link",
					"options": "User",
					"insert_after": "custom_gps_capture_date",
					"read_only": 1,
				},
				{
					"fieldname": "custom_gps_source_bl",
					"label": "BL source de la géolocalisation",
					"fieldtype": "Link",
					"options": "Delivery Note",
					"insert_after": "custom_gps_capture_user",
					"read_only": 1,
				},
			],
			"Delivery Note": [
				{
					"fieldname": "custom_gps_accuracy_m",
					"label": "Précision GPS de livraison (m)",
					"fieldtype": "Float",
					"insert_after": "custom_gps",
					"read_only": 1,
					"allow_on_submit": 1,
				},
			],
		},
		update=True,
	)
