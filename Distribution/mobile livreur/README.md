# Handoff — Interface livreur mobile

Cible : `src/features/driver/` de **Distribution**. Maquette de référence : `Interface livreur mobile.dc.html` (8 écrans, 390 × 844, ids `1a`–`1h`).

Conventions respectées : `Card density="touch"`, `StatusBadge` + `routeLifecycleTone`, `Tabs variant="segmented"`, classes `num` / `t-micro` / `t-meta` / `t-section`, tokens `brand-*`, `rounded-touch`, icônes `lucide-react`. Aucune couleur brute introduite hors accents sémantiques déjà présents (`emerald`/`amber`/`rose` via les tones existants).

## Les trois problèmes traités

1. **Trop de taps pour valider un arrêt** → le wizard passe de 5 à 4 étapes (`useStopWizardSteps`).
2. **On ne sait pas où on en est** → barre de progression par arrêt + timeline verticale (`RouteProgressBar`, `StopTimeline`).
3. **Le bilan caisse n'est pas rassurant** → écran orienté « à remettre » avec rapprochement explicite (`CashHandoverSummary`).

Ajout : 4ᵉ onglet **Carte** (`DriverTabBar`, `RouteMapTab`).

## Fichiers

| Fichier | Destination | Écran |
|---|---|---|
| `driverMobile.ts` | `src/features/driver/driverMobile.ts` | transverse |
| `DriverTabBar.tsx` | `src/features/driver/DriverTabBar.tsx` | tous |
| `RouteProgressBar.tsx` | `src/features/driver/RouteProgressBar.tsx` | 1c, 1g |
| `StopTimeline.tsx` | `src/features/driver/StopTimeline.tsx` | 1c |
| `CurrentStopCard.tsx` | `src/features/driver/CurrentStopCard.tsx` | 1c, 1g |
| `RouteMapTab.tsx` | `src/features/driver/RouteMapTab.tsx` | 1g |
| `useStopWizardSteps.ts` | `src/features/driver/useStopWizardSteps.ts` | 1d, 1e |
| `StopOutcomeStep.tsx` | `src/features/driver/StopOutcomeStep.tsx` | 1d |
| `CollectedEvidenceList.tsx` | `src/features/driver/CollectedEvidenceList.tsx` | 1e |
| `CashHandoverSummary.tsx` | `src/features/driver/CashHandoverSummary.tsx` | 1h |

## À faire dans l'appli existante

**`DriverApp.tsx`** — remplacer la `TabsList` à 3 onglets par `<DriverTabBar>`, ajouter la valeur `"map"` au type d'onglet et un `TabsContent value="map"` rendant `<RouteMapTab>`. Conserver la persistance d'onglet existante.

**`DriverDashboard.tsx`** — au-dessus du contenu, insérer `<RouteProgressBar stops={route.stops} />`; remplacer la liste d'arrêts par `<StopTimeline>` (qui embarque `<CurrentStopCard>` sur l'arrêt courant). Les compteurs de tête (livrés / restants / encaissé) viennent de `routeProgress()`.

**`StopCompletionWizard.tsx`** — passer par `useStopWizardSteps` : l'étape « Preuves » absorbe le récapitulatif (`CollectedEvidenceList` rendu dans l'étape Encaissement), le GPS est déclenché au montage au lieu d'être une étape, et `StopOutcomeStep` avance automatiquement à la sélection. Le libellé du bouton final porte le montant.

**`DriverRouteList.tsx`** — la carte de la tournée du jour (`lifecycle` ∈ *Publiée* / *En cours*) reçoit un bouton d'action pleine largeur et la grille à 3 chiffres (arrêts / articles / fin prévue). Voir `1a`.

**`DriverCashPage.tsx`** (`src/features/cashier/`) — remplacer le corps par `<CashHandoverSummary>`.

## Manques côté API — à arbitrer

- **`estimatedArrival` par arrêt** et **fin de tournée estimée** (`1c`, `1g`) : n'existent pas. `estimateArrivals()` dans `driverMobile.ts` fournit un calcul local naïf (durée moyenne par arrêt) derrière le drapeau `showEta` — à remplacer par un champ serveur ou à retirer.
- **`stop.latitude/longitude` pour tous les arrêts** (`1g`) : présents dans `RouteStop` mais souvent nuls (le GPS n'est collecté qu'à la livraison). La carte a besoin des coordonnées **client**, sinon les pastilles à venir sont non plaçables.
- **`route.expectedCash`** (`1h`, ligne « attendu sur les BL livrés ») : à exposer pour calculer l'écart côté serveur plutôt que de sommer les BL dans le client.
- **Nombre de chèques** (`1h`) : dérivé des `payment.mode`, OK, mais confirmer qu'un arrêt ne porte qu'un paiement.
- **Comptage des articles à retourner** (`1h`) : `stop.items` moins `quantities` livrées — à vérifier pour les partiels.

## Fond cartographique

`RouteMapTab` laisse le conteneur de tuiles vide (`data-map-root`). Brancher la même dépendance que le dashboard planificateur si elle existe déjà ; sinon Leaflet + OSM, pastilles rendues en HTML via un `divIcon` pour réutiliser les tones.
