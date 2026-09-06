# Handoff : refonte de la page Préparation

## Overview
Refonte de `/preparation` (onglets **Commandes**, **Listes**, **Retours**) dans le même langage
visuel que la refonte du tableau de bord « Aujourd’hui » : pleine largeur, tuiles d’étape,
compteur d’anomalies compact, tableau dense réellement actionnable (sélection + actions groupées),
et états vides utiles.

## About the Design Files
`Préparation.dc.html` est une **maquette HTML de référence** : elle montre l’intention visuelle et le
comportement, ce n’est pas du code à livrer. Le travail consiste à **recréer cette maquette dans le
codebase existant** (React + TS + Tailwind + shadcn/ui & ReUI, TanStack Table via
`PreparationSubTableGrid`, `StatusBadge`, `Toolbar`, `FilterSelect`, SWR).
Les `.tsx` de ce bundle sont des **implémentations proposées** écrites dans vos conventions,
à relire et brancher — pas à coller aveuglément.

## Fidelity
**Hi-fi.** La maquette utilise des valeurs brutes (`#18181b`, `#e4e4e7`…) parce qu’elle vit hors du
codebase ; dans l’app, utiliser les tokens existants (`border-hairline`, `text-muted-foreground`,
`brand-*`, `StatusBadge`, `Card`) — le rendu est équivalent. Voir la table de correspondance
du handoff dashboard (`design_handoff_today_dashboard/README.md`), identique ici.

## Fichiers du codebase concernés

| Fichier | Action |
| --- | --- |
| `src/features/preparation/PreparationPage.tsx` | En-tête (compteur d’anomalies), largeur, tuiles d’étape, barre de filtres réduite, sélection + actions groupées |
| `src/features/preparation/PickListQueue.tsx` | Colonne « État » → icône, padding de « Modifié », 3 tuiles d’en-tête |
| `src/features/preparation/ReturnControlPanel.tsx` | État vide utile + 3 indicateurs 30 jours |
| `src/features/preparation/ListStateIcon.tsx` | **Nouveau** — icône d’état de liste (✓ / ◐ / ○) réutilisée par les deux onglets |
| `src/features/preparation/PreparationStageKpis.tsx` | **Nouveau** — 4 tuiles d’étape cliquables (filtrantes) |
| `src/features/preparation/preparationOrderColumns.tsx` | **Nouveau** — colonnes du tableau Commandes (13 → 7) |
| `src/features/preparation/ReturnsEmptyState.tsx` | **Nouveau** — état vide + indicateurs de l’onglet Retours |

## Ce qui change, et pourquoi

1. **Pleine largeur.** L’écran actuel laisse ~600 px de vide à gauche et comprime un tableau de
   13 colonnes en scroll horizontal (le `100 %` de la colonne Prélevé est tronqué en `100 9`).
   Le conteneur doit occuper la largeur du layout, comme `/today`.
2. **La sélection existe enfin.** Le sous-titre promet « Sélectionnez les commandes à prélever » mais
   aucune case à cocher n’était présente. Ajout d’une colonne de sélection + case « tout sélectionner »
   + barre d’actions noire : **Créer la liste de prélèvement** / Imprimer / Effacer.
   Le compteur de la barre affiche le **reste à prélever réel** (somme des `remain` des lignes),
   pas `total - picked` — une commande peut être 12/12 et toujours « À compléter ».
3. **13 colonnes → 7.** Commande + Client fusionnés (2 lignes), Lieu + Wilaya fusionnés,
   colonne « Statut » commande supprimée (redondante avec l’état de liste),
   Prélevé = une barre + `12 / 12 · 100 %` dans une seule cellule.
4. **Colonne « État liste » en icône** : ✓ vert (soumise), ◐ orange (partielle), ○ gris (brouillon),
   centrée, avec `title` explicite. Le ⚠ orange de `custom_order_changed` reste à côté de l’icône.
5. **6 dropdowns → 3 chips + « Plus de filtres »** : Échéance dépassée, À compléter, Non prélevées.
   Les 6 `FilterSelect` (Échéance, Stock, Liste, Wilaya, Commune, Client, Période) passent dans un
   popover replié — ils restent disponibles mais ne mangent plus une ligne entière.
6. **4 tuiles d’étape** À prélever → En cours → À compléter → Prêtes à livrer : elles **appliquent le
   filtre** correspondant au clic (ou pré-sélectionnent, pour « À compléter »).
