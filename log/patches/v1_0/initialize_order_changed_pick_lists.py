# Copyright (c) 2026, IntraPro and contributors

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields(
		{
			"Sales Order": [
				{
					"fieldname": "custom_preparation_status",
					"label": "Statut préparation",
					"fieldtype": "Select",
					"options": "\nModifiée",
					"insert_after": "custom_distribution_revision",
					"allow_on_submit": 1,
					"read_only": 1,
				},
			],
			"Pick List": [
				{
					"fieldname": "custom_order_changed",
					"label": "Commande modifiée",
					"fieldtype": "Check",
					"insert_after": "status",
					"allow_on_submit": 1,
					"read_only": 1,
				},
				{
					"fieldname": "custom_order_changed_reason",
					"label": "Motif commande modifiée",
					"fieldtype": "Small Text",
					"insert_after": "custom_order_changed",
					"allow_on_submit": 1,
					"read_only": 1,
				},
			],
		},
		update=True,
	)
