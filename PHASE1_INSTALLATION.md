# Phase 1 - Installation et Configuration

## Vue d'ensemble

Cette phase implémente la préparation des données et l'infrastructure de base pour le système de répartition automatique des livraisons.

## Composants créés

### 1. Nouveaux Child Doctypes
- **Livreur Wilaya** : Zones de couverture par wilaya pour les livreurs
- **Livreur Commune** : Zones de couverture par commune pour les livreurs
- **Vehicule Wilaya** : Zones autorisées par wilaya pour les véhicules

### 2. Nouveau Doctype Principal
- **Depot Distribution** : Gestion des dépôts avec géolocalisation
- **Parametres Livraison** : Configuration globale du système (Single DocType)

### 3. Modifications des Doctypes existants

#### Livreur
- `capacite_max_colis` : Capacité maximale en nombre de colis
- `charge_actuelle` : Charge actuelle (lecture seule, mise à jour automatique)
- `type_couverture` : Locale/Régionale/Nationale
- `specialisation` : Standard/Express/Longue distance/Fragile
- `priorite_attribution` : Priorité d'attribution (1-10)
- `wilayas_autorisees` : Table des wilayas autorisées
- `communes_autorisees` : Table des communes autorisées

#### Vehicule
- `cout_km` : Coût par kilomètre
- `wilayas_autorisees` : Table des wilayas autorisées

#### Commune
- `latitude` : Coordonnée GPS latitude
- `longitude` : Coordonnée GPS longitude
- `distance_depot` : Distance calculée du dépôt principal (lecture seule)

#### Livraison
- `batch_id` : Identifiant unique pour l'idempotence

### 4. Utilitaires
- **geolocation.py** : Fonctions de géocodage et calcul de distances
- **distribution.py** : Algorithmes de répartition et attribution

### 5. Interface utilisateur
- **Page Desk "Génération Livraisons"** : Interface complète avec mode Dry-Run

### 6. Tâches planifiées
- Géocodage quotidien des communes
- Calcul quotidien des distances depuis le dépôt

## Instructions d'installation

### 1. Installation des dépendances

```bash
# Installer geopy pour la géolocalisation
pip install geopy>=2.3.0
```

### 2. Migration de la base de données

```bash
# Migrer la base de données pour créer les nouveaux champs
bench migrate
```

### 3. Exécution des patches

```bash
# Exécuter le patch de migration des données
bench execute log.patches.v1_0.migrate_data_phase1.execute

# Ajouter les index de performance
bench execute log.patches.v1_0.add_performance_indexes.execute
```

### 4. Configuration initiale

#### 4.1 Configurer le dépôt principal
1. Aller dans **Depot Distribution**
2. Modifier le dépôt créé automatiquement
3. Mettre à jour l'adresse et les coordonnées GPS réelles

#### 4.2 Configurer les paramètres de livraison
1. Aller dans **Parametres Livraison**
2. Ajuster les seuils de distance selon vos besoins :
   - `seuil_local_km` : Distance maximale pour livraison locale (défaut: 20 km)
   - `seuil_regional_km` : Distance maximale pour livraison régionale (défaut: 100 km)

#### 4.3 Configurer les livreurs existants
1. Aller dans la liste **Livreur**
2. Pour chaque livreur, configurer :
   - Capacité maximale de colis
   - Type de couverture
   - Spécialisation (optionnel)
   - Priorité d'attribution
   - Zones autorisées (wilayas/communes)

#### 4.4 Configurer les véhicules existants
1. Aller dans la liste **Vehicule**
2. Pour chaque véhicule, configurer :
   - Coût par kilomètre
   - Zones autorisées (wilayas)

### 5. Géocodage initial

```bash
# Lancer le géocodage des communes (peut prendre du temps)
bench execute log.utils.geolocation.geocoder_communes

# Calculer les distances depuis le dépôt
bench execute log.utils.geolocation.calculer_distances_depot
```

### 6. Test de l'interface

1. Aller dans **Génération Livraisons** (menu Desk)
2. Sélectionner une date avec des colis "En attente"
3. Activer le mode "Dry-Run"
4. Cliquer sur "Simuler Répartition"

## Vérifications post-installation

### 1. Vérifier les données

```sql
-- Vérifier que les livreurs ont des capacités définies
SELECT name, capacite_max_colis, type_couverture FROM `tabLivreur` WHERE active = 1;

-- Vérifier que le dépôt principal existe
SELECT * FROM `tabDepot Distribution` WHERE is_default = 1;

-- Vérifier les paramètres
SELECT * FROM `tabParametres Livraison`;
```

### 2. Vérifier les index

```sql
-- Vérifier que les index ont été créés
SHOW INDEX FROM `tabLivreur`;
SHOW INDEX FROM `tabCommune`;
```

### 3. Test des fonctions

```python
# Dans la console Frappe
from log.utils.geolocation import geocoder_commune_specifique
from log.utils.distribution import classifier_livraison_par_distance

# Test géocodage
result = geocoder_commune_specifique("COM-0001")
print(result)

# Test classification
classification = classifier_livraison_par_distance("COM-0001")
print(classification)
```

## Problèmes courants

### 1. Erreur geopy
- **Problème** : Module geopy non trouvé
- **Solution** : `pip install geopy` dans l'environnement virtuel

### 2. Erreur de géocodage
- **Problème** : Limite de taux dépassée
- **Solution** : Augmenter `rate_limit_geocoding` dans les paramètres

### 3. Aucune répartition générée
- **Problème** : Pas de colis "En attente" ou livreurs mal configurés
- **Solution** : Vérifier les statuts des colis et la configuration des livreurs

## Prochaines étapes

Une fois la Phase 1 terminée et testée :
1. **Phase 2** : Implémentation des algorithmes avancés
2. **Phase 3** : Interface utilisateur complète
3. **Phase 4** : Optimisation et monitoring

## Support

Pour toute question ou problème, consulter :
- Les logs Frappe : `bench logs`
- Les logs d'erreur : Menu > Outils > Logs d'erreur
- La documentation Frappe : https://frappeframework.com/docs