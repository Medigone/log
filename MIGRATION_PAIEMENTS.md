# Migration du Système de Paiements - Documentation

## Vue d'ensemble

Cette migration améliore le système de gestion des paiements en intégrant les paiements avec les livraisons et en modernisant la structure des données.

## Modifications apportées

### 1. Doctype "Paiement Client" - Améliorations

#### Nouveaux champs ajoutés :
- **type_paiement** : Select (Livraison, Paiement libre, Règlement de compte)
- **livraison** : Link vers Livraison (optionnel, obligatoire si type = "Livraison")
- **colis_concernes** : Small Text (liste des colis concernés par le paiement)
- **nom_client** : Data (fetch automatique depuis client.customer_name)

#### Logique de validation ajoutée :
- Validation que le montant est supérieur à zéro
- Pour les paiements de type "Livraison" :
  - Une livraison doit être sélectionnée
  - La livraison ne doit pas être annulée
  - Le client doit avoir des colis dans cette livraison

#### Nouvelles méthodes :
- `check_client_has_colis_in_livraison()` : Vérifie que le client a des colis dans la livraison
- `get_delivery_notes_from_livraison()` : Récupère les bons de livraison d'une livraison
- `get_available_colis_for_livraison()` : API pour obtenir les colis disponibles
- `update_livraison_totals()` : Met à jour les totaux de la livraison liée

### 2. Doctype "Livraison" - Restructuration complète

#### Anciens champs remplacés :
- `bl` (Data) → `bons_de_livraison` (Table)
- `liste_colis` (Data) → `colis` (Table)
- `pe` (Data) → `paiements` (Table)

#### Nouveaux champs de totaux :
- `total_colis` : Nombre total de colis
- `total_montant_a_encaisser` : Montant total à encaisser
- `total_paiements` : Total des paiements reçus
- `solde_restant` : Solde restant à encaisser

#### Nouvelles méthodes :
- `calculate_totals()` : Calcule automatiquement tous les totaux
- `sync_paiements_from_paiement_client()` : Synchronise les paiements
- `get_client_summary()` : API pour obtenir un résumé par client
- `load_delivery_notes()` : API pour charger les bons de livraison

### 3. Nouveaux Child Doctypes créés

#### Livraison Bon de Livraison
- `bon_de_livraison` : Link vers Delivery Note
- `customer`, `posting_date`, `total_qty`, `status` : Champs fetch automatiques

#### Livraison Colis
- `colis` : Link vers Colis
- `numero_sequence`, `client`, `bon_de_livraison`, `status` : Champs fetch automatiques
- `montant_a_encaisser` : Montant à encaisser pour ce colis

#### Livraison Paiement
- `paiement_client` : Link vers Paiement Client
- Tous les détails du paiement en fetch automatique

## Architecture des données

```
Livraison (Tournée quotidienne)
├── Informations générales (livreur, véhicule, date)
├── Bons de Livraison (Child Table)
│   └── Delivery Note → Customer, Date, Quantité
├── Colis (Child Table)
│   └── Colis → Client, Montant à encaisser
├── Paiements (Child Table)
│   └── Paiement Client → Montant, Moyen, Type
└── Totaux calculés automatiquement
```

## Workflow des paiements

### Scénario 1 : Paiement lors de livraison
1. Le livreur sélectionne une livraison active
2. Le système affiche les clients et montants à encaisser
3. Création d'un paiement avec :
   - `type_paiement` = "Livraison"
   - `livraison` = livraison sélectionnée
   - `client` et `montant` pré-remplis
   - `colis_concernes` = liste des colis payés

### Scénario 2 : Paiement libre
1. Création d'un paiement avec :
   - `type_paiement` = "Paiement libre"
   - `client` et `montant` saisis manuellement
   - Pas de lien avec une livraison

### Scénario 3 : Règlement de compte
1. Paiement pour régulariser un compte client
2. Peut être lié ou non à une livraison

## Étapes de migration

### 1. Préparation
```bash
# Sauvegarder la base de données
bench --site [site-name] backup

# Vérifier que tous les doctypes sont à jour
bench --site [site-name] migrate
```

### 2. Migration des données
```bash
# Exécuter le script de migration
cd /path/to/frappe-bench/apps/log/log/log/doctype/livraison/
python migration_script.py
```

### 3. Validation
- Vérifier que toutes les livraisons ont été migrées
- Contrôler la cohérence des totaux
- Tester la création de nouveaux paiements

### 4. Nettoyage (optionnel)
Après validation complète, supprimer les anciens champs :
- `bl` du doctype Livraison
- `liste_colis` du doctype Livraison
- `pe` du doctype Livraison

## Avantages de la nouvelle architecture

### 1. Flexibilité
- Paiements liés aux livraisons ou indépendants
- Support de différents types de paiements
- Gestion fine des colis concernés

### 2. Traçabilité
- Historique complet des paiements par livraison
- Lien direct entre colis et paiements
- Calculs automatiques et cohérents

### 3. Reporting
- Totaux automatiques par livraison
- Résumé par client
- Suivi des soldes restants

### 4. Évolutivité
- Structure extensible pour de nouvelles fonctionnalités
- APIs prêtes pour l'interface mobile
- Intégration facile avec d'autres modules

## APIs disponibles

### Paiement Client
```python
# Obtenir les colis disponibles pour paiement
paiement.get_available_colis_for_livraison()
```

### Livraison
```python
# Obtenir le résumé par client
livraison.get_client_summary()

# Charger les bons de livraison
livraison.load_delivery_notes()
```

## Prochaines étapes recommandées

1. **Interface utilisateur** : Développer les composants React pour la gestion des paiements
2. **Mobile** : Créer une interface mobile optimisée pour les livreurs
3. **Notifications** : Système d'alertes pour les paiements en retard
4. **Reporting avancé** : Tableaux de bord pour le suivi des performances
5. **Intégration comptable** : Synchronisation avec les modules de comptabilité

## Support et maintenance

Pour toute question ou problème :
1. Vérifier les logs Frappe : `bench --site [site-name] logs`
2. Consulter la documentation Frappe
3. Tester en mode développement avant la production

---

**Note importante** : Cette migration modifie la structure des données. Il est essentiel de tester en environnement de développement avant de déployer en production.