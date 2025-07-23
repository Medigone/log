# Copyright (c) 2024, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe.tests.utils import FrappeTestCase


class TestTransfertsMarchandise(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        """Configuration initiale avant l'exécution des tests."""
        super().setUpClass()

        # Vérifie si "Tous les territoires" existe, sinon le crée
        if not frappe.db.exists("Department", "Tous les territoires"):
            frappe.get_doc({
                "doctype": "Department",
                "department_name": "Tous les territoires",
                "is_group": 1  # Marqué comme un groupe
            }).insert(ignore_permissions=True)

        # Crée des entrepôts de test
        cls.from_warehouse = frappe.get_doc({
            "doctype": "Warehouse",
            "warehouse_name": "Dépôt Principal Test",
            "is_group": 0
        }).insert(ignore_permissions=True)

        cls.to_warehouse = frappe.get_doc({
            "doctype": "Warehouse",
            "warehouse_name": "Dépôt Secondaire Test",
            "is_group": 0
        }).insert(ignore_permissions=True)

        # Crée un article de test
        cls.item = frappe.get_doc({
            "doctype": "Item",
            "item_code": "TEST-ITEM",
            "item_name": "Article Test",
            "is_stock_item": 1,
            "stock_uom": "Nos"
        }).insert(ignore_permissions=True)

        # Crée un bon de livraison de test
        cls.delivery_note = frappe.get_doc({
            "doctype": "Delivery Note",
            "customer": frappe.get_doc({
                "doctype": "Customer",
                "customer_name": "Client Test"
            }).insert(ignore_permissions=True).name,
            "items": [
                {
                    "item_code": cls.item.item_code,
                    "qty": 10,
                    "rate": 100,
                    "warehouse": cls.from_warehouse.name
                }
            ]
        }).insert(ignore_permissions=True)

    def test_transfert_creation(self):
        """Teste la création d'un transfert de marchandise."""
        transfert = frappe.get_doc({
            "doctype": "Transferts Marchandise",
            "from_warehouse": self.from_warehouse.name,
            "to_warehouse": self.to_warehouse.name,
            "delivery_notes": [
                {"delivery_note": self.delivery_note.name}
            ]
        })

        transfert.insert(ignore_permissions=True)
        transfert.submit()

        # Vérifie que le transfert a été soumis
        self.assertEqual(transfert.docstatus, 1)

        # Vérifie que le bon de livraison est marqué comme préparé
        prepared_status = frappe.db.get_value("Delivery Note", self.delivery_note.name, "custom_préparé")
        self.assertEqual(prepared_status, 1)

    def test_transfert_cancellation(self):
        """Teste l'annulation d'un transfert de marchandise."""
        transfert = frappe.get_doc({
            "doctype": "Transferts Marchandise",
            "from_warehouse": self.from_warehouse.name,
            "to_warehouse": self.to_warehouse.name,
            "delivery_notes": [
                {"delivery_note": self.delivery_note.name}
            ]
        })

        transfert.insert(ignore_permissions=True)
        transfert.submit()
        transfert.cancel()

        # Vérifie que le transfert a été annulé
        self.assertEqual(transfert.docstatus, 2)

        # Vérifie que le bon de livraison n'est plus marqué comme préparé
        prepared_status = frappe.db.get_value("Delivery Note", self.delivery_note.name, "custom_préparé")
        self.assertEqual(prepared_status, 0)

    def test_stock_entry_creation(self):
        """Teste la création d'une entrée de stock consolidée."""
        transfert = frappe.get_doc({
            "doctype": "Transferts Marchandise",
            "from_warehouse": self.from_warehouse.name,
            "to_warehouse": self.to_warehouse.name,
            "delivery_notes": [
                {"delivery_note": self.delivery_note.name}
            ]
        })

        transfert.insert(ignore_permissions=True)
        transfert.submit()

        # Appelle la fonction de transfert automatique
        stock_entry_name = frappe.call("auto_transfer_stock", transfert_name=transfert.name)
        stock_entry = frappe.get_doc("Stock Entry", stock_entry_name)

        # Vérifie que l'entrée de stock a été créée avec succès
        self.assertEqual(stock_entry.purpose, "Material Transfer")
        self.assertEqual(stock_entry.from_warehouse, self.from_warehouse.name)
        self.assertEqual(stock_entry.to_warehouse, self.to_warehouse.name)
        self.assertEqual(len(stock_entry.items), 1)
        self.assertEqual(stock_entry.items[0].item_code, self.item.item_code)
        self.assertEqual(stock_entry.items[0].qty, 10)
