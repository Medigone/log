// Copyright (c) 2026, IntraPro and contributors
// For license information, please see license.txt

frappe.query_reports["Performance Campagnes Portail"] = {
	filters: [
		{
			fieldname: "from_date",
			label: __("Date de début"),
			fieldtype: "Date",
		},
		{
			fieldname: "to_date",
			label: __("Date de fin"),
			fieldtype: "Date",
		},
		{
			fieldname: "campaign",
			label: __("Campagne"),
			fieldtype: "Link",
			options: "Campagne Portail",
		},
		{
			fieldname: "placement",
			label: __("Emplacement"),
			fieldtype: "Select",
			options: "\nHero\nBandeau\nRayon produits",
		},
	],
};
