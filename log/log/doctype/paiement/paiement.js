// Copyright (c) 2025, IntraPro and contributors
// For license information, please see license.txt

frappe.ui.form.on("Paiement", {
	/**
	 * Handles changes to the 'montant' field.
	 * @param {object} frm - The current form object.
	 */
	montant(frm) {
		if (frm.doc.montant <= 0) {
			frappe.msgprint({ 
				title: __('Attention'), 
				indicator: 'orange', 
				message: __('Le montant du paiement doit être supérieur à zéro.')
			});
			// Optionnel: Rendre le champ invalide
			// frm.set_df_property('montant', 'invalid', true);
		} else {
			// Optionnel: Marquer le champ comme valide s'il était invalide
			// frm.set_df_property('montant', 'invalid', false);
		}
	},

	/**
	 * Validates the form before saving.
	 * @param {object} frm - The current form object.
	 */
	validate(frm) {
		if (frm.doc.montant <= 0) {
			frappe.throw(__('Le montant du paiement doit être supérieur à zéro.'));
		}
	}
});
