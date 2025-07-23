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
					frm.doc.articles[row_idx].quantite_restante = frm.doc.articles[row_idx].quantite_totale - (frm.doc.articles[row_idx].quantite_livree || 0);
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
