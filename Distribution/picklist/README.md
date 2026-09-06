# Handoff : refonte de l’écran Prélèvement (scan)

## Overview
Refonte de l’étape 2 « Prélèvement » de `/preparation?pick_lists=STO-PICK-…` : le champ de scan devient
l’élément principal de l’écran, chaque scan renvoie un retour immédiat (article, compteur, reste), les
lignes deviennent lisibles et actionnables, et un journal des scans permet d’annuler une lecture avant
le contrôle final. La vue mobile (caméra) est montrée à côté parce que **la caméra n’existe que là** :
sur poste fixe, c’est la douchette qui écrit dans le champ.

## About the Design Files
`Prélèvement (scan).dc.html` est une **maquette HTML de référence** interactive : les code-barres de
test (`6112345000011`, `6112345000028`, `6112345000035`) fonctionnent réellement — saisie + Entrée,
incrémentation, code inconnu en rouge, annulation depuis le journal. Ce n’est pas du code à livrer :
le travail consiste à **recréer cette maquette dans le codebase existant** (React + TS + Tailwind +
shadcn/ui, `Input`, `StatusBadge`, `BarcodeScannerDialog`, SWR). Les `.tsx` / `.ts` du bundle sont des
**implémentations proposées**.

Le tweak `showMobile: false` de la maquette masque la colonne mobile pour juger le poste fixe seul.

## Fidelity
**Hi-fi.** Valeurs brutes dans la maquette (`#18181b`, `#e4e4e7`…) → tokens existants
(`text-muted-foreground`, `border`, `bg-muted`, `StatusBadge`, `rounded-touch` côté mobile).

## Fichiers du codebase concernés

| Fichier | Action |
| --- | --- |
| `src/features/preparation/PreparationPage.tsx` | Étape 2 : largeur pleine, stepper d’étapes compact, en-tête (retour, réf., statut, actions), remplacement des 4 tuiles par la barre de progression |
| `src/features/preparation/ScanConsole.tsx` | **Nouveau** — carte de scan (champ + dernier scan + total) pour poste fixe |
| `src/features/preparation/pickLineRows.tsx` | **Nouveau** — lignes à prélever (stepper, avancement, filtre « Restants ») |
| `src/features/preparation/ScanJournal.tsx` | **Nouveau** — journal des scans + annulation |
| `src/features/preparation/usePickScan.ts` | **Nouveau** — état de scan (résolution du code, incrément, journal, undo) |
| `src/features/preparation/PickFloorView.tsx` | Vue mobile conservée ; aligner le compteur et la liste sur la maquette, garder `BarcodeScannerDialog` |
| `src/components/BarcodeScannerDialog.tsx` | Inchangé — reste le seul chemin caméra (mobile) |

## Ce qui change, et pourquoi

1. **Le champ de scan devient le héros.** Il était un bloc gris coincé entre les filtres et le tableau,
   avec une icône appareil-photo décorative sur desktop. Refonte : carte en haut, champ 52 px en
   monospace, `+1 / scan`, focus conservé entre deux lectures, bordure rouge + message si code inconnu.
2. **Retour immédiat du dernier scan** (article, `1 / 1`, reste, barre) à droite du champ — sinon le
   magasinier doit chercher la ligne concernée dans le tableau après chaque bip.
3. **4 tuiles → 1 barre de progression.** `Demandé 3 / Prélevé 0 / Restant 3 / Écarts 3` disait quatre
   fois la même chose (et « Écarts » comptait en réalité les lignes non commencées). Une seule ligne
   `0 / 3 unités prélevées` + un signalement **seulement s’il y a une ligne réellement partielle**.
4. **`Demandé 1 N°` corrigé** : l’unité (`N°`) se lisait comme une colonne. L’unité est explicite et
   la quantité fusionne avec le stepper : `0 / 1`.
