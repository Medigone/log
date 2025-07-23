// Copyright (c) 2024, IntraPro and contributors
// For license information, please see license.txt

frappe.ui.form.on('Transferts Marchandise', {
    refresh: function (frm) {
        // Ajoute un bouton pour actualiser les champs
        frm.add_custom_button(__('Actualiser les Champs'), function () {
            if (!frm.doc.delivery_notes || frm.doc.delivery_notes.length === 0) {
                frappe.msgprint(__('Aucun bon de livraison à actualiser.'));
                return;
            }

            let updates = 0;

            frm.doc.delivery_notes.forEach(row => {
                if (row.delivery_note) {
                    frappe.db.get_doc('Delivery Note', row.delivery_note)
                        .then(doc => {
                            // Met à jour les champs de la Child Table
                            frappe.model.set_value(row.doctype, row.name, 'customer', doc.customer);
                            frappe.model.set_value(row.doctype, row.name, 'status', doc.status);
                            frappe.model.set_value(row.doctype, row.name, 'delivery_date', doc.posting_date);
                            frappe.model.set_value(row.doctype, row.name, 'driver', doc.driver || '');
                            updates++;
                        })
                        .catch(err => {
                            console.error(err);
                            frappe.msgprint(__('Impossible d\'actualiser le bon de livraison : {0}', [row.delivery_note]));
                        });
                }
            });

            frappe.msgprint(__(`{0} bons de livraison mis à jour.`, [updates]));
        });
    }
});

frappe.ui.form.on('Bons de Livraison Transferts', {
    delivery_note: function (frm, cdt, cdn) {
        let row = frappe.get_doc(cdt, cdn);

        if (row.delivery_note) {
            // Vérifie si le bon de livraison est déjà sélectionné
            let duplicate = frm.doc.delivery_notes?.some(d => d.delivery_note === row.delivery_note && d.name !== row.name);
            if (duplicate) {
                frappe.msgprint(__('Le bon de livraison est déjà sélectionné.'));
                frappe.model.set_value(cdt, cdn, 'delivery_note', null);
            }
        }
    }
});
