# Handoff : refonte de la page Planification

## Overview
Refonte de `/planning` (onglets **BL** / **Tournées**, vues **Kanban** et **Tableau**) dans le même
langage visuel que les refontes `/today` et `/preparation` : pleine largeur, tuiles de pipeline,
compteur d’anomalies compact, colonnes Kanban qui se dimensionnent à leur contenu, cartes BL épurées,
et une vue Tableau réellement conçue.

## About the Design Files
`Planification.dc.html` est une **maquette HTML de référence** : elle montre l’intention visuelle et
le comportement, ce n’est pas du code à livrer. Le travail consiste à **recréer cette maquette dans le
codebase existant** (React + TS + Tailwind + shadcn/ui & ReUI, `@dnd-kit` via `components/reui/kanban`,
`StatusBadge`, `Toolbar`, `FilterSelect`, SWR). Les `.tsx` de ce bundle sont des **implémentations
proposées** écrites dans vos conventions, à relire et brancher — pas à coller aveuglément.
La logique métier existante (`handleKanbanMove`, `handleBulkSubmit`, `AssignmentEditor`,
`BulkAssignmentDialog`, révisions optimistes) **ne change pas**.

## Fidelity
**Hi-fi.** La maquette utilise des valeurs brutes (`#18181b`, `#e4e4e7`…) parce qu’elle vit hors du
codebase ; dans l’app, utiliser les tokens existants (`border`, `text-muted-foreground`, `brand-*`,
`bg-muted/30`, `StatusBadge`, `Card`). Correspondance identique à celle du handoff dashboard
(`design_handoff_today_dashboard/README.md`).

## Fichiers du codebase concernés

| Fichier | Action |
| --- | --- |
| `src/features/planning/PlanningPage.tsx` | Largeur pleine, chip anomalies dans le `PageHeader`, insertion des 4 tuiles au-dessus des onglets, libellé d’onglet « BL à planifier » |
| `src/features/planning/PlanningKanban.tsx` | Toolbar compactée (stepper de date), colonnes non étirées, en-tête livreur avec barre de charge, dropzone « Nouvelle tournée » réduite à une ligne, backlog groupable |
| `src/features/planning/DeliveryNotesBoard.tsx` | Vue Tableau : colonnes et cellules de `planningTableColumns.tsx`, sélection partagée avec le Kanban |
| `src/features/planning/RoutesBoard.tsx` | Colonnes alignées sur la maquette (Tournée, Livreur, Véhicule, Créneau, BL, Art., État) |
| `src/features/planning/PlanningStageKpis.tsx` | **Nouveau** — 4 tuiles cliquables (À planifier / Brouillons / Publiées / Charge du jour) |
| `src/features/planning/PlanningAlertsSummary.tsx` | **Nouveau** — chip « N anomalies » + 2 cartes dépliables (retards, GPS manquant) |
| `src/features/planning/BLCard.tsx` | **Remplace** le `BLCard` interne de `PlanningKanban.tsx` |
| `src/features/planning/DriverColumnHeader.tsx` | **Nouveau** — en-tête de colonne livreur + barre de charge sur capacité |
| `src/features/planning/BacklogColumn.tsx` | **Nouveau** — colonne « À planifier » : groupage, tout sélectionner, état vide |
| `src/features/planning/planningTableColumns.tsx` | **Nouveau** — colonnes de la vue Tableau |
| `src/features/planning/kanbanHelpers.ts` | Ajouter `driverLoad()` / `CAPACITY_ARTICLES` (voir `DriverColumnHeader.tsx`) |

## Ce qui change, et pourquoi

1. **Pleine largeur.** L’écran actuel est centré sur ~1 300 px avec ~570 px de vide à gauche alors que
   le Kanban est en `overflow-x: auto` : on scrolle horizontalement dans un écran à moitié vide.
2. **Les colonnes ne s’étirent plus.** Aujourd’hui les 3 colonnes livreur font ~900 px de haut pour
   ne contenir qu’un placeholder : `KanbanBoard` a `min-h-[28rem]` et les colonnes s’alignent sur la
   plus haute (le backlog). Chaque colonne doit se dimensionner à son contenu (`items-start` sur le
   board, pas de `min-h` sur les colonnes) et la dropzone « Nouvelle tournée » descendre de ~100 px
   à **38 px** (une ligne `+ Nouvelle tournée`, le sous-titre « Séparé des tournées existantes »
   n’apparaît qu’au survol / pendant un drag).
3. **4 tuiles de pipeline** : À planifier (BL + articles, badge « N en retard ») → Brouillons →
   Publiées → Charge du jour (`articles affectés / capacité`). Elles filtrent au clic, comme sur
   `/preparation`, et donnent la réponse à « est-ce que ma journée tient ? » sans lire les cartes.
4. **Chip rouge « N anomalies »** à côté du titre, dépliable : BL en retard non planifiés, GPS client
   manquant. La carte « en retard » sélectionne les BL concernés ; la carte GPS active le filtre.
   Même composant que `/today` et `/preparation`.
5. **Cartes BL épurées.** Le statut « En retard » était répété sur 4 cartes sur 5 : il devient un
   **liseré gauche rouge + date rouge**. La carte garde BL, client, commune·wilaya, date souhaitée,
   articles ; l’alerte GPS reste sur une ligne ambre. Une carte de tournée affiche en plus son rang
   (`#1`, `#2`) et l’action contextuelle (Retirer / Reprogrammer si publiée).
