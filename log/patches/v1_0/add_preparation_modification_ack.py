# Copyright (c) 2026, IntraPro and contributors

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields(
		{
			"Sales Order": [
				{
					"fieldname": "custom_preparation_accepte_par",
					"label": "Modification acceptée par",
					"fieldtype": "Link",
					"options": "User",
					"insert_after": "custom_preparation_status",
					"allow_on_submit": 1,
					"read_only": 1,
				},
				{
					"fieldname": "custom_preparation_date_acceptation",
					"label": "Date d'acceptation préparation",
					"fieldtype": "Datetime",
					"insert_after": "custom_preparation_accepte_par",
					"allow_on_submit": 1,
					"read_only": 1,
				},
			],
		},
		update=True,
	)