5. **Lignes actionnables** : stepper − / + (44 px de zone tactile), lien « Tout » / « Remettre à 0 »,
   avancement en fine barre sous le nom, icône d’état ✓ / ◐ / ○ (même vocabulaire que `/preparation`),
   lignes complètes grisées et repoussées en bas. Les 3 chips « Restant » identiques disparaissent.
6. **Journal des scans** avec annulation ligne par ligne — un scan de trop était irréversible sans
   repasser par la saisie manuelle.
7. **« Contrôle final » désactivé** tant qu’il reste des unités, avec la raison en `title`.
8. **Poste fixe vs mobile explicité** : la carte de scan (douchette) est desktop ; le bouton caméra et
   `BarcodeScannerDialog` restent réservés au mobile, avec une note visible dans la maquette.

## Écrans

Ordre vertical (poste fixe) : en-tête → stepper `1 Sélection ✓ / 2 Prélèvement / 3 Contrôle` →
carte de scan (champ + dernier scan + barre totale) → tableau des lignes → journal des scans.
Colonne mobile à droite, **plafonnée à 340 px** et qui passe sous la colonne principale sous ~880 px.

Tableau : `30px` état · `minmax(0,1.6fr)` Article (+ barre) · `minmax(0,1.1fr)` Entrepôt · Cde ·
`152px` Prélevé / demandé (stepper) · `64px` Action.
⚠ **Piège mesuré** : la version précédente avait 7 colonnes dont 482 px fixes — dans un conteneur de
537 px, les deux pistes `1fr` tombaient à 18 px et 12 px et tout le texte était coupé à un caractère.
Ne pas rajouter de colonne fixe ici ; tout ce qui est optionnel va sous le nom de l’article.

## Interactions & Behavior

| Élément | Comportement |
| --- | --- |
| Champ de scan | `Entrée` applique le code ; le champ se vide et garde le focus (`scanInputRef`) |
| Code reconnu | +`packSize` sur la ligne, plafonné à la quantité demandée, journal + dernier scan |
| Code déjà complet | Scan ignoré, message ambre (pas d’erreur bloquante) |
| Code inconnu | Champ en rouge, ligne d’erreur dans le journal, aucune quantité modifiée |
| Stepper − / + | Saisie manuelle, mêmes bornes que le scan |
| « Tout » | Passe la ligne à la quantité demandée ; sur une ligne complète, « Remettre à 0 » |
| Filtre « Restants » | Masque les lignes complètes (état local) |
| Journal → Annuler | Retire l’incrément de ce scan uniquement |
| Contrôle final | Actif seulement quand `restant === 0` |
| Mobile | Bouton « Scanner » → `BarcodeScannerDialog` ; saisie manuelle repliée sous la liste |

## State Management

```ts
// usePickScan.ts
picked: Record<string, number>     // clé = `${itemCode}-${warehouse}`
scanValue: string
feedback: { text: string; tone: "idle" | "ok" | "warn" | "error" }
lastScanKey: string | null
log: Array<{ id: string; key?: string; amount: number; code: string; time: string; tone }>
// écran
query: string; pendingOnly: boolean
```
`packSize` (incrément par scan) doit venir de l’article — **à confirmer côté API** ; à défaut, 1.
Le reste est dérivé des lignes de la liste de prélèvement déjà chargées par `PreparationPage`
(`?pick_lists=`), et l’enregistrement passe par la mutation existante de mise à jour des quantités
prélevées : **aucun nouvel endpoint**.

## Assets
Aucun. Icônes `lucide-react` : `ScanBarcode`, `Camera`, `ArrowLeft`, `CheckCircle`, `Minus`, `Plus`,
`RotateCcw`, `Search`. Les ✓ / ◐ / ○ sont les mêmes glyphes que `ListStateIcon` du handoff Préparation.

## Files du bundle
- `Prélèvement (scan).dc.html` — maquette de référence interactive (ouvrir dans un navigateur)
- `ScanConsole.tsx`, `pickLineRows.tsx`, `ScanJournal.tsx`, `usePickScan.ts` — composants proposés
