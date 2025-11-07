#!/usr/bin/env python3
"""
Script de test pour la validation de suppression des livraisons
Usage: python test_livraison_deletion.py [livraison_name]
"""

import frappe
import json
import sys

def test_livraison_validation(livraison_name):
    """Teste la validation de suppression pour une livraison"""
    
    print(f"\n🚚 Test de validation pour la livraison: {livraison_name}")
    print("=" * 60)
    
    try:
        # Appeler la fonction de test
        result = frappe.call(
            "log.livraison_hooks.test_livraison_deletion_validation",
            livraison_name=livraison_name
        )
        
        if not result["success"]:
            print(f"❌ Erreur: {result['message']}")
            return False
        
        print(f"📊 Résumé:")
        print(f"   • Nombre total de colis: {result['colis_count']}")
        print(f"   • Colis bloquants: {result.get('blocking_colis_count', 0)}")
        print(f"   • Colis autorisés: {result.get('allowed_colis_count', 0)}")
        print(f"   • Bons de livraison concernés: {result.get('bon_livraison_count', 0)}")
        
        if result.get('bon_livraison_list'):
            print(f"   📋 Bons de livraison: {', '.join(result['bon_livraison_list'][:5])}")
            if len(result['bon_livraison_list']) > 5:
                print(f"      ... et {len(result['bon_livraison_list']) - 5} autres")
        
        if result.get('status_summary'):
            print(f"\n📈 Répartition par statut:")
            for status, count in result['status_summary'].items():
                icon = "🔴" if status in ["Livré", "Partiellement Livré", "Enlevé", "Non Livré"] else "🟢"
                print(f"   {icon} {status}: {count} colis")
        
        print(f"\n💬 Message: {result['message']}")
        
        if result.get('colis_details'):
            print(f"\n📦 Détails des colis:")
            for colis in result['colis_details'][:10]:  # Limiter à 10 pour l'affichage
                icon = "🔴" if colis['status'] in ["Livré", "Partiellement Livré", "Enlevé", "Non Livré"] else "🟢"
                bl_info = f" (BL: {colis['bl']})" if colis['bl'] else ""
                print(f"   {icon} {colis['name']} - {colis['status']}{bl_info}")
            
            if len(result['colis_details']) > 10:
                print(f"   ... et {len(result['colis_details']) - 10} autres colis")
        
        print(f"\n🎯 Résultat final: {'✅ SUPPRESSION AUTORISÉE' if result['can_delete'] else '❌ SUPPRESSION BLOQUÉE'}")
        
        return result['can_delete']
        
    except Exception as e:
        print(f"❌ Erreur lors du test: {str(e)}")
        return False

def test_both_validations(delivery_note_name):
    """Teste les validations pour un bon de livraison ET ses livraisons associées"""
    
    print(f"\n🔄 Test complet pour le bon de livraison: {delivery_note_name}")
    print("=" * 70)
    
    try:
        frappe.init()
        frappe.connect()
        
        # 1. Tester le bon de livraison
        print(f"\n1️⃣ Test du bon de livraison {delivery_note_name}")
        print("-" * 40)
        
        dn_result = frappe.call(
            "log.livraison_hooks.test_delivery_note_deletion_validation",
            delivery_note_name=delivery_note_name
        )
        
        if dn_result["success"]:
            print(f"📋 Bon de livraison: {'✅ Suppression autorisée' if dn_result['can_delete'] else '❌ Suppression bloquée'}")
            print(f"   • {dn_result['colis_count']} colis liés")
            if dn_result.get('blocking_colis_count', 0) > 0:
                print(f"   • {dn_result['blocking_colis_count']} colis bloquants")
        
        # 2. Trouver les livraisons qui contiennent ce bon de livraison
        print(f"\n2️⃣ Recherche des livraisons contenant ce bon de livraison")
        print("-" * 50)
        
        livraisons = frappe.db.sql("""
            SELECT DISTINCT l.name, l.livreur, l.date_liv
            FROM `tabLivraison` l
            INNER JOIN `tabLivraison Bon de Livraison` lbl ON l.name = lbl.parent
            WHERE lbl.bon_de_livraison = %s
            AND l.docstatus < 2
        """, (delivery_note_name,), as_dict=True)
        
        if not livraisons:
            print("ℹ️  Aucune livraison trouvée pour ce bon de livraison")
            return
        
        print(f"📦 {len(livraisons)} livraison(s) trouvée(s)")
        
        # 3. Tester chaque livraison
        for i, livraison in enumerate(livraisons, 1):
            print(f"\n3️⃣.{i} Test de la livraison {livraison.name}")
            print(f"    Livreur: {livraison.livreur or 'Non assigné'}")
            print(f"    Date: {livraison.date_liv or 'Non définie'}")
            print("-" * 40)
            
            can_delete = test_livraison_validation(livraison.name)
            
        print(f"\n{'='*70}")
        print(f"🏁 Test complet terminé pour {delivery_note_name}")
        
    except Exception as e:
        print(f"❌ Erreur d'initialisation: {str(e)}")
    finally:
        frappe.destroy()

def main():
    """Fonction principale"""
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python test_livraison_deletion.py [livraison_name]")
        print("  python test_livraison_deletion.py --full [delivery_note_name]")
        print()
        print("Exemples:")
        print("  python test_livraison_deletion.py LIV-001")
        print("  python test_livraison_deletion.py --full DN-001")
        return
    
    # Initialiser Frappe
    try:
        if sys.argv[1] == "--full" and len(sys.argv) >= 3:
            # Test complet pour un bon de livraison
            delivery_note_name = sys.argv[2]
            test_both_validations(delivery_note_name)
        else:
            # Test simple pour une livraison
            livraison_name = sys.argv[1]
            
            frappe.init()
            frappe.connect()
            
            can_delete = test_livraison_validation(livraison_name)
            
            print(f"\n{'='*60}")
            print(f"🏁 Test terminé pour {livraison_name}")
            
            if can_delete:
                print("✅ Cette livraison peut être supprimée en toute sécurité.")
            else:
                print("❌ Cette livraison ne peut PAS être supprimée.")
                print("💡 Changez le statut des colis critiques avant de tenter la suppression.")
        
    except Exception as e:
        print(f"❌ Erreur d'initialisation: {str(e)}")
    finally:
        frappe.destroy()

if __name__ == "__main__":
    main()
