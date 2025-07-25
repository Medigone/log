# Plan d'Interface Frontend pour les Livreurs

## 1. Vue d'ensemble du Projet

Développement d'une interface frontend moderne pour les livreurs utilisant **React** (avec Vite), Tailwind CSS et le SDK Frappe React, permettant la gestion complète du workflow de livraison des colis via scan QR Code.

* **Objectif** : Simplifier et digitaliser le processus de livraison pour les livreurs

* **Technologies** : React, Tailwind CSS, Frappe React SDK, Vite

* **Intégration** : APIs Frappe Framework pour la gestion des doctypes Colis et Articles Colis

## 2. Fonctionnalités Principales

### 2.1 Rôles Utilisateurs

| Rôle    | Méthode d'Accès       | Permissions Principales                                                               |
| ------- | --------------------- | ------------------------------------------------------------------------------------- |
| Livreur | Scan QR Code du colis | Peut modifier les statuts de livraison, ajouter photos/signatures, gérer les articles |

### 2.2 Modules de Fonctionnalités

L'interface livreur comprend uniquement la page de détails du colis et ses modules associés :

1. **Page Détails Colis** : Informations colis, gestion statuts, liste articles
2. **Page Gestion Articles** : Sélection articles livrés, quantités, statuts individuels
3. **Page Confirmation** : Signature client, photo livraison, commentaires

### 2.3 Détails des Pages

| Page             | Module                | Description des Fonctionnalités                                                               |
| ---------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| Détails Colis    | Informations Colis    | Afficher numéro séquence, client, date, statut actuel, bon de livraison                       |
| Détails Colis    | Actions Statut        | Boutons pour changer statut : Préparé → Enlevé → Partiellement Livré → Livré/Non Livré/Annulé |
| Détails Colis    | Liste Articles        | Afficher tous les articles avec quantités totales, livrées, restantes                         |
| Gestion Articles | Sélection Articles    | Interface pour sélectionner articles à livrer avec quantités modifiables                      |
| Gestion Articles | Statuts Individuels   | Marquer chaque article comme livré/partiellement livré/non livré                              |
| Gestion Articles | Raisons Non-Livraison | Sélection raisons : Client absent, Adresse incorrecte, Refus client, Article endommagé, etc.  |
| Confirmation     | Signature Client      | Capture signature numérique du client                                                         |
| Confirmation     | Photo Livraison       | Prise de photo comme preuve de livraison                                                      |
| Confirmation     | Commentaires          | Zone texte pour commentaires livreur et raisons détaillées                                    |

## 3. Workflow Principal

**Flux Livreur Standard :**

1. Livreur scanne le QR Code du colis (hors application, ou via lien direct)
2. Accès automatique à la page détails du colis via le qrcode (Lien de type : frontend\_url = f"{site\_url}/frontend/colis/{self.name}")
3. Consultation des informations et articles
4. Changement de statut selon la situation :

   * **Préparé** : Colis prêt pour enlèvement

   * **Enlevé** : Colis récupéré du dépôt

   * **Partiellement Livré** : Sélection articles livrés + quantités

   * **Livré** : Tous articles livrés + signature + photo

   * **Non Livré** : Raison + commentaire

   * **Annulé** : Annulation avec justification

**Flux Livraison Partielle :**

1. Sélection du statut "Partiellement Livré"
2. Interface de gestion des articles avec quantités
3. Sélection des articles effectivement livrés
4. Mise à jour automatique des quantités restantes
5. Signature client et photo si nécessaire

```mermaid
graph TD
    A[Scan QR Code (externe)] --> B[Page Détails Colis]
    B --> C{Choisir Action}
    C --> D[Marquer Préparé]
    C --> E[Marquer Enlevé]
    C --> F[Livraison Partielle]
    C --> G[Livraison Complète]
    C --> H[Non Livré]
    C --> I[Annuler]
    F --> J[Gestion Articles]
    G --> K[Confirmation]
    H --> L[Raisons + Commentaires]
    I --> L
    J --> K
    K --> M[Signature + Photo]
    L --> N[Finalisation]
    M --> N
```

## 4. Design de l'Interface

### 4.1 Style de Design

