// Copyright (c) 2026, IntraPro and contributors
// For license information, please see license.txt

frappe.listview_settings["Demande Hors Catalogue"] = {
	get_indicator(doc) {
		if (doc.statut === "Ouverte") return [__("Ouverte"), "orange", "statut,=,Ouverte"];
		if (doc.statut === "En cours") return [__("En cours"), "blue", "statut,=,En cours"];
		if (doc.statut === "Commande créée") return [__("Commande créée"), "green", "statut,=,Commande créée"];
		if (doc.statut === "Refusée") return [__("Refusée"), "red", "statut,=,Refusée"];
		return [__(doc.statut || ""), "grey"];
	},
};
