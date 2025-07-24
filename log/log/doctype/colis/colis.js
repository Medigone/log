// Copyright (c) 2025, IntraPro and contributors
// For license information, please see license.txt

frappe.ui.form.on("Colis", {
	refresh(frm) {
		// Afficher le QR code dans le champ HTML s'il existe
		if (frm.doc.image) {
			frm.set_df_property('html', 'options', `
				<div style="text-align: center; margin: 20px;">
					<h3>QR Code du Colis</h3>
					<img src="${frm.doc.image}" style="max-width: 200px; max-height: 200px;" />
					<p>Scannez ce QR code pour identifier le colis</p>
					<p><small>ID: ${frm.doc.name}</small></p>
				</div>
			`);
		} else {
			frm.set_df_property('html', 'options', `
				<div style="text-align: center; margin: 20px;">
					<p>Le QR code sera généré après la sauvegarde du document</p>
				</div>
			`);
		}
	},
	
	// Gérer l'événement de scan du code-barres via le champ scan_barcode
	scan_barcode: function(frm) {
		let scan_barcode_field = frm.fields_dict["scan_barcode"];
		let input = scan_barcode_field.value;
		
		if (input) {
			traiter_article_scanne(frm, input);
			// Réinitialiser le champ après traitement
			scan_barcode_field.set_value("");
		}
	}
});

// Événements pour la table enfant Articles Colis
frappe.ui.form.on("Articles Colis", {
	// Calculer la quantité restante quand la quantité totale change
	quantite_totale: function(frm, cdt, cdn) {
		calculer_quantite_restante(frm, cdt, cdn);
	},
	
	// Calculer la quantité restante quand la quantité livrée change
	quantite_livree: function(frm, cdt, cdn) {
		calculer_quantite_restante(frm, cdt, cdn);
	}
});

/**
 * Calcule et met à jour la quantité restante pour une ligne d'article
 * @param {Object} frm - L'objet formulaire Frappe
 * @param {String} cdt - Le type de document enfant
 * @param {String} cdn - Le nom du document enfant
 */
function calculer_quantite_restante(frm, cdt, cdn) {
	let row = locals[cdt][cdn];
	
	// Validation: la quantité totale ne peut pas être égale à 0
	let quantite_totale = row.quantite_totale || 0;
	if (quantite_totale === 0) {
		frappe.show_alert({
			message: __('La quantité totale ne peut pas être égale à 0'),
			indicator: 'red'
		}, 3);
		// Remettre la quantité totale à 1 par défaut
		frappe.model.set_value(cdt, cdn, 'quantite_totale', 1);
		quantite_totale = 1;
	}
	
	// Calculer la quantité restante = Quantité Totale - Quantité Livrée
	let quantite_livree = row.quantite_livree || 0;
	let quantite_restante = quantite_totale - quantite_livree;
	
	// S'assurer que la quantité restante n'est pas négative
	if (quantite_restante < 0) {
		quantite_restante = 0;
		frappe.show_alert({
			message: __('La quantité livrée ne peut pas être supérieure à la quantité totale'),
			indicator: 'red'
		}, 3);
	}
	
	// Mettre à jour la quantité restante
	frappe.model.set_value(cdt, cdn, 'quantite_restante', quantite_restante);
	
	// Mettre à jour le statut de l'article en fonction des quantités
	let nouveau_statut;
	if (quantite_livree === 0) {
		nouveau_statut = "En attente";
	} else if (quantite_livree >= quantite_totale) {
		nouveau_statut = "Livré";
	} else {
		nouveau_statut = "Partiellement livré";
	}
	
	frappe.model.set_value(cdt, cdn, 'statut_article', nouveau_statut);
}

/**
 * Traite un code-barres d'article scanné et ajoute l'article correspondant à la table enfant 'articles'
 * @param {Object} frm - L'objet formulaire Frappe
 * @param {String} code_barre - Le code-barres de l'article scanné
 */
function traiter_article_scanne(frm, code_barre) {
	// Utiliser la méthode serveur pour récupérer l'article à partir du code-barres
	frappe.call({
		method: 'intrapro_erp_distribution.intrapro_erp_distribution.doctype.colis.colis.get_item_from_barcode',
		args: {
			barcode: code_barre
		},
		callback: function(r) {
			if (r.message) {
				const article = r.message;
				
				// Vérifier si l'article est déjà dans la table
				let existe = false;
				let row_idx = null;
				
				$.each(frm.doc.articles || [], function(i, row) {
					if (row.article === article.name) {
						existe = true;
						row_idx = i;
						return false; // Sortir de la boucle
					}
				});
				
				if (existe) {
					// Incrémenter la quantité si l'article existe déjà
					frm.doc.articles[row_idx].quantite_totale += 1;
					// Utiliser la fonction pour calculer la quantité restante
					calculer_quantite_restante(frm, 'Articles Colis', frm.doc.articles[row_idx].name);
				} else {
					// Ajouter un nouvel article à la table
					const child = frm.add_child('articles');
					child.article = article.name;
					child.quantite_totale = 1;
					child.quantite_livree = 0;
					child.quantite_restante = 1;
					child.statut_article = "En attente";
				}
				
				// Rafraîchir la table
				frm.refresh_field('articles');
				
				// Sauvegarder le document après l'ajout de l'article
				frm.save().then(() => {
					// Afficher un message de confirmation
					frappe.show_alert({
						message: __('Article {0} ajouté', [article.item_name || article.name]),
						indicator: 'green'
					}, 3);
				});
			} else {
				// Aucun article trouvé avec ce code-barres
				frappe.show_alert({
					message: __('Aucun article trouvé avec le code-barres: {0}', [code_barre]),
					indicator: 'red'
				}, 3);
			}
		}
	});
}
