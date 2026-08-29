"""Ajoute les marqueurs nécessaires aux commandes créées depuis le portail client."""

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields(
		{
			"Sales Order": [
				{
					"fieldname": "custom_origine_commande",
					"label": "Origine de la commande",
					"fieldtype": "Select",
					"options": "\nInterne\nPortail client",
					"insert_after": "custom_type",
					"read_only": 1,
					"in_list_view": 1,
					"in_standard_filter": 1,
					"search_index": 1,
				},
				{
					"fieldname": "custom_utilisateur_portail",
					"label": "Utilisateur portail",
					"fieldtype": "Link",
					"options": "User",
					"insert_after": "custom_origine_commande",
					"read_only": 1,
					"in_standard_filter": 1,
				},
				{
					"fieldname": "custom_gps_precision_m",
					"label": "Précision GPS portail (m)",
					"fieldtype": "Float",
					"insert_after": "custom_coordonnées_gps",
					"read_only": 1,
				},
			],
		},
		update=True,
	)
