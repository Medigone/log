"""Ajoute la vente en quota (quantité max par commande) sur la fiche Article."""

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields(
		{
			"Item": [
				{
					"fieldname": "custom_vente_en_quota",
					"label": "Vente en quota",
					"fieldtype": "Check",
					"default": "0",
					"insert_after": "is_sales_item",
					"description": "Limite la quantité vendue par commande ; le responsable peut dépasser le quota.",
				},
				{
					"fieldname": "custom_quota_max_commande",
					"label": "Quantité max par commande",
					"fieldtype": "Float",
					"insert_after": "custom_vente_en_quota",
					"depends_on": "custom_vente_en_quota",
					"mandatory_depends_on": "custom_vente_en_quota",
				},
			],
		},
		update=True,
	)
