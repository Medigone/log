"""Ajoute le marqueur de rotation obligatoire aux comptes portail nouvellement créés."""

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields(
		{
			"User": [
				{
					"fieldname": "custom_portal_password_change_required",
					"label": "Changement de mot de passe portail requis",
					"fieldtype": "Check",
					"default": "0",
					"insert_after": "last_password_reset_date",
					"hidden": 1,
					"read_only": 1,
					"no_copy": 1,
				},
			],
		},
		update=True,
	)
