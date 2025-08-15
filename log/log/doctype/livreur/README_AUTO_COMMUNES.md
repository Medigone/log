# Fonctionnalité de Remplissage Automatique des Communes

## Vue d'ensemble

Cette fonctionnalité permet de remplir automatiquement la table des communes autorisées d'un livreur en fonction des wilayas sélectionnées dans la table des wilayas autorisées.

## Comment ça fonctionne

### Automatique (côté serveur)

Lorsque vous sauvegardez un document Livreur :

1. **Ajout de wilayas** : Toutes les communes appartenant aux wilayas sélectionnées sont automatiquement ajoutées à la table "Communes autorisées"
2. **Suppression de wilayas** : Les communes qui n'appartiennent plus aux wilayas sélectionnées sont automatiquement supprimées
3. **Évitement des doublons** : Le système vérifie et évite les doublons automatiquement

### Temps réel (côté client)

Lors de la modification de la table "Wilayas autorisées" :

- **Ajout d'une wilaya** : Les communes correspondantes sont ajoutées immédiatement (avec un délai de 500ms)
- **Suppression d'une wilaya** : Les communes correspondantes sont supprimées immédiatement
- **Validation** : Le système empêche l'ajout de wilayas en double

## Utilisation

### Interface utilisateur

1. **Ouvrir un document Livreur** (nouveau ou existant)
2. **Aller à la section "Zones de couverture"**
3. **Ajouter des wilayas** dans la table "Wilayas autorisées"
4. **Observer** que les communes se remplissent automatiquement dans la table "Communes autorisées"

### Bouton de synchronisation manuelle

Pour les documents existants, un bouton "Synchroniser Communes" est disponible dans le menu "Actions" :

- Cliquez sur **Actions > Synchroniser Communes**
- Le système synchronise les communes avec les wilayas actuellement sélectionnées
- Un message de confirmation s'affiche

## Validation et contrôles

### Côté serveur (Python)

- **Évitement des doublons** : Vérification automatique des communes déjà présentes
- **Cohérence des données** : Suppression des communes orphelines (sans wilaya correspondante)
- **Performance** : Requêtes optimisées pour récupérer les communes

### Côté client (JavaScript)

- **Validation des doublons** : Empêche l'ajout de wilayas en double
- **Mise à jour temps réel** : Synchronisation immédiate lors des modifications
- **Messages utilisateur** : Alertes et confirmations pour informer l'utilisateur

## Structure technique

### Fichiers modifiés

1. **`livreur.py`** :
   - Méthode `validate()` : Validation automatique lors de la sauvegarde
   - Méthode `auto_populate_communes_from_wilayas()` : Logique principale
   - Méthode `auto_populate_communes_from_wilayas_api()` : API publique pour l'interface

2. **`livreur.js`** :
   - Événements sur le formulaire principal
   - Événements sur la table enfant "Livreur Wilaya"
   - Fonction utilitaire `update_communes_from_wilayas()`
   - Bouton de synchronisation manuelle

3. **`test_livreur.py`** :
   - Tests unitaires pour toutes les fonctionnalités
   - Tests de validation et de cohérence
   - Tests de l'API

### Relations de données

```
Livreur
├── wilayas_autorisees (Table: Livreur Wilaya)
│   └── wilaya (Link: Wilaya)
└── communes_autorisees (Table: Livreur Commune)
    └── commune (Link: Commune)
        └── wilaya (Link: Wilaya)
```

## Exemples d'utilisation

### Exemple 1 : Nouveau livreur

```python
# Créer un nouveau livreur
livreur = frappe.get_doc({
    "doctype": "Livreur",
    "nom": "Ahmed Benali",
    "wilayas_autorisees": [
        {"wilaya": "Alger"},
        {"wilaya": "Blida"}
    ]
})

# Sauvegarder - les communes seront ajoutées automatiquement
livreur.insert()

# Vérifier les communes ajoutées
print(f"Communes ajoutées : {len(livreur.communes_autorisees)}")
```

### Exemple 2 : Synchronisation manuelle

```python
# Récupérer un livreur existant
livreur = frappe.get_doc("Livreur", "LIV-001")

# Ajouter une wilaya manuellement
livreur.append("wilayas_autorisees", {"wilaya": "Constantine"})

# Synchroniser les communes
result = livreur.auto_populate_communes_from_wilayas_api()
print(result["message"])  # "Communes synchronisées avec succès"
```

## Tests

Pour exécuter les tests :

```bash
# Exécuter tous les tests du doctype Livreur
bench --site [site-name] run-tests log.log.doctype.livreur.test_livreur

# Exécuter un test spécifique
bench --site [site-name] run-tests log.log.doctype.livreur.test_livreur.TestLivreur.test_auto_populate_communes_from_wilayas
```

## Dépannage

### Problèmes courants

1. **Les communes ne se remplissent pas automatiquement**
   - Vérifiez que les wilayas existent dans le système
   - Vérifiez que les communes ont bien un lien vers la wilaya
   - Consultez les logs d'erreur

2. **Doublons dans les communes**
   - Utilisez le bouton "Synchroniser Communes" pour nettoyer
   - Vérifiez la cohérence des données dans la base

3. **Performance lente**
   - Vérifiez les index sur les tables Commune et Wilaya
   - Limitez le nombre de wilayas sélectionnées si nécessaire

### Logs et débogage

```python
# Activer les logs de débogage
import frappe
frappe.log_error("Message de débogage", "Livreur Auto Communes")
```

## Évolutions futures

- **Cache intelligent** : Mise en cache des relations wilaya-commune
- **Sélection partielle** : Permettre la sélection de communes spécifiques dans une wilaya
- **Historique** : Traçabilité des modifications automatiques
- **Notifications** : Alertes lors de modifications importantes