7. **Compteur rouge « N anomalies »** à côté du titre, dépliable — même composant que sur `/today`.
8. **Onglet Retours** : à 0, ne pas afficher un tableau vide. État vide qui explique que le retour
   vient de la déclaration mobile du livreur, plus 3 indicateurs sur 30 jours.

## Écrans

### Onglet Commandes
Ordre vertical : PageHeader (+ chip anomalies) → onglets → 4 tuiles d’étape → Card contenant
barre de filtres, barre d’actions groupées (si sélection), tableau, pied de pagination.

Tableau, colonnes et largeurs :
`36px` sélection · `24px` chevron · `minmax(0,1.5fr)` Commande·Client · `minmax(0,1fr)` Lieu ·
`96px` Échéance · `150px` Prélèvement · `112px` État liste (centré) · `34px` actions.

- Échéance en `text-destructive` si `< today`.
- Ligne sélectionnée : `bg-muted/50`.
- Chevron : déplie la sous-grille d’articles (Article, Code, Restant, Dispo., Entrepôt, État) —
  conserver `OrderItemsSubGrid`, mais dans un encart indenté (`pl-[72px]`) et non pleine largeur.
- L’en-tête « État liste » doit être `text-align: center` pour rester aligné sur ses icônes.

### Onglet Listes
3 tuiles (Brouillons, Soumises, Articles restants + badge « N modifiée ») puis le tableau existant
de `PickListQueue`, colonnes : Liste·Entrepôt, Client, **État (icône centrée)**, Wilaya, Commandes,
Prélevé (barre + `12 / 12`), Modifié.
⚠ **Piège mesuré** : « Prélevé » aligné à droite et « Modifié » collé à gauche se lisent comme une
seule chaîne (`12 / 12 05/09/2026 14:02`). Donner `padding-left: 14px` à l’en-tête ET à la cellule
« Modifié ».

### Onglet Retours
`ReturnControlPanel` conservé pour le cas non vide. Cas vide (le cas courant) : titre
« Aucun retour en attente », explication (« Un retour apparaît dès qu’un livreur le déclare depuis son
mobile »), deux boutons (Voir les tournées du jour, Historique des retours), puis 3 indicateurs
30 jours : retours déclarés, écarts de comptage, délai moyen de contrôle.

## Interactions & Behavior

| Élément | Comportement |
| --- | --- |
| Chip « N anomalies » | Toggle du détail (2 cartes : Stock manquant, Échéances dépassées) |
| Carte « Stock manquant » | Sélectionne les commandes concernées + active le filtre « À compléter » |
| Tuile d’étape | Applique le filtre correspondant (état local, pas de refetch) |
| Case d’en-tête | Sélectionne / désélectionne **les lignes filtrées** uniquement |
| Clic sur une ligne | Toggle la sélection ; le chevron déplie les articles ; le `⋯` ouvre les actions |
| Créer la liste | `CreatePickListDialog` existant, alimenté par les ids sélectionnés |
| Filtres sans résultat | État vide + « Réinitialiser les filtres » |
| Onglets | `?tab=commandes|listes|retours` — comportement actuel conservé (searchParams) |

## State Management

```ts
// onglet Commandes
query: string
overdue: boolean; shortage: boolean; notPicked: boolean   // les 3 chips
selection: Record<string, true>                            // clé = SO name
expanded: Set<string>                                      // lignes dépliées
alertsOpen: boolean                                        // défaut false
```
Les filtres avancés (wilaya, commune, client, période, liste) gardent l’état actuel de
`PreparationPage`, simplement déplacés dans le popover « Plus de filtres ».
Aucun nouvel endpoint : tout est dérivé de `orders`, `pickLists`, `useRecentPickLists`,
`useReturnRoutes`. Les 3 indicateurs 30 jours de l’onglet Retours et les agrégats des tuiles Listes
sont les seuls chiffres à confirmer côté API — s’ils n’existent pas, masquer la tuile plutôt
qu’afficher `0`.

## Assets
Aucun. Icônes `lucide-react` (`Check`, `CircleDashed`, `PieChart`, `AlertTriangle`, `Search`,
`ClipboardList`, `RotateCcw`). Les ronds ✓ / ◐ / ○ de la maquette sont des glyphes, remplaçables par
`Check` / `CirclePercent` / `Circle` de lucide (voir `ListStateIcon.tsx`).

## Files du bundle
- `Préparation.dc.html` — maquette de référence (ouvrir dans un navigateur)
- `ListStateIcon.tsx`, `PreparationStageKpis.tsx`, `preparationOrderColumns.tsx`,
  `PickListsStateCell.tsx`, `ReturnsEmptyState.tsx` — composants proposés
