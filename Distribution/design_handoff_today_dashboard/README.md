# Handoff : refonte du Tableau de bord « Aujourd’hui »

## Overview
Refonte de l’écran `/today` (TodayPage) de l’app Distribution : passer d’un empilement de cartes
(4 KPI + 3 grosses alertes rouges + 2 listes) à un écran qui raconte le flux d’exploitation
**préparer → planifier → charger → livrer**, avec une file de travail actionnable (Pipeline Kanban
ou tableau dense), une carte des livraisons, une tendance 14 jours et l’état des ressources.

## About the Design Files
Le fichier `Tableau de bord opérationnel.dc.html` de ce bundle est une **maquette HTML de référence** :
il montre l’intention visuelle et le comportement, ce n’est pas du code à copier tel quel.
Le travail consiste à **recréer cette maquette dans le codebase existant** (React 18 + TypeScript +
Vite + Tailwind + shadcn/ui & ReUI, react-router, SWR via `useActivityDashboard`), avec ses composants
et ses tokens actuels. Les fichiers `.tsx` de ce bundle sont des **implémentations proposées** écrites
dans ces conventions : ils sont à relire, brancher aux vraies données et adapter, pas à coller aveuglément.

## Fidelity
**Hi-fi.** Couleurs, typographie, espacements et interactions sont définitifs dans la maquette.
La maquette utilise des valeurs brutes (`#18181b`, `#e4e4e7`, …) parce qu’elle est hors du codebase ;
dans l’app, **utiliser les tokens existants** (`border-hairline`, `text-muted-foreground`, `brand-*`,
`StatusBadge`, `Card`, `Button`) — le rendu est équivalent.

## Fichiers du codebase concernés

| Fichier | Action |
| --- | --- |
| `src/features/today/TodayPage.tsx` | Remplacé — nouvelle composition, `ExceptionStrip` supprimé |
| `src/features/today/ActivityKpis.tsx` | Conservé, mais remplacé sur cet écran par `PipelineKpis` |
| `src/features/today/ActionQueue.tsx` | Conservé pour le rôle préparateur ; remplacé par `WorkQueue` pour planificateur/responsable |
| `src/features/today/AlertsSummary.tsx` | **Nouveau** — compteur « N anomalies » + détail dépliable |
| `src/features/today/PipelineKpis.tsx` | **Nouveau** — 4 étapes numérotées avec barre de progression |
| `src/features/today/WorkQueue.tsx` | **Nouveau** — file de travail Pipeline/Tableau + filtres + sélection multiple |
| `src/features/today/SidePanels.tsx` | **Nouveau** — Carte des livraisons, Tendance 14 j, Ressources |
| `src/components/ui/page-header.tsx` | Ajouter une prop optionnelle `badge?: ReactNode` (voir plus bas) |

## Écrans

### Tableau de bord « Aujourd’hui » (`/today`), rôles planificateur & responsable

Structure verticale, `flex flex-col gap-5`, largeur max existante du layout :

1. **PageHeader** — eyebrow `Opérationnel · <date longue>`, titre `Aujourd’hui`,
   description `N bons en attente · N anomalies · N tournée(s) en cours`.
   Actions inchangées (`Préparer` outline, `Planifier` primary avec `ArrowRight`).
   **Nouveau** : à droite du titre, un chip rouge cliquable `● N anomalies`
   (`bg-destructive/10 text-destructive border border-destructive/25 rounded-full h-[22px] px-2 text-xs font-semibold`)
   qui déplie/replie le détail des anomalies.
2. **AlertsSummary** — masqué par défaut. Déplié : grille `sm:grid-cols-3` de 3 cartes d’alerte
   compactes (titre + compteur + détail + lien d’action), ton `danger` ou `warning`.
   Variante alternative disponible dans la maquette : bandeau d’une ligne (`bandeau`).
3. **PipelineKpis** — `grid gap-3 sm:grid-cols-2 lg:grid-cols-4`. Chaque tuile :
   label mono uppercase `1 · À préparer` (`whitespace-nowrap`), badge d’exception à droite
   (`1 bloqué`, `4 en retard`), valeur `text-3xl font-semibold` + unité, barre de progression 4 px.
   Les étapes à zéro passent en `text-muted-foreground`. Clic → route existante (`/preparation`,
   `/planning`, `/stock`, `/deliveries?kpi=live`).