6. **En-tête livreur informatif** : nom, véhicule, `N BL · N art.`, et une **barre de charge** sur
   `CAPACITY_ARTICLES` (40 art. par défaut, à confirmer) qui passe en rouge ≥ 90 %.
   Un en-tête « 0 BL · 0 art. » sans référence ne dit rien sur la faisabilité.
7. **Barre de date compactée** : `‹ 05/09/2026 (aujourd’hui) ›` + `Aujourd’hui`. Les deux champs
   `Date BL` / `Date livraison` côte à côte étaient la principale source de confusion ; le filtre
   « Date BL » passe dans « Plus de filtres » (ou reste un chip quand il est actif).
8. **Backlog groupable** (Aucun / Date / Wilaya) + `Tout sélectionner` en lien texte dans l’en-tête,
   plus un bouton pleine largeur. Grouper par wilaya est le geste réel du planificateur.
9. **Vue Tableau conçue.** Le toggle Kanban/Tableau existait sans design dédié : colonnes fusionnées,
   sélection partagée avec le Kanban, tournée + livreur·créneau visibles, état vide utile.

## Écrans

### Onglet BL — Kanban
Ordre vertical : `PageHeader` (+ chip anomalies) → cartes d’anomalies (si dépliées) → onglets +
toggle de vue → 4 tuiles → toolbar → barre d’actions groupées (si sélection) → board.

Board : `flex items-start gap-3 overflow-x-auto`, colonnes `flex-[0_0_268px]`.
Colonne 1 = backlog (en-tête `bg-muted/40` : titre, compteur inversé, `Tout sélectionner`, chips de
groupage). Colonnes suivantes = un livreur, contenant ses tournées du jour (carte `bg-muted/20`
avec nom, `StatusBadge` de lifecycle, créneau, charge) puis la dropzone.

### Onglet BL — Tableau
`36px` sélection · `minmax(0,1.4fr)` BL·Client · `minmax(0,1fr)` Lieu · `minmax(0,1fr)` Livraison
souhaitée · `104px` Statut · `74px` Art. (droite) · `130px` Tournée · `minmax(0,1fr)` Livreur·Créneau
· `34px` actions.
⚠ **Piège mesuré** : ne pas ajouter de mention « dépassée » à côté de la date — à ~900 px de large la
piste `minmax(0,1fr)` tombe à 106 px et le texte passe sous le chip opaque de la colonne suivante.
La date rouge + la colonne Statut suffisent.

### Onglet Tournées
Tableau : Tournée, Livreur, Véhicule, Créneau, BL (droite), Art. (droite), État (`StatusBadge`), `⋯`.
Sous-titre rappelant qu’une tournée publiée exige un motif de reprogrammation.

## Interactions & Behavior

| Élément | Comportement |
| --- | --- |
| Chip « N anomalies » | Toggle des 2 cartes de détail |
| Carte « BL en retard » | Sélectionne ces BL + active le chip « En retard » |
| Carte « GPS manquant » | Active le filtre `alert` |
| Tuile 1 / 2 / 3 | Réinitialise les filtres / va à l’onglet Tournées (brouillons) / (publiées) |
| Stepper de date | `?date=YYYY-MM-DD` — `updateParams({ date })` existant |
| Chips En retard / GPS manquant | Filtres locaux, cumulables avec Statut et Wilaya |
| Chips de groupage | État local du backlog uniquement, aucun refetch |
| Tout sélectionner | Porte sur les **BL filtrés** du backlog, pas sur tout le backlog |
| Drag d’un BL sélectionné | Déplace toute la sélection — `notesToMoveOnDrag` inchangé |
| Barre d’actions | Affecter à une tournée (`onBulkAssign`) / Créer une tournée (`mode: "new"`) / Effacer |
| Carte d’une tournée publiée | Non draggable, action « Reprogrammer » → `AssignmentEditor` |
| Filtres sans résultat | État vide + « Réinitialiser les filtres » |

## State Management

```ts
// PlanningKanban (local)
search: string
lateOnly: boolean; gpsOnly: boolean          // nouveaux chips
wilayaFilter: string                          // existant
group: "aucun" | "date" | "wilaya"           // nouveau, backlog seulement
selected: Set<string>                         // existant — à remonter dans PlanningPage
alertsOpen: boolean                           // défaut false
```
`selected` doit **remonter dans `PlanningPage`** pour être partagé entre Kanban et Tableau
(aujourd’hui il vit dans `PlanningKanban`, la sélection se perd au changement de vue).
`tab`, `view`, `date`, `blDate`, `status` restent dans les `searchParams`.

Aucun nouvel endpoint : tout est dérivé de `usePlanningBoard` (`assignments`, `routes`, `drivers`,
`vehicles`). Deux valeurs à confirmer côté API :
- **capacité véhicule** (`CAPACITY_ARTICLES`) — pas exposée aujourd’hui ; si elle n’existe pas,
  afficher `N art.` sans barre plutôt qu’une capacité inventée ;
- `assignment.planningAlert` / `requiresCustomerGeolocation` — déjà présents, utilisés tels quels
  pour la carte « Données client incomplètes ».

## Assets
Aucun. Icônes `lucide-react` : `Package`, `Truck`, `Plus`, `MapPin`, `Calendar`, `AlertTriangle`,
`ChevronLeft`, `ChevronRight`, `Search`, `Square`, `SquareCheck`, `Columns3`, `Table2`.

## Files du bundle
- `Planification.dc.html` — maquette de référence (ouvrir dans un navigateur)
- `PlanningStageKpis.tsx`, `PlanningAlertsSummary.tsx`, `BacklogColumn.tsx`,
  `DriverColumnHeader.tsx`, `BLCard.tsx`, `planningTableColumns.tsx` — composants proposés
