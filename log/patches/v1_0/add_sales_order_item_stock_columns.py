# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields(
		{
			"Sales Order Item": [
				{
					"fieldname": "custom_stock_disponible",
					"label": "Stock",
					"fieldtype": "Float",
					"insert_after": "qty",
					"in_list_view": 1,
					"columns": 1,
					"read_only": 1,
					"allow_on_submit": 1,
					"no_copy": 1,
					"print_hide": 1,
					"default": "0",
				},
				{
					"fieldname": "custom_stock_commande",
					"label": "Commandé",
					"fieldtype": "Float",
					"insert_after": "custom_stock_disponible",
					"in_list_view": 1,
					"columns": 1,
					"read_only": 1,
					"allow_on_submit": 1,
					"no_copy": 1,
					"print_hide": 1,
					"default": "0",
				},
			],
		},
		update=True,
	)