4. **Zone principale** — `grid xl:grid-cols-[minmax(0,1.95fr)_minmax(320px,1fr)] gap-5` :
   - **gauche : WorkQueue** (voir ci-dessous)
   - **droite : SidePanels** — Carte des livraisons, Tournées du jour (existant `LiveRoutesList`,
     enrichi des « regroupements suggérés »), Tendance 14 jours, Ressources véhicules.

### WorkQueue (le cœur de la refonte)

Une seule `Card` contenant :

- **En-tête** : titre `File de travail` + badge `N bons` + segmented control `Pipeline | Tableau`
  (`Tabs` existant ou `ButtonGroup`), état par défaut **Pipeline**.
- **Barre de filtres** : `Input` de recherche (référence / client / ville), chips toggle
  `● En retard` et `● Préparé` (actifs = `bg-foreground text-background`), compteur `n / N bons` à droite.
- **Barre d’actions groupées** (visible si sélection ≥ 1) : fond `bg-foreground text-background`,
  `N bon(s) sélectionné(s)` + `Créer une tournée` (bouton blanc) + `Affecter un véhicule` (outline) + `Effacer`.
- **Vue Pipeline** : 4 colonnes (`grid-cols-4`, séparateurs 1 px) — À préparer / À planifier / À charger /
  En tournée. En-tête de colonne mono uppercase `whitespace-nowrap` + compteur.
  Cartes : référence courte mono, pastille de statut, client, ligne meta `date · charge`
  (`flex-wrap` + `whitespace-nowrap` sur les deux valeurs — sinon la charge se casse caractère par
  caractère à 115 px de large). Colonne vide → encart pointillé avec message utile.
- **Vue Tableau** : grille dense 7 colonnes
  `34px minmax(0,1.25fr) minmax(0,1fr) 92px 108px 88px 34px` — case à cocher, Référence (+ sous-ligne
  d’état), Client · Ville, Livraison (rouge si en retard), Statut (`StatusBadge`), Lignes / kg (mono,
  aligné à droite), menu `⋯`. Ligne sélectionnée : fond `bg-muted/50`.
- **État vide** : `Empty` existant + bouton `Réinitialiser les filtres`.

### Panneaux latéraux

- **Carte des livraisons** — hauteur 210 px, fond quadrillé 28 px, pastilles rondes numérotées par ville
  (noir = à planifier, rouge = en retard), légende en bas à gauche, bouton `Ouvrir la carte` en haut à droite.
  Dans l’app : brancher une vraie carte (Leaflet / MapLibre) ; les pastilles = agrégat par ville sur
  `dispatch.notes`. Les libellés de pastille doivent être `whitespace-nowrap` et la pastille la plus à
  droite ancrée par `right`, sinon elle est coupée par l’`overflow-hidden` de la carte.
- **Tournées du jour** — reprend `LiveRoutesList`. Quand la liste est vide, ne pas afficher un simple
  « Aucune tournée active » : afficher le nombre de bons en attente + **regroupements suggérés par axe**
  (ville + poids + km) avec un bouton `Créer`, et un CTA `Planifier les N bons en retard` qui
  pré-sélectionne ces bons dans la WorkQueue (passe en vue Tableau).
- **Tendance 14 jours** — 14 barres `flex-1`, dernière barre en `bg-foreground`, les autres en `bg-border`,
  jour à zéro en `bg-muted`. En-tête : `Bons expédiés · 14 jours`, moyenne, delta en badge vert.
- **Ressources** — liste de véhicules : pastille tonnage mono, immatriculation, chauffeur + charge,
  `StatusBadge` Disponible / Indispo.

## Interactions & Behavior

