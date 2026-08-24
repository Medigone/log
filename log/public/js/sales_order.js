// Copyright (c) 2026, IntraPro and contributors
// For license information, please see license.txt

frappe.ui.form.on("Sales Order", {
	refresh(frm) {
		const hide = () => {
			frm.remove_custom_button(__("Delivery Note"), __("Create"));
			frm.remove_custom_button(__("Bon de livraison"), __("Créer"));
		};
		hide();
		setTimeout(hide, 400);
	},
});
