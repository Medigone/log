#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de migration pour le doctype Livraison
Ce script aide à migrer les données des anciens champs texte vers les nouvelles child tables.

Utilisation:
1. Exécuter ce script après avoir mis à jour les doctypes
2. Le script va migrer les données existantes vers la nouvelle structure
3. Vérifier les données migrées avant de supprimer les anciens champs
"""

import frappe
from frappe import _

def migrate_livraison_data():
    """
    Migre les données des anciens champs texte vers les nouvelles child tables.
    """
    print("Début de la migration des données Livraison...")
    
    # Obtenir toutes les livraisons existantes
    livraisons = frappe.get_all("Livraison", fields=["name"])
    
    total_migrated = 0
    errors = []
    
    for livraison_data in livraisons:
        try:
            livraison = frappe.get_doc("Livraison", livraison_data.name)
            migrated = migrate_single_livraison(livraison)
            if migrated:
                total_migrated += 1
                print(f"✓ Livraison {livraison.name} migrée avec succès")
        except Exception as e:
            error_msg = f"Erreur lors de la migration de {livraison_data.name}: {str(e)}"
            errors.append(error_msg)
            print(f"✗ {error_msg}")
    
    print(f"\nMigration terminée:")
    print(f"- {total_migrated} livraisons migrées avec succès")
    print(f"- {len(errors)} erreurs rencontrées")
    
    if errors:
        print("\nErreurs détaillées:")
        for error in errors:
            print(f"  - {error}")
    
    return total_migrated, errors

def migrate_single_livraison(livraison):
    """
    Migre une seule livraison vers la nouvelle structure.
    """
    migrated = False
    
    # Migrer les bons de livraison (si le champ 'bl' existe encore)
    if hasattr(livraison, 'bl') and livraison.bl:
        migrate_bons_de_livraison(livraison)
        migrated = True
    
    # Migrer la liste des colis (si le champ 'liste_colis' existe encore)
    if hasattr(livraison, 'liste_colis') and livraison.liste_colis:
        migrate_colis_list(livraison)
        migrated = True
    
    # Synchroniser les paiements
    livraison.sync_paiements_from_paiement_client()
    migrated = True
    
    if migrated:
        livraison.save(ignore_permissions=True)
    
    return migrated

def migrate_bons_de_livraison(livraison):
    """
    Migre les bons de livraison du champ texte vers la child table.
    """
    if not hasattr(livraison, 'bl') or not livraison.bl:
        return
    
    # Nettoyer la child table existante
    livraison.bons_de_livraison = []
    
    # Parser les bons de livraison (supposant qu'ils sont séparés par des virgules)
    bl_list = [bl.strip() for bl in livraison.bl.split(',') if bl.strip()]
    
    for bl_name in bl_list:
        # Vérifier si le bon de livraison existe
        if frappe.db.exists("Delivery Note", bl_name):
            try:
                delivery_note = frappe.get_doc("Delivery Note", bl_name)
                livraison.append("bons_de_livraison", {
                    "bon_de_livraison": bl_name,
                    "customer": delivery_note.customer,
                    "posting_date": delivery_note.posting_date,
                    "total_qty": delivery_note.total_qty,
                    "status": delivery_note.status
                })
            except Exception as e:
                print(f"  Avertissement: Impossible de charger le bon de livraison {bl_name}: {str(e)}")
        else:
            print(f"  Avertissement: Bon de livraison {bl_name} introuvable")

def migrate_colis_list(livraison):
    """
    Migre la liste des colis du champ texte vers la child table.
    """
    if not hasattr(livraison, 'liste_colis') or not livraison.liste_colis:
        return
    
    # Nettoyer la child table existante
    livraison.colis = []
    
    # Parser la liste des colis (supposant qu'ils sont séparés par des virgules)
    colis_list = [colis.strip() for colis in livraison.liste_colis.split(',') if colis.strip()]
    
    for colis_name in colis_list:
        # Vérifier si le colis existe
        if frappe.db.exists("Colis", colis_name):
            try:
                colis = frappe.get_doc("Colis", colis_name)
                livraison.append("colis", {
                    "colis": colis_name,
                    "numero_sequence": colis.custom_numero_sequence,
                    "client": colis.client,
                    "bon_de_livraison": colis.bl,
                    "status": colis.status,
                    "montant_a_encaisser": get_colis_amount_to_collect(colis)
                })
            except Exception as e:
                print(f"  Avertissement: Impossible de charger le colis {colis_name}: {str(e)}")
        else:
            print(f"  Avertissement: Colis {colis_name} introuvable")

def get_colis_amount_to_collect(colis):
    """
    Calcule le montant à encaisser pour un colis.
    Cette fonction peut être adaptée selon la logique métier.
    """
    # Logique par défaut - peut être adaptée selon les besoins
    total_amount = 0
    
    if hasattr(colis, 'articles') and colis.articles:
        for article in colis.articles:
            if hasattr(article, 'prix_unitaire') and hasattr(article, 'quantite'):
                total_amount += (article.prix_unitaire or 0) * (article.quantite or 0)
    
    return total_amount

def validate_migration():
    """
    Valide que la migration s'est bien déroulée.
    """
    print("\nValidation de la migration...")
    
    livraisons = frappe.get_all("Livraison", fields=["name"])
    validation_errors = []
    
    for livraison_data in livraisons:
        try:
            livraison = frappe.get_doc("Livraison", livraison_data.name)
            
            # Vérifier que les totaux sont cohérents
            expected_total_colis = len(livraison.colis) if livraison.colis else 0
            if livraison.total_colis != expected_total_colis:
                validation_errors.append(f"Livraison {livraison.name}: total_colis incohérent ({livraison.total_colis} vs {expected_total_colis})")
            
            # Vérifier que les montants sont cohérents
            expected_total_montant = sum([row.montant_a_encaisser or 0 for row in livraison.colis or []])
            if abs((livraison.total_montant_a_encaisser or 0) - expected_total_montant) > 0.01:
                validation_errors.append(f"Livraison {livraison.name}: total_montant_a_encaisser incohérent")
                
        except Exception as e:
            validation_errors.append(f"Erreur lors de la validation de {livraison_data.name}: {str(e)}")
    
    if validation_errors:
        print(f"⚠️  {len(validation_errors)} erreurs de validation trouvées:")
        for error in validation_errors:
            print(f"  - {error}")
    else:
        print("✓ Validation réussie - toutes les données sont cohérentes")
    
    return validation_errors

if __name__ == "__main__":
    # Exécution du script de migration
    print("=== SCRIPT DE MIGRATION LIVRAISON ===")
    print("Ce script va migrer les données vers la nouvelle structure.")
    print("Assurez-vous d'avoir une sauvegarde avant de continuer.\n")
    
    # Demander confirmation
    confirm = input("Voulez-vous continuer avec la migration? (oui/non): ")
    if confirm.lower() not in ['oui', 'o', 'yes', 'y']:
        print("Migration annulée.")
        exit()
    
    # Exécuter la migration
    total_migrated, errors = migrate_livraison_data()
    
    # Valider la migration
    validation_errors = validate_migration()
    
    print("\n=== RÉSUMÉ DE LA MIGRATION ===")
    print(f"Livraisons migrées: {total_migrated}")
    print(f"Erreurs de migration: {len(errors)}")
    print(f"Erreurs de validation: {len(validation_errors)}")
    
    if not errors and not validation_errors:
        print("\n✅ Migration terminée avec succès!")
        print("Vous pouvez maintenant supprimer les anciens champs 'bl', 'liste_colis' et 'pe' du doctype Livraison.")
    else:
        print("\n⚠️  Migration terminée avec des erreurs. Veuillez vérifier les logs ci-dessus.")