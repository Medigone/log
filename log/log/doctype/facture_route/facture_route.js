// Copyright (c) 2025, IntraPro and contributors
// For license information, please see license.txt

frappe.ui.form.on("Facture Route", {
	refresh(frm) {
		// Bouton pour recalculer les articles
		if (!frm.is_new()) {
			frm.add_custom_button(__("Recalculer les articles"), function () {
				frappe.call({
					method: "log.log.doctype.facture_route.facture_route.recalculate_articles",
					args: {
						docname: frm.doc.name,
					},
					freeze: true,
					freeze_message: __("Recalcul en cours..."),
					callback: function (r) {
						frm.reload_doc();
						frappe.show_alert({
							message: __("Articles recalculés avec succès"),
							indicator: "green",
						});
					},
				});
			}).addClass("btn-primary");
		}
	},

	setup(frm) {
		// Filtrer les BL pour éviter les doublons dans ce document
		frm.set_query("delivery_note", "bons_de_livraison", function (doc, cdt, cdn) {
			// Récupérer les BL déjà sélectionnés dans ce document
			let selected_dns = [];
			if (frm.doc.bons_de_livraison) {
				selected_dns = frm.doc.bons_de_livraison
					.filter((row) => row.delivery_note)
					.map((row) => row.delivery_note);
			}

			return {
				filters: {
					name: ["not in", selected_dns],
				},
			};
		});
	},

	before_save(frm) {
		// Vérifier les doublons côté client avant sauvegarde
		if (frm.doc.bons_de_livraison) {
			let delivery_notes = [];
			for (let row of frm.doc.bons_de_livraison) {
				if (row.delivery_note) {
					if (delivery_notes.includes(row.delivery_note)) {
						frappe.throw(
							__("Le bon de livraison {0} est en doublon", [row.delivery_note])
						);
					}
					delivery_notes.push(row.delivery_note);
				}
			}
		}
	},

	customer(frm) {
		// Récupérer le nom de la commune quand le client est sélectionné
		if (frm.doc.customer) {
			frappe.db.get_value("Customer", frm.doc.customer, "custom_commune", (r) => {
				if (r && r.custom_commune) {
					// Récupérer le nom de la commune
					frappe.db.get_value("Commune", r.custom_commune, "nom", (commune) => {
						if (commune && commune.nom) {
							frm.set_value("custom_commune", commune.nom);
						}
					});
				} else {
					frm.set_value("custom_commune", "");
				}
			});
		} else {
			frm.set_value("custom_commune", "");
		}
	},

	update_articles_preview(frm) {
		// Récupérer la liste des BL sélectionnés
		let delivery_notes = [];
		if (frm.doc.bons_de_livraison) {
			delivery_notes = frm.doc.bons_de_livraison
				.filter((row) => row.delivery_note)
				.map((row) => row.delivery_note);
		}

		if (delivery_notes.length === 0) {
			// Vider la table articles
			frm.clear_table("articles");
			frm.refresh_field("articles");
			frm.set_value("total_quantite", 0);
			frm.set_value("total_articles", 0);
			frm.set_value("total_ht", 0);
			frm.set_value("total_tva", 0);
			frm.set_value("total_ttc", 0);
			frm.set_value("in_words", "");
			return;
		}

		// Appeler l'API pour obtenir l'aperçu des articles
		frappe.call({
			method: "log.log.doctype.facture_route.facture_route.get_articles_preview",
			args: {
				delivery_notes: JSON.stringify(delivery_notes),
			},
			callback: function (r) {
				if (r.message) {
					// Vider et remplir la table articles
					frm.clear_table("articles");
					for (let article of r.message.articles) {
						let row = frm.add_child("articles");
						row.item_code = article.item_code;
						row.item_name = article.item_name;
						row.qty = article.qty;
						row.uom = article.uom;
						row.rate = article.rate;
						row.amount_ht = article.amount_ht;
						row.tva_rate = article.tva_rate;
						row.amount_tva = article.amount_tva;
						row.amount_ttc = article.amount_ttc;
					}
					frm.refresh_field("articles");

					// Mettre à jour les totaux
					frm.set_value("total_quantite", r.message.total_quantite);
					frm.set_value("total_articles", r.message.total_articles);
					frm.set_value("total_ht", r.message.total_ht);
					frm.set_value("total_tva", r.message.total_tva);
					frm.set_value("total_ttc", r.message.total_ttc);
					frm.set_value("in_words", r.message.in_words);
				}
			},
		});
	},
});

frappe.ui.form.on("Facture Route BL", {
	delivery_note(frm, cdt, cdn) {
		// Rafraîchir les données lorsqu'un BL est sélectionné
		let row = locals[cdt][cdn];
		if (row.delivery_note) {
			// Les champs sont auto-récupérés via fetch_from
			// On rafraîchit juste la grille
			frm.refresh_field("bons_de_livraison");

			// Mettre à jour l'aperçu des articles
			setTimeout(() => {
				frm.trigger("update_articles_preview");
			}, 500);
		}
	},

	bons_de_livraison_remove(frm, cdt, cdn) {
		// Recalculer automatiquement après suppression d'un BL
		setTimeout(() => {
			frm.trigger("update_articles_preview");
		}, 300);
	},
});
