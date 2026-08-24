# Interface Frontend pour les Livraisons

Cette interface frontend permet de gérer et visualiser les livraisons dans le système LOG.

## Fonctionnalités

### 1. Tableau de bord des livraisons
- **Vue d'ensemble** : Statistiques globales (nombre de livraisons, colis, chiffre d'affaires)
- **Répartition par statut** : Visualisation des livraisons par statut
- **Top livreurs** : Classement des livreurs les plus actifs
- **Top véhicules** : Véhicules les plus utilisés
- **Évolution temporelle** : Suivi des 7 derniers jours
- **Livraisons récentes** : Liste des dernières livraisons créées

### 2. Liste des livraisons
- **Filtrage avancé** : Par statut, livreur, véhicule, commune, dates
- **Recherche** : Recherche textuelle dans les noms, livreurs, véhicules
- **Tri** : Par date, statut, nombre de colis
- **Pagination** : Navigation par pages
- **Vue détaillée** : Expansion des livraisons pour voir les détails

### 3. Détails d'une livraison
- **Informations générales** : Date, statut, livreur, véhicule
- **Liste des colis** : Tous les colis associés avec leurs statuts
- **Bons de livraison** : Documents de livraison liés
- **Statistiques** : Totaux et métriques de la livraison
- **Mise à jour temps réel** : Synchronisation automatique des données

## Structure des composants

### Pages principales
- `LivraisonsDashboard.tsx` : Tableau de bord avec statistiques
- `LivraisonsList.tsx` : Liste paginée et filtrable des livraisons
- `LivraisonDetails.tsx` : Vue détaillée d'une livraison

### Composants utilitaires
- `LivraisonNavigation.tsx` : Navigation entre les vues
- `LivraisonFilters.tsx` : Composant de filtrage avancé

### Types TypeScript
- `Livraison.ts` : Interfaces pour les données de livraisons

## Navigation

L'interface utilise un système d'onglets :
1. **Bons de livraison** : Interface existante pour les bons de livraison
2. **Livraisons** : Nouvelle interface avec sous-onglets :
   - **Tableau de bord** : Vue statistique
   - **Liste** : Vue liste détaillée

## Statuts des livraisons

Les livraisons peuvent avoir les statuts suivants :
- **Nouveau** : Livraison créée mais pas encore préparée
- **Préparé** : Tous les colis sont préparés
- **Partiellement Préparé** : Certains colis sont préparés
- **Enlevé** : Tous les colis ont été enlevés
- **Partiellement Enlevé** : Certains colis ont été enlevés
- **Livré** : Tous les colis ont été livrés
- **Partiellement Livré** : Certains colis ont été livrés
- **Annulé** : Livraison annulée

## Intégration avec le backend

L'interface utilise `frappe-react-sdk` pour :
- Récupération des données via `useFrappeGetDocList`
- Mise à jour temps réel via `useFrappeDocTypeEventListener`
- Authentification via `useFrappeAuth`

## Démarrage

```bash
cd /Users/aminemelizi/Frappe/frappe-bench/apps/log/Colis
npm install
npm run dev
```

L'interface sera accessible sur `http://localhost:8080/`

## Dépendances principales

- **React** : Framework frontend
- **Vite** : Outil de build
- **@radix-ui/themes** : Composants UI
- **frappe-react-sdk** : SDK pour Frappe
- **lucide-react** : Icônes
- **react-router-dom** : Routage
- **TypeScript** : Typage statique

## Personnalisation

Les couleurs des badges de statut peuvent être personnalisées dans les fonctions `getStatusBadgeColor()` de chaque composant.

Les filtres peuvent être étendus en modifiant l'interface `LivraisonFilters` dans `types/Livraison.ts`.