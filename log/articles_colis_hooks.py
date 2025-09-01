# Copyright (c) 2025, IntraPro and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def validate_articles_colis(doc, method):
    """Validation hook pour les documents Articles Colis
    
    Args:
        doc: Le document Articles Colis
        method: La méthode appelée (validate, before_save, etc.)
    """
    try:
        # Validation basique des quantités
        if hasattr(doc, 'quantite_commandee') and doc.quantite_commandee < 0:
            frappe.throw(_("La quantité commandée ne peut pas être négative"))
        
        if hasattr(doc, 'quantite_livree') and doc.quantite_livree < 0:
            frappe.throw(_("La quantité livrée ne peut pas être négative"))
        
        # Vérifier que la quantité livrée ne dépasse pas la quantité commandée
        if (hasattr(doc, 'quantite_commandee') and hasattr(doc, 'quantite_livree') and 
            doc.quantite_livree > doc.quantite_commandee):
            frappe.throw(_("La quantité livrée ne peut pas dépasser la quantité commandée"))
        
        # Calculer automatiquement le statut de l'article basé sur les quantités
        if hasattr(doc, 'quantite_commandee') and hasattr(doc, 'quantite_livree'):
            if doc.quantite_livree == 0:
                doc.statut_article = "En attente"
            elif doc.quantite_livree >= doc.quantite_commandee:
                doc.statut_article = "Livré"
            else:
                doc.statut_article = "Partiellement livré"
        
        frappe.logger().info(f"Validation réussie pour Articles Colis: {doc.name if hasattr(doc, 'name') else 'nouveau'}")
        
    except Exception as e:
        frappe.logger().error(f"Erreur lors de la validation Articles Colis: {str(e)}")
        # Re-lever l'erreur pour que la validation échoue
        raise