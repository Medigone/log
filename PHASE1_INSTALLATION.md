# Guide d'installation - Application Log

## Vue d'ensemble

Cette application gère la logistique des livraisons via l'interface Desk standard de Frappe. Les livraisons sont gérées directement via le DocType standard `Delivery Note` d'ERPNext avec des champs personnalisés pour les informations de livraison.

## Composants principaux

### DocTypes

- **Livreur** : Gestion des livreurs
- **Vehicule** : Gestion des véhicules
- **Depot Distribution** : Gestion des dépôts
- **Parametres Livraison** : Configuration globale du système (Single DocType)
- **Commune** : Communes avec coordonnées GPS (optionnel)
- **Wilaya** : Wilayas
- **Paiement Client** : Gestion des paiements clients

### Champs personnalisés sur Delivery Note

- `custom_livreur` : Livreur assigné
- `custom_nom_livreur` : Nom du livreur (auto-rempli)
- `custom_véhicule` : Véhicule utilisé
- `custom_date_de_livraison` : Date de livraison prévue
- `custom_commune` : Commune de livraison
- `custom_wilaya` : Wilaya de livraison

### Fonctionnalités

- Création et gestion des livraisons via les Delivery Notes
- Assignation des livreurs et véhicules directement sur le bon de livraison
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

### Gestion des livraisons

1. Créer un **Delivery Note** via le processus ERPNext standard
2. Renseigner le livreur dans le champ `custom_livreur`
3. Le nom du livreur et le véhicule seront automatiquement remplis
4. Indiquer la date de livraison prévue dans `custom_date_de_livraison`

### Gestion des paiements

1. Utiliser le DocType **Paiement Client** pour enregistrer les paiements
2. Sélectionner le client et le bon de livraison concerné

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
