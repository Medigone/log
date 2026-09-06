# Handoff : refonte de la page Livraisons

## Overview
Refonte de `/deliveries` (suivi temps réel des tournées du jour) dans le même langage visuel que
`/today`, `/preparation` et `/planning` : pleine largeur, tuiles qui portent une information de
progression, chip d’incidents dépliable, tableau de tournées avec **avancement et dernier événement**,
et arrêts dépliables sous la ligne au lieu d’une carte séparée en bas de page.

## About the Design Files
`Livraisons.dc.html` est une **maquette HTML de référence** : elle montre l’intention visuelle et le
comportement, ce n’est pas du code à livrer. Le travail consiste à **recréer cette maquette dans le
codebase existant** (React + TS + Tailwind + shadcn/ui & ReUI, `DataTable`, `KpiTile`, `StatusBadge`,
`Toolbar`, `FilterSelect`, `FleetMap`, SWR + polling `live`). Les `.tsx` de ce bundle sont des
**implémentations proposées**, à relire et brancher.

⚠ La maquette est volontairement montrée **avec une journée peuplée** (3 tournées, 12 arrêts, 1 échec,
1 départ non confirmé) : l’écran actuel ne se voit qu’à zéro, ce qui masque tous les problèmes de
densité. Le tweak `dayState: "vide"` de la maquette affiche l’état vide redessiné.

## Fidelity
**Hi-fi.** Valeurs brutes dans la maquette (`#18181b`, `#e4e4e7`…) → tokens existants dans l’app
(`text-muted-foreground`, `border`, `bg-muted`, `StatusBadge`, `Card`). Les couleurs de tournée de la
carte viennent de `fleetColor(index)` — ne pas les redéfinir.

## Fichiers du codebase concernés

| Fichier | Action |
| --- | --- |
| `src/features/deliveries/DeliveriesPage.tsx` | Largeur pleine, stepper de date, chips de cycle de vie, chip d’incidents, ordre des sections, arrêts dépliés dans la ligne |
| `src/features/deliveries/DeliveriesKpis.tsx` | **Nouveau** — 4 tuiles (répartition cycle de vie, terrain, arrêts livrés, échecs) |
| `src/features/deliveries/DeliveriesAlertsSummary.tsx` | **Nouveau** — chip « N à traiter » + 2 cartes (échecs, départs non confirmés) |
| `src/features/deliveries/routeProgressColumns.tsx` | **Nouveau** — colonnes du tableau Tournées (avancement + dernier événement) |
| `src/features/deliveries/SelectedRouteRail.tsx` | **Nouveau** — panneau « Tournée sélectionnée » (progression, événements, actions) |
| `src/features/deliveries/StopsSubTable.tsx` | **Nouveau** — arrêts de la tournée dépliée + encart d’échec |
| `src/features/today/fleetProgress.ts` | Ajouter `routeStopCounts()` et `lateDeparture()` (voir `DeliveriesKpis.tsx`) |

## Ce qui change, et pourquoi

1. **Pleine largeur.** L’écran est centré sur ~1 300 px avec ~550 px de vide à gauche, alors que le
   tableau des tournées doit accueillir une barre d’avancement et une colonne d’événements.
2. **Les 4 tuiles disent quelque chose.** Aujourd’hui : quatre `0` avec une icône et deux tons de vert.
   Refonte : Tournées du jour (+ répartition par cycle de vie en barre segmentée, `1 en cours ·
   1 non partie`), Sur le terrain (véhicules + arrêts restants), Arrêts livrés (`7` sur `12`, barre à
   58 %), Échecs (rouge, `à traiter` / `RAS`). Chaque tuile filtre au clic — comportement `applyKpi`
   existant conservé.
3. **Chip rouge « N à traiter »** à côté du titre (échecs + départs non confirmés), dépliable en
   2 cartes. Un départ prévu à 07:30 non confirmé à 10:50 n’apparaît **nulle part** aujourd’hui : c’est
   pourtant l’information la plus urgente de la page.
4. **Colonne « Dernier événement » + ancienneté** dans le tableau des tournées. Sans elle, une page
   « live » ne dit pas si une tournée avance ou si elle est figée depuis deux heures.
5. **Colonne « Avancement »** : barre noire (livrés) + segment rouge (échecs) + `3 / 5`. Les colonnes
   `Arrêts` et `%` fusionnent — `%` seul, aligné à droite et masqué en `md`, n’apportait rien.
