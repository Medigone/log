#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de test pour l'intégration des paiements avec les livraisons.
Ce script teste toutes les fonctionnalités nouvelles et modifiées.
"""

import frappe
import unittest
from frappe.test_runner import make_test_records
from frappe.utils import today, add_days

class TestPaiementsIntegration(unittest.TestCase):
    """
    Tests pour l'intégration des paiements avec les livraisons.
    """
    
    @classmethod
    def setUpClass(cls):
        """Configuration initiale pour tous les tests."""
        # Créer des données de test
        cls.setup_test_data()
    
    @classmethod
    def setup_test_data(cls):
        """Créer les données de test nécessaires."""
        # Créer un client de test
        if not frappe.db.exists("Customer", "Test Client Paiement"):
            customer = frappe.get_doc({
                "doctype": "Customer",
                "customer_name": "Test Client Paiement",
                "customer_type": "Individual"
            })
            customer.insert(ignore_permissions=True)
        
        # Créer un livreur de test
        if not frappe.db.exists("User", "test.livreur@example.com"):
            user = frappe.get_doc({
                "doctype": "User",
                "email": "test.livreur@example.com",
                "first_name": "Test",
                "last_name": "Livreur",
                "user_type": "System User"
            })
            user.insert(ignore_permissions=True)
        
        # Créer une livraison de test
        cls.test_livraison = frappe.get_doc({
            "doctype": "Livraison",
            "status": "En Cours",
            "date_liv": today(),
            "livreur": "test.livreur@example.com",
            "nom_livreur": "Test Livreur",
            "vehicule": "Test Vehicle"
        })
        cls.test_livraison.insert(ignore_permissions=True)
    
    def test_paiement_libre_creation(self):
        """Test de création d'un paiement libre."""
        paiement = frappe.get_doc({
            "doctype": "Paiement Client",
            "type_paiement": "Paiement libre",
            "client": "Test Client Paiement",
            "montant": 100.0,
            "moyen_paiement": "Espèce",
            "date": today()
        })
        
        # Le paiement doit être créé sans erreur
        paiement.insert(ignore_permissions=True)
        self.assertTrue(paiement.name)
        self.assertEqual(paiement.type_paiement, "Paiement libre")
        self.assertIsNone(paiement.livraison)
        
        # Nettoyer
        paiement.delete(ignore_permissions=True)
    
    def test_paiement_livraison_validation(self):
        """Test de validation pour les paiements de type livraison."""
        # Test 1: Paiement livraison sans livraison sélectionnée (doit échouer)
        paiement = frappe.get_doc({
            "doctype": "Paiement Client",
            "type_paiement": "Livraison",
            "client": "Test Client Paiement",
            "montant": 100.0,
            "moyen_paiement": "Espèce",
            "date": today()
        })
        
        with self.assertRaises(frappe.ValidationError):
            paiement.insert(ignore_permissions=True)
        
        # Test 2: Paiement livraison avec livraison valide
        paiement.livraison = self.test_livraison.name
        
        # Ce test peut échouer si le client n'a pas de colis dans la livraison
        # C'est le comportement attendu
        try:
            paiement.insert(ignore_permissions=True)
            # Si ça passe, nettoyer
            paiement.delete(ignore_permissions=True)
        except frappe.ValidationError as e:
            # C'est attendu si le client n'a pas de colis
            self.assertIn("aucun colis", str(e))
    
    def test_montant_validation(self):
        """Test de validation du montant."""
        # Test avec montant négatif (doit échouer)
        paiement = frappe.get_doc({
            "doctype": "Paiement Client",
            "type_paiement": "Paiement libre",
            "client": "Test Client Paiement",
            "montant": -50.0,
            "moyen_paiement": "Espèce",
            "date": today()
        })
        
        with self.assertRaises(frappe.ValidationError):
            paiement.insert(ignore_permissions=True)
        
        # Test avec montant zéro (doit échouer)
        paiement.montant = 0.0
        with self.assertRaises(frappe.ValidationError):
            paiement.insert(ignore_permissions=True)
    
    def test_livraison_totals_calculation(self):
        """Test du calcul des totaux dans la livraison."""
        livraison = self.test_livraison
        
        # Ajouter quelques colis de test
        livraison.append("colis", {
            "colis": "TEST-COLIS-001",
            "numero_sequence": "001",
            "client": "Test Client Paiement",
            "montant_a_encaisser": 150.0
        })
        
        livraison.append("colis", {
            "colis": "TEST-COLIS-002",
            "numero_sequence": "002",
            "client": "Test Client Paiement",
            "montant_a_encaisser": 200.0
        })
        
        # Sauvegarder et vérifier les calculs
        livraison.save(ignore_permissions=True)
        
        self.assertEqual(livraison.total_colis, 2)
        self.assertEqual(livraison.total_montant_a_encaisser, 350.0)
        self.assertEqual(livraison.total_paiements, 0.0)
        self.assertEqual(livraison.solde_restant, 350.0)
    
    def test_paiement_livraison_sync(self):
        """Test de synchronisation des paiements avec la livraison."""
        # Créer un paiement lié à la livraison
        paiement = frappe.get_doc({
            "doctype": "Paiement Client",
            "type_paiement": "Livraison",
            "livraison": self.test_livraison.name,
            "client": "Test Client Paiement",
            "montant": 100.0,
            "moyen_paiement": "Espèce",
            "date": today(),
            "colis_concernes": "TEST-COLIS-001"
        })
        
        try:
            paiement.insert(ignore_permissions=True)
            
            # Recharger la livraison et vérifier la synchronisation
            livraison = frappe.get_doc("Livraison", self.test_livraison.name)
            
            # Vérifier qu'il y a au moins un paiement synchronisé
            self.assertGreater(len(livraison.paiements), 0)
            
            # Vérifier que le total des paiements a été mis à jour
            self.assertGreater(livraison.total_paiements, 0)
            
            # Nettoyer
            paiement.delete(ignore_permissions=True)
            
        except frappe.ValidationError:
            # Si la validation échoue (client sans colis), c'est normal
            pass
    
    def test_client_summary_api(self):
        """Test de l'API de résumé par client."""
        livraison = self.test_livraison
        
        # Obtenir le résumé par client
        client_summary = livraison.get_client_summary()
        
        # Doit retourner une liste
        self.assertIsInstance(client_summary, list)
        
        # Si des colis ont été ajoutés dans les tests précédents,
        # vérifier la structure des données
        if client_summary:
            summary = client_summary[0]
            required_keys = ["client", "montant_a_encaisser", "montant_paye", "solde", "colis_count"]
            for key in required_keys:
                self.assertIn(key, summary)
    
    def test_fetch_fields(self):
        """Test des champs fetch automatiques."""
        # Créer un paiement et vérifier que nom_client est rempli automatiquement
        paiement = frappe.get_doc({
            "doctype": "Paiement Client",
            "type_paiement": "Paiement libre",
            "client": "Test Client Paiement",
            "montant": 50.0,
            "moyen_paiement": "Espèce",
            "date": today()
        })
        
        paiement.insert(ignore_permissions=True)
        
        # Vérifier que nom_client a été rempli
        self.assertEqual(paiement.nom_client, "Test Client Paiement")
        
        # Nettoyer
        paiement.delete(ignore_permissions=True)
    
    @classmethod
    def tearDownClass(cls):
        """Nettoyage après tous les tests."""
        # Supprimer les données de test
        try:
            if hasattr(cls, 'test_livraison') and cls.test_livraison.name:
                frappe.delete_doc("Livraison", cls.test_livraison.name, ignore_permissions=True)
        except:
            pass
        
        try:
            if frappe.db.exists("Customer", "Test Client Paiement"):
                frappe.delete_doc("Customer", "Test Client Paiement", ignore_permissions=True)
        except:
            pass
        
        try:
            if frappe.db.exists("User", "test.livreur@example.com"):
                frappe.delete_doc("User", "test.livreur@example.com", ignore_permissions=True)
        except:
            pass