| Élément | Comportement |
| --- | --- |
| Chip « N anomalies » | Toggle du détail des anomalies (état local, pas de navigation) |
| Tuile KPI | `navigate(target)` vers la file correspondante |
| Segmented Pipeline/Tableau | État local, pas de refetch ; défaut Pipeline |
| Recherche | Filtrage client-side sur référence, client, ville (insensible à la casse) |
| Chips En retard / Préparé | Filtres cumulatifs, client-side |
| Clic sur une ligne / carte | Toggle de sélection (pas de navigation) ; le `⋯` ouvre les actions |
| « Planifier les N bons en retard » | Sélectionne les bons `stage=plan && late`, bascule en vue Tableau |
| Barre groupée | `Créer une tournée` → POST tournée avec les bons sélectionnés, puis `/planning/routes/:name` |
| Filtres sans résultat | État vide + `Réinitialiser les filtres` |

Aucune animation au-delà des transitions `hover` existantes (`hover:border-brand-300 hover:bg-brand-50/40`).

## State Management

État local `WorkQueue` (pas de store global nécessaire) :

```ts
view: "kanban" | "table"        // défaut "kanban"
query: string                   // défaut ""
late: boolean; ready: boolean   // filtres, défaut false
selection: Record<string, true> // clés = deliveryNote / référence
```

État local `TodayPage` : `alertsOpen: boolean` (défaut `false`).

Données : `useActivityDashboard(today)` inchangé.
La WorkQueue dérive ses lignes de `dispatch.notes` (bons), `preparation.pickLists` (préparation),
`fulfillment.toLoadRoutes` (quai) et `fleet.liveRoutes` (en tournée) — aucun nouvel endpoint requis
sauf pour la tendance 14 jours (`shipped` par jour) et le poids/nb de lignes par bon, à ajouter côté API
si non disponibles (dégrader proprement : masquer la colonne plutôt qu’afficher `0`).

## Design Tokens

La maquette est hors codebase ; correspondance à utiliser dans l’app :

| Maquette | Codebase |
| --- | --- |
| `#09090b` texte / `#18181b` primaire | `text-foreground` / `bg-foreground`, `Button` default |
| `#71717a` / `#a1a1aa` | `text-muted-foreground` |
| `#e4e4e7` bordures | `border-hairline` |
| `#fafafa` fond page / `#f4f4f5` | `bg-background` / `bg-muted` |
| `#dc2626`, `#b91c1c`, `#fef2f2` | `StatusBadge tone="danger"`, `text-destructive` |
| `#d97706`, `#a16207`, `#fffbeb` | `StatusBadge tone="warning"` |
| `#16a34a`, `#15803d`, `#f0fdf4` | `StatusBadge tone="success"` |
| Rayon 12 px cartes / 8-9 px contrôles | `rounded-xl` / `rounded-lg` |
| Geist + Geist Mono | police existante + classe `num` pour les chiffres |

Échelle typographique de la maquette : 26 px titre, 30 px valeur KPI, 14 px titres de carte,
13 px corps, 12–12,5 px meta, 10–11 px labels mono uppercase (`letter-spacing: .06em`).
Espacements : 12 px entre tuiles, 16–18 px entre blocs, 20 px padding page.

## Deux pièges de mise en page (vérifiés sur la maquette)
1. Ligne meta des cartes Kanban : sans `whitespace-nowrap` + `flex-wrap`, « 6 l · 420 kg » se casse
   caractère par caractère dès que la colonne descend sous ~120 px.
2. Labels mono des tuiles KPI et des colonnes Kanban : sans `whitespace-nowrap`, « 2 · À PLANIFIER »
   passe sur deux lignes et désaligne les tuiles voisines.

## Assets
Aucun asset externe. Icônes : `lucide-react` déjà utilisé (`Package`, `Truck`, `Warehouse`,
`AlertCircle`, `AlertTriangle`, `ArrowRight`, `MapPin`, `Search`). Aucune image.

## Files du bundle
- `Tableau de bord opérationnel.dc.html` — maquette de référence (ouvrir dans un navigateur)
- `TodayPage.tsx` — composition proposée de la page
- `AlertsSummary.tsx`, `PipelineKpis.tsx`, `WorkQueue.tsx`, `SidePanels.tsx` — composants proposés
