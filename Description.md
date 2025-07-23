## Contexte général

Cette documentation fournit le contexte nécessaire pour générer une custom app sur le Frappe Framework (ERPNext) destinée à la gestion logistique d'une société de distribution opérant en Algérie.

**Pays cible :** Algérie
**Secteur :** Distribution de marchandises
**Technologie :** Frappe Framework (ERPNext)

---

## Objectifs de l'application

1. **Gestion des véhicules et des livreurs internes**

   * Suivi des véhicules par référence, capacité, statut (disponible, en tournée, maintenance).
   * Profilage des livreurs : identifiants, disponibilités, permis, statut (actif/inactif).

2. **Gestion des colis**

   * Création et suivi des colis de livraison.
   * Un bon de livraison peut regrouper plusieurs colis.

3. **Gestion des paiements à la livraison (Cash on Delivery)**

   * Suivi des promesses et statuts de paiement directement depuis le doctype « Paiement Client ».
   * Traitement des paiements partiels et complets.

4. **Gestion des stocks et entrepôts mobiles**

   * Transfert de stock vers l’entrepôt associé au véhicule lors de l’enlèvement.
   * Destockage du véhicule à la livraison.

## Flux Métier (Scénario de livraison)

1. Création du **Customer**
2. Creation de la **commande client** via le doctype **Sales Order**
3. Génération de la **Delivery Note** via le doctype **Sales Order**
4. Génération des **Colis** a partir des articles de la delivery note
5. Affectation d’un **Véhicule** et d’un **Livreur**.
6. **Transfert de stock** vers l’**Entrepôt** du véhicule lors de l’enlèvement des colis.
7. Lorsque le colis est livré, **Déstockage** du véhicule et création d'un nouveau **Paiement Client** pour tout paiement ou promesse de paiement.
8. Lorsque tous les colis sont livres mettre le delivery note au statut Livré

## Annexes

* Documentation Frappe Framework & ERPNext.

## Structure des dossiers des Doctypes


* Chaque sous-dossier `doctype/<doctype_name>/` doit contenir :

  * `<doctype_name>.py` pour la logique serveur
  * `<doctype_name>_list.js` pour étendre la liste
  * `<doctype_name>.js` pour la logique client
  * `<doctype_name>.css` pour les styles (facultatif)
  * `test_<doctype_name>.py` pour les tests unitaires

* Le fichier `hooks.py` à la racine de l’app déclare les modules, fixtures, événements et autorisations.

* Utilisez `modules.py` dans `config/` pour enregistrer vos modules personnalisés.

* Placez les données de référence (fixtures JSON) dans `fixtures/` si nécessaire.

---

## Analyse de l'implémentation actuelle

### État d'avancement ✅

L'application **Log** est actuellement bien développée avec les doctypes suivants implémentés :

#### Doctypes personnalisés créés :
- **Vehicule** : Gestion complète des véhicules avec suivi maintenance, assurance, contrôle technique
- **Livreur** : Profils des livreurs avec gestion des permis et statuts
- **Colis** : Traçabilité avec QR codes et numérotation séquentielle
- **Paiement** : Gestion Cash on Delivery (espèces/chèques)
- **Wilaya/Commune** : Référentiel géographique algérien complet
- **Consommation Carburant** : Suivi des coûts carburant
- **Entretien Vehicule** : Planification et suivi maintenance
- **Livraison** : Gestion des tournées de livraison
- **Transferts Marchandise** : Gestion des transferts entre entrepôts
- **Articles Colis** : Table enfant pour le contenu des colis

#### Customisations ERPNext :
- **Customer** : Ajout champs Wilaya/Commune
- **Delivery Note** : Intégration avec système de colis
- **Sales Order** : Adaptations pour le workflow logistique

### Points forts de l'implémentation 🎯

1. **Architecture respectueuse des conventions Frappe**
   - Structure modulaire bien organisée
   - Fichiers de test présents pour chaque doctype
   - Fixtures JSON pour données de référence

2. **Fonctionnalités avancées**
   - Génération automatique de QR codes pour colis
   - Interface utilisateur optimisée (quick entry, filtres)
   - Gestion des états avec codes couleur
   - Support bilingue français/arabe

3. **Intégration intelligente**
   - Customisation non-intrusive des doctypes natifs
   - Workflow cohérent avec ERPNext standard
   - Référentiel géographique algérien complet

### Recommandations d'amélioration 🔧

#### Priorité haute :
1. **Gestion des stocks mobiles**
   - Implémenter la logique de transfert vers "entrepôt véhicule"
   - Automatiser le destockage à la livraison
   - Créer des entrepôts virtuels par véhicule

2. **Workflows automatisés**
   - Automatiser la création de colis depuis Delivery Note
   - Synchroniser les statuts entre Colis et Delivery Note
   - Implémenter les hooks pour les événements métier

#### Priorité moyenne :
3. **Dashboards et reporting**
   - Tableau de bord livreurs/véhicules
   - Indicateurs de performance (KPI)
   - Rapports de rentabilité par tournée

4. **Notifications et alertes**
   - Alertes maintenance véhicules
   - Notifications échéances assurance/contrôle technique
   - Suivi des retards de livraison

#### Priorité basse :
5. **Optimisations UX**
   - Interface mobile pour livreurs
   - Géolocalisation des livraisons
   - Optimisation des tournées

### Architecture technique recommandée 🏗️

```
log/
├── api/                    # API endpoints personnalisés
├── utils/                  # Fonctions utilitaires
├── workflows/              # Définitions de workflows
├── dashboards/             # Configurations dashboards
└── reports/                # Rapports personnalisés
```

### Prochaines étapes suggérées 📋

1. **Phase 1** : Finaliser la gestion des stocks mobiles
2. **Phase 2** : Implémenter les workflows automatisés
3. **Phase 3** : Développer les dashboards et rapports
4. **Phase 4** : Ajouter les fonctionnalités avancées (mobile, géolocalisation)

### Conclusion 🎉

L'application **Log** présente une base solide et professionnelle. L'architecture est bien pensée, l'intégration avec ERPNext est intelligente, et la prise en compte du contexte algérien est exemplaire. Avec les améliorations suggérées, cette application sera parfaitement opérationnelle pour une société de distribution.

**Note d'évaluation : 8.5/10** - Excellent travail avec un potentiel d'évolution remarquable !

*Fin du document de contexte.*
