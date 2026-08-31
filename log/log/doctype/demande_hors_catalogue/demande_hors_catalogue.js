# Copyright (c) 2026, IntraPro and contributors
# For license information, please see license.txt

frappe.ui.form.on("Demande Hors Catalogue", {
	refresh(frm) {
		if (frm.is_new() || !frm.has_perm("write")) {
			return;
		}
		const open = ["Ouverte", "En cours"].includes(frm.doc.statut);
		if (!open) {
			return;
		}

		const rows = frm.doc.articles || [];
		rows
			.filter((row) => !row.article && row.designation)
			.forEach((row) => {
				frm.add_custom_button(row.designation, () => create_item_from_row(row), __("Créer l'article"));
			});

		if (rows.length && rows.every((row) => row.article)) {
			frm.add_custom_button(__("Créer la commande"), () => convert_request(frm)).addClass("btn-primary");
		}
		frm.add_custom_button(__("Refuser"), () => refuse_request(frm));
	},
});

function create_item_from_row(row) {
	frappe.model.with_doctype("Item", () => {
		const doc = frappe.model.get_new_doc("Item");
		doc.item_name = row.designation;
		if (row.reference) {
			doc.description = row.reference;
		}
		frappe.set_route("Form", "Item", doc.name);
	});
}

function convert_request(frm) {
	frappe.call({
		method: "log.api.catalog_requests.create_sales_order_from_request",
		args: { name: frm.doc.name },
		freeze: true,
		freeze_message: __("Création de la commande…"),
		callback(response) {
			const order = response.message && response.message.order;
			frappe.show_alert({
				message: order
					? __("Commande {0} créée", [order.name])
					: __("Commande créée"),
				indicator: "green",
			});
			frm.reload_doc();
			if (order && order.name) {
				frappe.set_route("Form", "Sales Order", order.name);
			}
		},
	});
}

function refuse_request(frm) {
	frappe.prompt(
		{
			fieldname: "reason",
			fieldtype: "Small Text",
			label: __("Motif de refus"),
			reqd: 1,
		},
		(values) => {
			frappe.call({
				method: "log.api.catalog_requests.refuse_catalog_request",
				args: { name: frm.doc.name, reason: values.reason },
				freeze: true,
				callback() {
					frappe.show_alert({ message: __("Demande refusée"), indicator: "orange" });
					frm.reload_doc();
				},
			});
		},
		__("Refuser la demande"),
		__("Refuser"),
	);
}
