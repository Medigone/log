#!/usr/bin/env python3
"""
Script de test pour la validation de suppression des bons de livraison
Usage: python test_delivery_note_deletion.py [delivery_note_name]
"""

import frappe
import json
import sys

def test_delivery_note_validation(delivery_note_name):
    """Teste la validation de suppression pour un bon de livraison"""
    
    print(f"\n🔍 Test de validation pour le bon de livraison: {delivery_note_name}")
    print("=" * 60)
    
    try:
        # Appeler la fonction de test
        result = frappe.call(
            "log.livraison_hooks.test_delivery_note_deletion_validation",
            delivery_note_name=delivery_note_name
        )
        
        if not result["success"]:
            print(f"❌ Erreur: {result['message']}")
            return False
        
        print(f"📊 Résumé:")
        print(f"   • Nombre total de colis: {result['colis_count']}")
        print(f"   • Colis bloquants: {result.get('blocking_colis_count', 0)}")
        print(f"   • Colis autorisés: {result.get('allowed_colis_count', 0)}")
        
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
                print(f"   {icon} {colis['name']} - {colis['status']}")
            
            if len(result['colis_details']) > 10:
                print(f"   ... et {len(result['colis_details']) - 10} autres colis")
        
        print(f"\n🎯 Résultat final: {'✅ SUPPRESSION AUTORISÉE' if result['can_delete'] else '❌ SUPPRESSION BLOQUÉE'}")
        
        return result['can_delete']
        
    except Exception as e:
        print(f"❌ Erreur lors du test: {str(e)}")
        return False

def main():
    """Fonction principale"""
    if len(sys.argv) < 2:
        print("Usage: python test_delivery_note_deletion.py [delivery_note_name]")
        print("Exemple: python test_delivery_note_deletion.py DN-001")
        return
    
    delivery_note_name = sys.argv[1]
    
    # Initialiser Frappe
    try:
        frappe.init()
        frappe.connect()
        
        # Tester la validation
        can_delete = test_delivery_note_validation(delivery_note_name)
        
        print(f"\n{'='*60}")
        print(f"🏁 Test terminé pour {delivery_note_name}")
        
        if can_delete:
            print("✅ Ce bon de livraison peut être supprimé en toute sécurité.")
        else:
            print("❌ Ce bon de livraison ne peut PAS être supprimé.")
            print("💡 Changez le statut des colis critiques avant de tenter la suppression.")
        
    except Exception as e:
        print(f"❌ Erreur d'initialisation: {str(e)}")
    finally:
        frappe.destroy()

if __name__ == "__main__":
    main()
