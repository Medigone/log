// Copyright (c) 2025, IntraPro and contributors
// For license information, please see license.txt

frappe.ui.form.on("Livreur", {
	refresh(frm) {
		// Ajouter un bouton pour synchroniser manuellement les communes
		if (!frm.is_new()) {
			frm.add_custom_button(__("Synchroniser Communes"), function() {
				frm.call("auto_populate_communes_from_wilayas_api").then((response) => {
					frm.reload_doc();
					frappe.show_alert({
						message: __("Communes synchronisées avec succès"),
						indicator: "green"
					});
				}).catch((error) => {
					frappe.show_alert({
						message: __("Erreur lors de la synchronisation"),
						indicator: "red"
					});
				});
			}, __("Actions"));
		}
	},
	
	validate(frm) {
		// Validation côté client avant sauvegarde
		if (frm.doc.wilayas_autorisees && frm.doc.wilayas_autorisees.length > 0) {
			// Vérifier s'il y a des doublons dans les wilayas
			let wilayas = frm.doc.wilayas_autorisees.map(row => row.wilaya).filter(w => w);
			let wilayas_uniques = [...new Set(wilayas)];
			
			if (wilayas.length !== wilayas_uniques.length) {
				frappe.msgprint({
					title: __("Erreur de validation"),
					message: __("Des wilayas en double ont été détectées. Veuillez supprimer les doublons."),
					indicator: "red"
				});
				return false;
			}
		}
	}
});

// Événements pour la table enfant Wilayas
frappe.ui.form.on("Livreur Wilaya", {
	wilaya(frm, cdt, cdn) {
		// Quand une wilaya est sélectionnée, mettre à jour les communes automatiquement
		if (frm.doc.wilayas_autorisees && frm.doc.wilayas_autorisees.length > 0) {
			// Délai pour permettre à la sélection de se finaliser
			setTimeout(() => {
				update_communes_from_wilayas(frm);
			}, 500);
		}
	},
	
	wilayas_autorisees_remove(frm, cdt, cdn) {
		// Quand une wilaya est supprimée, mettre à jour les communes
		setTimeout(() => {
			update_communes_from_wilayas(frm);
		}, 500);
	}
});

// Fonction utilitaire pour mettre à jour les communes basées sur les wilayas
function update_communes_from_wilayas(frm) {
	if (!frm.doc.wilayas_autorisees || frm.doc.wilayas_autorisees.length === 0) {
		// Si aucune wilaya n'est sélectionnée, vider les communes
		frm.clear_table("communes_autorisees");
		frm.refresh_field("communes_autorisees");
		return;
	}
	
	// Récupérer les wilayas sélectionnées
	let wilayas_selectionnees = frm.doc.wilayas_autorisees
		.map(row => row.wilaya)
		.filter(wilaya => wilaya);
	
	if (wilayas_selectionnees.length === 0) {
		return;
	}
	
	// Appel au serveur pour récupérer les communes
	frappe.call({
		method: "frappe.client.get_list",
		args: {
			doctype: "Commune",
			filters: {
				wilaya: ["in", wilayas_selectionnees]
			},
			fields: ["name", "nom", "wilaya"],
			order_by: "wilaya, nom"
		},
		callback: function(response) {
			if (response.message) {
				// Récupérer les communes déjà présentes
				let communes_existantes = frm.doc.communes_autorisees
					.map(row => row.commune)
					.filter(commune => commune);
				
				// Supprimer les communes qui ne correspondent plus aux wilayas sélectionnées
				let communes_a_garder = [];
				frm.doc.communes_autorisees.forEach(row => {
					if (row.commune) {
						let commune_valide = response.message.find(c => c.name === row.commune);
						if (commune_valide) {
							communes_a_garder.push(row);
						}
					}
				});
				
				// Vider et repeupler la table des communes
				frm.clear_table("communes_autorisees");
				
				// Ajouter les communes existantes valides
				communes_a_garder.forEach(commune_row => {
					frm.add_child("communes_autorisees", commune_row);
				});
				
				// Ajouter les nouvelles communes
				response.message.forEach(commune => {
					let existe_deja = communes_a_garder.find(row => row.commune === commune.name);
					if (!existe_deja) {
						frm.add_child("communes_autorisees", {
							commune: commune.name
						});
					}
				});
				
				frm.refresh_field("communes_autorisees");
				
				// Afficher un message de confirmation
				frappe.show_alert({
					message: __("Communes mises à jour automatiquement"),
					indicator: "blue"
				});
			}
		}
	});
}
