# Handoff : refonte de la navigation latérale

## Overview
Refonte de la barre latérale (`AppSidebar` + `navItems.ts`) : les 9 entrées plates sous un unique
libellé « Console » deviennent 3 groupes métier, avec des compteurs de file directement dans le menu,
un état actif plus lisible, un rail replié utilisable et l’espace vide (~900 px sur grand écran)
occupé par une recherche et un rappel des anomalies.

## About the Design Files
`Navigation latérale.dc.html` est une **maquette HTML de référence** : intention visuelle et
comportement, pas du code à livrer. La cible est le codebase existant — `SidebarProvider` /
`Sidebar*` de `src/components/ui/sidebar.tsx` (shadcn/ui + Base UI), `navItems.ts`, `NavUser.tsx`,
`BrandLogo.tsx`, `DesktopShell.tsx`. Les `.tsx` de ce bundle sont des **implémentations proposées**
dans vos conventions, à relire et brancher.

## Fidelity
**Hi-fi**, et **la géométrie vient de votre code**, pas de la maquette :
`SIDEBAR_WIDTH = 13rem`, `SIDEBAR_WIDTH_ICON = 3rem`, `SIDEBAR_WIDTH_MOBILE = 15rem`,
raccourci `⌘/Ctrl + B`, persistance par cookie `sidebar_state` — tout cela existe déjà dans
`sidebar.tsx` et ne doit pas être réinventé. La refonte ne touche que le **contenu** de
`SidebarHeader` / `SidebarContent` / `SidebarFooter`.

## Fichiers du codebase concernés

| Fichier | Action |
| --- | --- |
| `src/layouts/navItems.ts` | Ajout d’un champ `group` (+ optionnel `badgeKey`) sur chaque item |
| `src/layouts/AppSidebar.tsx` | 1 `SidebarGroup` → 3 groupes, badges, encart anomalies, recherche |
| `src/layouts/NavSearch.tsx` | **Nouveau** — champ de recherche ⌘K dans le header de la barre |
| `src/layouts/NavAlertCard.tsx` | **Nouveau** — encart « N anomalies » au-dessus du footer |
| `src/layouts/navBadges.ts` | **Nouveau** — dérive les compteurs depuis `useActivityDashboard` |
| `src/layouts/NavUser.tsx` | Ligne secondaire enrichie : `Responsable · Dépôt Oran` |
| `src/components/ui/sidebar.tsx` | **Inchangé** |

## Ce qui change, et pourquoi

1. **3 groupes au lieu d’un « Console » fourre-tout.**
   - `Exploitation` : Tableau de bord, Préparation, Planification, Livraisons
   - `Ressources` : Livreurs, Véhicules, Stock véhicules
   - `Encaissement` : Caisse, Caisses livreurs
   Les groupes vides doivent disparaître : `visibleNavItems(role)` filtre déjà par rôle, donc un
   caissier ne voit que `Encaissement` — ne pas rendre un `SidebarGroupLabel` sans items.
2. **Compteurs de file dans le menu.** L’app est pilotée par des files d’attente ; le nombre
   d’éléments en attente doit être visible sans ouvrir la page. Badge neutre par défaut, badge rouge
   (`bg-destructive/10 text-destructive`) quand la file contient du retard. En rail replié, le badge
   devient un point rouge en haut à droite de l’icône.
3. **État actif plus lisible** : fond `bg-sidebar-accent` + **barre verticale 2 px** à gauche +
   libellé en `font-semibold`. Le seul fond gris actuel se lit mal sur un écran d’entrepôt.
4. **Rail replié réellement exploitable** : icônes centrées, `SidebarMenuButton tooltip={label}`
   (déjà géré par votre composant), point rouge à la place des compteurs, le bouton de bascule
   remplace le bloc de marque.
5. **Recherche ⌘K** dans le header et **encart anomalies** au-dessus du profil : l’écran actuel a
   ~900 px de vide entre « Caisses livreurs » et le pied de page.
6. **Hauteur bornée** : la barre doit être `h-svh` avec le `SidebarContent` en `min-h-0 overflow-y-auto`
   (c’est déjà le cas dans `sidebar.tsx` — ne pas passer `min-height: 100vh` sur un enfant, sinon le
   footer et l’encart tombent sous la ligne de flottaison).

## Design Tokens
Aucun nouveau token. Utiliser ceux de `sidebar.tsx` (`bg-sidebar`, `text-sidebar-foreground`,
`bg-sidebar-accent`, `border-sidebar-border`) et `StatusBadge`/`Badge` pour les compteurs.
Hauteur d’item : celle de `SidebarMenuButton` (`size="default"`), non modifiée.
Libellés de groupe : `SidebarGroupLabel` existant (mono, uppercase, `text-muted-foreground`).

## Assets
`BrandLogo` sert `/assets/log/images/intrapro-mark.png` et `intrapro-logo.png` — assets runtime
Frappe, absents du repo. La maquette utilise un emplacement d’image à cet endroit ; en production,
`<BrandLogo compact className="size-8" />` tel quel. Icônes : `lucide-react`, exactement celles de
`navItems.ts` (`LayoutDashboard`, `ClipboardCheck`, `Route`, `Truck`, `UserRound`, `Car`, `Package`,
`Banknote`, `Wallet`) + `PanelLeftIcon`, `Search`, `ChevronsUpDown`.

## Interactions & Behavior

| Élément | Comportement |
| --- | --- |
| Item | `NavLink to` — inchangé ; `aria-current` via `NavLink` |
| Bouton bascule | `toggleSidebar()` de `useSidebar()` (cookie + ⌘B déjà gérés) |
| Badge | Lecture seule, non cliquable séparément |
| Recherche | Ouvre la palette ⌘K (à brancher ; aujourd’hui inexistante) |
| Encart anomalies | Lien vers `/today` ; fermeture persistée en `sessionStorage` |
| Profil | `NavUser` existant (dropdown + déconnexion) |

## State Management
Rien de nouveau côté navigation : l’ouverture/fermeture vient de `SidebarProvider`.
Les compteurs viennent de `useActivityDashboard(today)` — **un seul appel, déjà présent sur `/today`** ;
l’exposer via un petit hook `useNavBadges()` pour éviter un second fetch. Si le dashboard n’est pas
chargé, ne pas afficher `0` : masquer le badge.

## Files du bundle
- `Navigation latérale.dc.html` — maquette de référence
- `navItems.ts` — version proposée (ajout du champ `group`)
- `AppSidebar.tsx` — composition proposée
- `navBadges.ts` — dérivation des compteurs
- `NavAlertCard.tsx` — encart anomalies
