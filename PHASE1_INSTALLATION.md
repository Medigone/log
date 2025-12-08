# Guide d'installation - Application Log

## Vue d'ensemble

Cette application gère la logistique des livraisons via l'interface Desk standard de Frappe.

## Composants principaux

### DocTypes

- **Livraison** : Gestion des livraisons avec bons de livraison associés
- **Livreur** : Gestion des livreurs
- **Vehicule** : Gestion des véhicules
- **Depot Distribution** : Gestion des dépôts
- **Parametres Livraison** : Configuration globale du système (Single DocType)
- **Commune** : Communes avec coordonnées GPS (optionnel)
- **Wilaya** : Wilayas

### Fonctionnalités

- Création et gestion des livraisons via le Desk Frappe
- Association automatique des bons de livraison (Delivery Note) aux livraisons
- Calcul automatique des totaux (articles, montants, paiements)
- Gestion des paiements clients

## Instructions d'installation

### 1. Migration de la base de données

```bash
# Migrer la base de données pour créer les nouveaux champs
bench --site [nom_du_site] migrate
```

### 2. Configuration initiale

#### 2.1 Configurer le dépôt principal
1. Aller dans **Depot Distribution**
2. Créer ou modifier le dépôt principal
3. Mettre à jour l'adresse

#### 2.2 Configurer les paramètres de livraison
1. Aller dans **Parametres Livraison**
2. Ajuster les paramètres selon vos besoins

#### 2.3 Configurer les livreurs
1. Aller dans la liste **Livreur**
2. Pour chaque livreur, configurer le nom et le véhicule associé

#### 2.4 Configurer les véhicules
1. Aller dans la liste **Vehicule**
2. Renseigner les informations de chaque véhicule

## Utilisation

### Création d'une livraison

1. Aller dans **Livraison** > **Nouveau**
2. Sélectionner le livreur et la date de livraison
3. Les bons de livraison correspondant à la date seront chargés automatiquement
4. Sauvegarder

### Gestion des paiements

1. Utiliser le DocType **Paiement Client** pour enregistrer les paiements
2. Les totaux de la livraison seront automatiquement mis à jour

## Vérifications post-installation

### Vérifier les données

```sql
-- Vérifier les livreurs actifs
SELECT name, nom, vehicule FROM `tabLivreur` WHERE active = 1;

-- Vérifier le dépôt principal
SELECT * FROM `tabDepot Distribution` WHERE is_default = 1;

-- Vérifier les paramètres
SELECT * FROM `tabParametres Livraison`;
```

## Support

Pour toute question ou problème, consulter :
- Les logs Frappe : `bench logs`
- Les logs d'erreur : Menu > Outils > Logs d'erreur
- La documentation Frappe : https://frappeframework.com/docs
