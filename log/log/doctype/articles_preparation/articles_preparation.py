# Copyright (c) 2025, Frappe Technologies and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class ArticlesPreparation(Document):
    def validate(self):
        """Validation lors de la sauvegarde de l'article de préparation"""
        self.validate_quantities()
        self.update_status()
    
    def validate_quantities(self):
        """Valide les quantités de l'article"""
        if self.quantite_demandee <= 0:
            frappe.throw(f"La quantité demandée pour {self.article} doit être supérieure à 0")
        
        if self.quantite_preparee < 0:
            frappe.throw(f"La quantité préparée pour {self.article} ne peut pas être négative")
        
        if self.quantite_preparee > self.quantite_demandee:
            frappe.throw(f"La quantité préparée pour {self.article} ne peut pas dépasser la quantité demandée")
    
    def update_status(self):
        """Met à jour le statut de préparation basé sur les quantités"""
        if self.quantite_preparee == 0:
            self.statut_preparation = "En attente"
        elif self.quantite_preparee < self.quantite_demandee:
            self.statut_preparation = "En cours"
        elif self.quantite_preparee == self.quantite_demandee:
            self.statut_preparation = "Terminé"
        else:
            self.statut_preparation = "Manquant"

def validate_articles_preparation(doc, method):
    """Hook de validation pour les articles de préparation"""
    # Cette fonction peut être appelée depuis les hooks
    pass