* **Couleurs Principales** : Bleu (#3B82F6) pour les actions principales, Vert (#10B981) pour les validations

* **Couleurs Secondaires** : Gris (#6B7280) pour les textes, Rouge (#EF4444) pour les erreurs

* **Style Boutons** : Boutons arrondis (rounded-lg) avec ombres légères

* **Police** : Inter ou système par défaut, tailles 14px-18px pour lisibilité mobile

* **Layout** : Design mobile-first avec cartes (cards) pour organiser le contenu

* **Icônes** : Heroicons ou Lucide pour cohérence avec Frappe UI

### 4.2 Aperçu Design des Pages

| Page             | Module    | Éléments UI                                                         |
| ---------------- | --------- | ------------------------------------------------------------------- |
| Détails Colis    | En-tête   | Badge statut coloré, numéro colis, informations client en cards     |
| Détails Colis    | Actions   | Boutons statut avec couleurs distinctives, confirmations modales    |
| Gestion Articles | Liste     | Table responsive avec checkboxes, inputs quantité, badges statut    |
| Gestion Articles | Contrôles | Boutons +/- pour quantités, sélecteurs raisons, validation globale  |
| Confirmation     | Capture   | Zone signature tactile, prévisualisation photo, champs commentaires |

### 4.3 Responsivité

Application mobile-first optimisée pour smartphones avec support tablettes. Interface tactile optimisée pour utilisation terrain avec gants.

## 5. Architecture Technique

### 5.1 Structure Frontend

**Configuration Serveur :**

* **URL Production** : <https://log.intrapro.net> (port 80)

* **Mode** : Développement activé en production

* **Proxy** : Vite dev server → Frappe backend

* **HTTPS** : Certificat SSL configuré

**Basé sur Frappe React SDK :**

* **Framework** : React (avec Vite)

* **Styling** : Tailwind CSS + composants UI compatibles React (ex : Frappe UI React, Heroicons, etc.)

* **Build Tool** : Vite avec proxy vers <https://log.intrapro.net>

* **Router** : React Router pour navigation SPA

* **State Management** : Zustand ou Redux (ou autre gestion d'état adaptée à React)

* **API** : Utilisation du SDK Frappe React pour toutes les interactions avec le backend Frappe ([voir doc](https://frappe-react.vercel.app/))

### 5.2 Intégration Frappe

**APIs Frappe utilisées via le SDK Frappe React :**

* `useFrappeGetDoc` : Récupération données colis

* `useFrappeUpdateDoc` : Mise à jour statuts

* `useFrappeCreateDoc` / `useFrappeDeleteDoc` : Gestion articles

* `useFrappeFileUpload` : Upload photo/signature

* Hooks custom pour logique métier spécifique

**Configuration requise :**

* `site_config.json` : `"ignore_csrf": 1` pour développement

* Permissions Guest sur doctype Colis pour accès QR

* Hooks personnalisés pour validation workflow

### 5.3 Structure Dossiers

```
log/
├── frontend/                 # Application React
│   ├── src/
│   │   ├── components/      # Composants réutilisables
│   │   │   ├── ColisDetails/
│   │   │   ├── ArticleManager/
│   │   │   └── Confirmation/
│   │   ├── hooks/           # Hooks custom et hooks SDK Frappe React
│   │   ├── pages/           # Pages principales (ou views/ si préférence)
│   │   │   ├── ColisView.jsx
│   │   │   └── ArticleManagement.jsx
│   │   ├── stores/          # Gestion d'état (Zustand, Redux...)
│   │   ├── utils/           # Utilitaires
│   │   │   ├── api.js
│   │   │   └── constants.js
│   │   └── router/          # Configuration des routes (React Router)
│   ├── public/
│   ├── vite.config.js       # Config proxy production
│   └── package.json
└── log/
    └── api/                 # APIs backend Frappe
```

## 7. Considérations Techniques

### 7.1 Configuration Production HTTPS

**Serveur de Production :**

* **URL** : <https://log.intrapro.net> (port 80 avec redirection HTTPS)

* **Mode Développement** : Activé pour debugging en production

* **Certificat SSL** : Configuré et valide

* **Proxy Vite** : Configuration sécurisée vers backend Frappe

**Configuration Vite pour Production :**

### 7.2 Sécurité

* **Authentification** : Tokens JWT via Frappe avec HTTPS

* **Validation** : Côté serveur pour tous changements statut

* **HTTPS Obligatoire** : Pour géolocalisation, caméra et sécurité

* **CSP** : Content Security Policy pour prévenir XSS

* **CORS** : Configuration correcte pour <https://log.intrapro.net>

* **SSL Pinning** : Validation certificat côté client

* **Tokens CSRF** : En production

* **Permissions** : Granulaires par rôle

### 7.3 Performance

* **Lazy Loading** : Chargement des composants à la demande

* **Code Splitting** : Division du bundle pour optimiser le chargement

* **Cache Local** : Pour données fréquentes

* **Optimisation Images** : Compression, formats modernes

* **HTTPS/2** : Optimisation des requêtes parallèles

## 8. APIs Backend Frappe

### 8.1 Endpoints Requis

**Gestion Colis :**

**Gestion Articles :**

**Upload Fichiers :**

### 8.2 Configuration Sécurité API

**Headers Requis :**

# Configuration CORS pour développement

if frappe.conf.developer\_mode:
website\_cors = {
"origins": \["http\://localhost:8080", "<https://log.intrapro.net>"],
"allow\_credentials": True
}
