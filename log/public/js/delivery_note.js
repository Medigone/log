// Copyright (c) 2025, IntraPro and contributors
// For license information, please see license.txt

frappe.ui.form.on("Delivery Note", {
	refresh(frm) {
		// Mémoriser le véhicule actuel au chargement pour détecter les changements
		frm._previous_vehicule = frm.doc.custom_véhicule;
	},

	onload(frm) {
		// Mémoriser le véhicule initial
		frm._previous_vehicule = frm.doc.custom_véhicule;
	},

	"custom_véhicule": function(frm) {
		if (frm.doc.custom_véhicule) {
			// Récupérer l'entrepôt du véhicule sélectionné
			frappe.db.get_value("Vehicule", frm.doc.custom_véhicule, ["warehouse", "nom"], function(r) {
				if (r && r.warehouse) {
					// Mettre à jour l'entrepôt source
					frm.set_value("set_warehouse", r.warehouse);
					
					// Appliquer aussi à toutes les lignes d'articles qui n'ont pas d'entrepôt
					if (frm.doc.items && frm.doc.items.length > 0) {
						frm.doc.items.forEach(function(item) {
							if (!item.warehouse) {
								frappe.model.set_value(item.doctype, item.name, "warehouse", r.warehouse);
							}
						});
						frm.refresh_field("items");
					}
					
					frappe.show_alert({
						message: __("Entrepôt mis à jour: {0}", [r.warehouse]),
						indicator: "green"
					});
				} else {
					frappe.msgprint({
						title: __("Attention"),
						indicator: "orange",
						message: __("Le véhicule {0} n'a pas d'entrepôt associé. Veuillez vérifier la configuration du véhicule.", [r.nom || frm.doc.custom_véhicule])
					});
				}
			});
		}
		
		// Stocker l'ancien véhicule dans un champ technique pour la logique serveur
		if (frm._previous_vehicule && frm._previous_vehicule !== frm.doc.custom_véhicule) {
			// Le véhicule a changé, on garde trace pour le hook serveur
			frm.doc._previous_vehicule = frm._previous_vehicule;
		}
		
		// Mettre à jour le véhicule précédent pour le prochain changement
		frm._previous_vehicule = frm.doc.custom_véhicule;
	},

	before_save(frm) {
		// S'assurer que le véhicule précédent est transmis au serveur si changé
		if (frm._previous_vehicule && frm._previous_vehicule !== frm.doc.custom_véhicule) {
			frm.doc._previous_vehicule = frm._previous_vehicule;
		}
	}
});

