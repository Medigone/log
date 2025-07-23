# Copyright (c) 2024, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class TransfertsMarchandise(Document):
    def validate(self):
        """Validation principale lors de la sauvegarde du document."""
        validate_delivery_notes(self)

    def on_submit(self):
        """Actions à exécuter lorsque le document est soumis."""
        update_preparation_status(self)

    def on_cancel(self):
        """Réinitialise les bons de livraison comme non préparés et retourne les articles au dépôt d'origine."""
        reset_preparation_status(self)
        return_items_to_source(self)


def validate_delivery_notes(doc, method=None):
    """Valide que les bons de livraison sont uniques dans le transfert."""
    if not doc.delivery_notes or len(doc.delivery_notes) == 0:
        frappe.throw("La table des bons de livraison ne peut pas être vide.")

    existing_delivery_notes = set()

    for row in doc.delivery_notes:
        if not row.delivery_note:
            frappe.throw("Tous les bons de livraison doivent être renseignés.")

        if row.delivery_note in existing_delivery_notes:
            frappe.throw(f"Le bon de livraison {row.delivery_note} est déjà ajouté dans ce transfert.")

        # Vérifiez si ce bon de livraison est déjà lié à un autre transfert
        linked_transfers = frappe.db.sql("""
            SELECT parent
            FROM `tabBons de Livraison Transferts`
            WHERE delivery_note = %s AND parent != %s
              AND parent IN (SELECT name FROM `tabTransferts Marchandise` WHERE docstatus < 2)
        """, (row.delivery_note, doc.name))

        if linked_transfers:
            frappe.throw(f"Le bon de livraison {row.delivery_note} est déjà lié au transfert {linked_transfers[0][0]}.")

        # Vérifiez si le bon de livraison est déjà marqué comme transféré
        prepared_status = frappe.db.get_value("Delivery Note", row.delivery_note, "custom_préparé")
        if prepared_status:
            frappe.throw(f"Le bon de livraison {row.delivery_note} est déjà marqué comme transféré vers préparation.")

        existing_delivery_notes.add(row.delivery_note)


def update_preparation_status(doc):
    """Marque les bons de livraison comme préparés lorsque le transfert est validé."""
    for row in doc.delivery_notes:
        frappe.db.set_value("Delivery Note", row.delivery_note, "custom_préparé", 1)
        frappe.msgprint(f"Le bon de livraison {row.delivery_note} est marqué comme transféré vers préparation.")


def reset_preparation_status(doc):
    """Réinitialise le statut préparé des bons de livraison lorsqu'un transfert est annulé."""
    for row in doc.delivery_notes:
        frappe.db.set_value("Delivery Note", row.delivery_note, "custom_préparé", 0)
        frappe.msgprint(f"Le bon de livraison {row.delivery_note} est marqué comme non transféré vers préparation.")


def return_items_to_source(doc):
    """Retourne les articles au dépôt d'origine après annulation."""
    if not doc.delivery_notes:
        frappe.throw("Aucun bon de livraison dans ce transfert.")

    # Préparez un dictionnaire pour consolider les articles
    consolidated_items = {}

    for row in doc.delivery_notes:
        delivery_note = frappe.get_doc("Delivery Note", row.delivery_note)

        for item in delivery_note.items:
            item_key = (item.item_code, item.uom)
            if item_key in consolidated_items:
                consolidated_items[item_key]["qty"] += item.qty
            else:
                consolidated_items[item_key] = {
                    "item_code": item.item_code,
                    "qty": item.qty,
                    "uom": item.uom,
                    "stock_uom": item.stock_uom,
                    "conversion_factor": item.conversion_factor,
                    "basic_rate": item.rate,
                }

    # Génère un Stock Entry pour retourner les articles
    stock_entry = frappe.new_doc("Stock Entry")
    stock_entry.purpose = "Material Transfer"
    stock_entry.from_warehouse = doc.to_warehouse  # Dépôt cible devient source
    stock_entry.to_warehouse = doc.from_warehouse  # Retour au dépôt d'origine
    stock_entry.items = [
        {
            "item_code": item_data["item_code"],
            "qty": item_data["qty"],
            "uom": item_data["uom"],
            "stock_uom": item_data["stock_uom"],
            "conversion_factor": item_data["conversion_factor"],
            "basic_rate": item_data["basic_rate"],
        }
        for item_data in consolidated_items.values()
    ]

    stock_entry.insert()
    stock_entry.submit()

    frappe.msgprint(f"Retour des articles effectué avec succès : {stock_entry.name}")


@frappe.whitelist()
def auto_transfer_stock(transfert_name):
    """Génère un transfert de stock consolidé à partir des informations du transfert."""
    transfert = frappe.get_doc("Transferts Marchandise", transfert_name)

    if transfert.docstatus != 1:
        frappe.throw("Le transfert doit être soumis avant de générer un transfert de stock.")

    if not transfert.delivery_notes:
        frappe.throw("Aucun bon de livraison à transférer.")

    consolidated_items = {}

    for row in transfert.delivery_notes:
        delivery_note = frappe.get_doc("Delivery Note", row.delivery_note)

        if delivery_note.status != "To Deliver":
            frappe.throw(f"Le bon de livraison {row.delivery_note} n'est pas prêt pour le transfert.")

        for item in delivery_note.items:
            item_key = (item.item_code, item.uom)
            if item_key in consolidated_items:
                consolidated_items[item_key]["qty"] += item.qty
            else:
                consolidated_items[item_key] = {
                    "item_code": item.item_code,
                    "qty": item.qty,
                    "uom": item.uom,
                    "stock_uom": item.stock_uom,
                    "conversion_factor": item.conversion_factor,
                    "basic_rate": item.rate,
                }

    stock_entry = frappe.new_doc("Stock Entry")
    stock_entry.purpose = "Material Transfer"
    stock_entry.from_warehouse = transfert.from_warehouse
    stock_entry.to_warehouse = transfert.to_warehouse
    stock_entry.items = [
        {
            "item_code": item_data["item_code"],
            "qty": item_data["qty"],
            "uom": item_data["uom"],
            "stock_uom": item_data["stock_uom"],
            "conversion_factor": item_data["conversion_factor"],
            "basic_rate": item_data["basic_rate"],
        }
        for item_data in consolidated_items.values()
    ]

    stock_entry.insert()
    stock_entry.submit()

    frappe.msgprint(f"Transfert de stock créé avec succès : {stock_entry.name}")
    return stock_entry.name
