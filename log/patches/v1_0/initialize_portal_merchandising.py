"""Champs d'attribution des campagnes portail sur les commandes."""

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields(
		{
			"Sales Order": [
				{
					"fieldname": "custom_campagne_portail",
					"label": "Campagne portail",
					"fieldtype": "Link",
					"options": "Campagne Portail",
					"insert_after": "custom_utilisateur_portail",
					"read_only": 1,
					"in_standard_filter": 1,
					"search_index": 1,
				},
			],
			"Sales Order Item": [
				{
					"fieldname": "custom_campagne_portail",
					"label": "Campagne portail",
					"fieldtype": "Link",
					"options": "Campagne Portail",
					"insert_after": "item_name",
					"read_only": 1,
				},
				{
					"fieldname": "custom_placement_portail",
					"label": "Emplacement portail",
					"fieldtype": "Data",
					"insert_after": "custom_campagne_portail",
					"read_only": 1,
				},
			],
		},
		update=True,
	)