6. **Colonne « Départ »**, rouge quand l’heure prévue est dépassée sans confirmation.
7. **Arrêts dépliés sous la ligne** (chevron / clic), au lieu d’une `Card` « Arrêts · TR-… » à la fin
   de la page : le lien entre la ligne cliquée et la carte du bas était invisible sans scroll.
   Statuts en icônes ✓ vert / ✕ rouge / ○ gris + encart rouge « Replanifier le BL » quand il y a échec.
8. **Panneau « Tournée sélectionnée » réellement rempli** : progression livrés/échecs en une barre,
   reste, fin estimée, 3 derniers événements, puis actions. **Quand rien n’est sélectionné, il ne
   reste que le message d’invite** — pas de boutons noirs sans cible (comportement de la page actuelle
   à conserver).
9. **Chips de cycle de vie** (Publiée / En cours / Retour dépôt / Terminée, avec compteur) à la place
   du `FilterSelect`, plus un stepper `‹ 05/09/2026 ›` + `Aujourd’hui`.
10. **Badge « Live · 10 s » et pastille « Positions mises à jour » uniquement pour le jour courant** —
    à garder aligné sur `const live = Boolean(date) && date === today`.

## Écrans
Ordre vertical : `PageHeader` (eyebrow, titre, badge Live, chip incidents, actions) → cartes
d’incidents (si dépliées) → toolbar (stepper, recherche, chips, livreur, `Réinitialiser`) →
4 tuiles → grille `minmax(0,1.7fr) minmax(272px,336px)` (carte + panneau) → tableau Tournées.

Tableau Tournées : `22px` puce couleur · `minmax(0,1.5fr)` Tournée·Livreur · `112px` État ·
`78px` Départ · `168px` Avancement · `minmax(0,1fr)` Dernier événement · `34px` actions.
Sous-tableau Arrêts : `44px` N° · `minmax(0,1.3fr)` Client·BL · `minmax(0,1fr)` Lieu · `118px` Statut ·
`96px` Heure · `76px` Carte.

## Interactions & Behavior

| Élément | Comportement |
| --- | --- |
| Tuiles | `applyKpi("all" / "live" / "delivered" / "failed")` — état local existant |
| Chip « N à traiter » | Toggle des 2 cartes |
| Carte « Arrêts en échec » | `applyKpi("failed")` + sélectionne et déplie la tournée concernée |
| Carte « Départ en retard » | Filtre les tournées non parties + déplie la première |
| Chips cycle de vie | Multi-sélection cumulable avec livreur et recherche ; réinitialise `kpi` |
| Clic sur une ligne | Sélectionne la tournée **et** déplie ses arrêts (re-clic = replie) |
| Légende de la carte | Clic sur une couleur = sélectionne la tournée |
| Stepper de date | `setDate` existant ; hors jour courant, pas de polling ni de badge Live |
| `Réinitialiser` | `clearFilters()` existant (remet `date` au jour courant, pas à vide) |

## State Management

```ts
date: string                 // existant, défaut = today
lifecycle: Set<RouteLifecycle>   // ← était RouteLifecycle | "" (chips multi)
driver: string; search: string   // existants
kpi: KpiFocus                    // existant + "late"
selected: string                 // existant (?route=)
expanded: string                 // nouveau — tournée dépliée, souvent = selected
alertsOpen: boolean              // défaut false
```

Données manquantes côté API, à confirmer avant de brancher :
- **dernier événement par tournée** (libellé + horodatage) : aucun champ aujourd’hui ; à défaut,
  dériver de l’arrêt le plus récemment mis à jour et masquer la colonne si l’info est absente ;
- **heure de départ réelle / confirmation de départ** : nécessaire pour « Départ non confirmé »
  et le retard affiché ;
- **fin estimée (ETA)** du panneau de droite : sinon masquer la ligne plutôt qu’estimer.
Le reste est dérivé de `usePlanningBoard` + `stopProgress` + `getStopVisualStyle` + `isLiveRoute`.

## Assets
Aucun. `FleetMap` inchangé (la maquette n’en montre qu’un cadre neutre : ne pas dessiner de fausse
carte). Icônes `lucide-react` : `Route`, `Truck`, `CheckCircle2`, `AlertCircle`, `MapPin`, `Search`,
`RotateCcw`, `ChevronLeft`, `ChevronRight`, `ChevronDown`.

## Files du bundle
- `Livraisons.dc.html` — maquette de référence (ouvrir dans un navigateur)
- `DeliveriesKpis.tsx`, `DeliveriesAlertsSummary.tsx`, `routeProgressColumns.tsx`,
  `SelectedRouteRail.tsx`, `StopsSubTable.tsx` — composants proposés
