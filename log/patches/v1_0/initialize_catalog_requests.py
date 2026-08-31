"""Ajoute le lien entre une commande et une demande hors catalogue."""

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields(
		{
			"Sales Order": [
				{
					"fieldname": "custom_demande_hors_catalogue",
					"label": "Demande hors catalogue",
					"fieldtype": "Link",
					"options": "Demande Hors Catalogue",
					"insert_after": "custom_utilisateur_portail",
					"read_only": 1,
					"in_standard_filter": 1,
				},
			],
		},
		update=True,
	)