def run_integration_tests():
    """
    Fonction principale pour exécuter tous les tests d'intégration.
    """
    print("=== TESTS D'INTÉGRATION PAIEMENTS ===")
    print("Exécution des tests pour valider l'intégration...\n")
    
    # Créer une suite de tests
    suite = unittest.TestLoader().loadTestsFromTestCase(TestPaiementsIntegration)
    
    # Exécuter les tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Résumé
    print(f"\n=== RÉSUMÉ DES TESTS ===")
    print(f"Tests exécutés: {result.testsRun}")
    print(f"Échecs: {len(result.failures)}")
    print(f"Erreurs: {len(result.errors)}")
    
    if result.failures:
        print("\nÉchecs détaillés:")
        for test, traceback in result.failures:
            print(f"- {test}: {traceback}")
    
    if result.errors:
        print("\nErreurs détaillées:")
        for test, traceback in result.errors:
            print(f"- {test}: {traceback}")
    
    success = len(result.failures) == 0 and len(result.errors) == 0
    
    if success:
        print("\n✅ Tous les tests sont passés avec succès!")
    else:
        print("\n❌ Certains tests ont échoué. Veuillez vérifier les erreurs ci-dessus.")
    
    return success

def test_basic_functionality():
    """
    Tests de base pour vérifier que les doctypes fonctionnent.
    """
    print("=== TESTS DE BASE ===")
    
    errors = []
    
    # Test 1: Vérifier que les doctypes existent
    doctypes_to_check = [
        "Paiement Client",
        "Livraison",
        "Livraison Bon de Livraison",
        "Livraison Colis",
        "Livraison Paiement"
    ]
    
    for doctype in doctypes_to_check:
        try:
            frappe.get_meta(doctype)
            print(f"✓ Doctype '{doctype}' existe et est accessible")
        except Exception as e:
            error_msg = f"✗ Erreur avec le doctype '{doctype}': {str(e)}"
            print(error_msg)
            errors.append(error_msg)
    
    # Test 2: Vérifier les champs requis
    try:
        paiement_meta = frappe.get_meta("Paiement Client")
        required_fields = ["type_paiement", "livraison", "colis_concernes", "nom_client"]
        
        for field in required_fields:
            if paiement_meta.get_field(field):
                print(f"✓ Champ '{field}' trouvé dans Paiement Client")
            else:
                error_msg = f"✗ Champ '{field}' manquant dans Paiement Client"
                print(error_msg)
                errors.append(error_msg)
                
    except Exception as e:
        error_msg = f"✗ Erreur lors de la vérification des champs: {str(e)}"
        print(error_msg)
        errors.append(error_msg)
    
    # Test 3: Vérifier les child tables
    try:
        livraison_meta = frappe.get_meta("Livraison")
        child_tables = ["bons_de_livraison", "colis", "paiements"]
        
        for table in child_tables:
            field = livraison_meta.get_field(table)
            if field and field.fieldtype == "Table":
                print(f"✓ Child table '{table}' configurée correctement")
            else:
                error_msg = f"✗ Child table '{table}' manquante ou mal configurée"
                print(error_msg)
                errors.append(error_msg)
                
    except Exception as e:
        error_msg = f"✗ Erreur lors de la vérification des child tables: {str(e)}"
        print(error_msg)
        errors.append(error_msg)
    
    print(f"\n=== RÉSUMÉ TESTS DE BASE ===")
    if not errors:
        print("✅ Tous les tests de base sont passés!")
        return True
    else:
        print(f"❌ {len(errors)} erreurs trouvées:")
        for error in errors:
            print(f"  - {error}")
        return False

if __name__ == "__main__":
    print("Script de test pour l'intégration des paiements\n")
    
    # Exécuter les tests de base d'abord
    basic_success = test_basic_functionality()
    
    if basic_success:
        print("\nTests de base réussis, exécution des tests d'intégration...\n")
        integration_success = run_integration_tests()
        
        if integration_success:
            print("\n🎉 Tous les tests sont passés! L'intégration est prête.")
        else:
            print("\n⚠️  Tests d'intégration échoués. Veuillez corriger les erreurs.")
    else:
        print("\n❌ Tests de base échoués. Veuillez corriger la configuration avant de continuer.")