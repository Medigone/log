import {
  BadgePercent,
  Banknote,
  Boxes,
  Car,
  ClipboardCheck,
  ClipboardList,
  FolderTree,
  LayoutDashboard,
  Package,
  PackageCheck,
  ReceiptText,
  Route,
  ScanBarcode,
  ShoppingCart,
  Tags,
  Truck,
  UserRound,
  Users,
  Wallet,
} from "lucide-react"
import type { DistributionRole, DistributionUser } from "@/shared/types/distribution"

/** Groupes affichés dans la barre latérale, dans cet ordre. */
export const navGroups = ["ventes", "operations", "stock", "ressources"] as const
export type NavGroup = (typeof navGroups)[number]

export const navGroupLabels: Record<NavGroup, string> = {
  ventes: "Ventes",
  operations: "Opérationnel",
  stock: "Stock",
  ressources: "Ressources",
}

/** Clé de compteur : voir navBadges.ts */
export type NavBadgeKey = "toPick" | "toPlan" | "toLoad" | "cashToControl" | "receiptsToValidate" | "ordersToValidate" | "inventories"

/** Accès accordé en plus du rôle principal (un utilisateur n'a qu'un rôle Distribution). */
export type NavCapability = "catalog"

export interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  roles: DistributionRole[]
  group: NavGroup
  badgeKey?: NavBadgeKey
  capability?: NavCapability
}

const CATALOG_ROLES: DistributionRole[] = ["catalogue", "responsable"]

export const navItems: NavItem[] = [
  // Ventes : commandes clients et catalogue (articles, prix, promotions).
  { to: "/commandes/nouvelle", label: "Nouvelle commande", icon: ShoppingCart, group: "ventes", roles: ["commercial", "responsable"] },
  { to: "/commandes", label: "Commandes", icon: ReceiptText, group: "ventes", badgeKey: "ordersToValidate", roles: ["commercial", "responsable"] },
  { to: "/clients", label: "Clients", icon: Users, group: "ventes", roles: ["commercial", "responsable"] },
  { to: "/articles", label: "Articles", icon: Boxes, group: "ventes", roles: CATALOG_ROLES, capability: "catalog" },
  { to: "/articles/prix", label: "Prix", icon: Tags, group: "ventes", roles: CATALOG_ROLES, capability: "catalog" },
  { to: "/articles/promotions", label: "Promotions", icon: BadgePercent, group: "ventes", roles: CATALOG_ROLES, capability: "catalog" },
  { to: "/articles/referentiels", label: "Référentiels", icon: FolderTree, group: "ventes", roles: CATALOG_ROLES, capability: "catalog" },
  // Opérationnel : de la planification à la livraison, jusqu’au contrôle de caisse.
  { to: "/today", label: "Tableau de bord", icon: LayoutDashboard, group: "operations", roles: ["preparateur", "planificateur", "responsable"] },
  { to: "/planning", label: "Planification", icon: Route, group: "operations", badgeKey: "toPlan", roles: ["planificateur", "responsable"] },
  { to: "/deliveries", label: "Livraisons", icon: Truck, group: "operations", roles: ["planificateur", "responsable"] },
  { to: "/cashier", label: "Caisse Tournées", icon: Banknote, group: "operations", badgeKey: "cashToControl", roles: ["caissier", "responsable"] },
  { to: "/caisses", label: "Caisses livreurs", icon: Wallet, group: "operations", roles: ["responsable"] },
  // Stock : préparation, chargement, inventaires et entrées de marchandise.
  { to: "/preparation", label: "Préparation", icon: ClipboardCheck, group: "stock", badgeKey: "toPick", roles: ["preparateur", "responsable"] },
  { to: "/stock", label: "Stock véhicules", icon: Package, group: "stock", badgeKey: "toLoad", roles: ["preparateur", "planificateur", "responsable"] },
  { to: "/inventaires", label: "Inventaires", icon: ClipboardList, group: "stock", badgeKey: "inventories", roles: ["preparateur", "magasinier", "responsable"] },
  { to: "/codes-barres", label: "Codes-barres", icon: ScanBarcode, group: "stock", roles: ["preparateur", "planificateur", "responsable"] },
  { to: "/receptions", label: "Réceptions", icon: PackageCheck, group: "stock", badgeKey: "receiptsToValidate", roles: ["magasinier", "responsable"] },
  // Ressources : équipes et flotte.
  { to: "/livreurs", label: "Livreurs", icon: UserRound, group: "ressources", roles: ["planificateur", "responsable"] },
  { to: "/vehicules", label: "Véhicules", icon: Car, group: "ressources", roles: ["planificateur", "responsable"] },
]

export const roleLabels: Record<DistributionRole, string> = {
  preparateur: "Préparateur",
  planificateur: "Planificateur",
  livreur: "Livreur",
  caissier: "Caissier",
  magasinier: "Magasinier",
  commercial: "Commercial",
  catalogue: "Gestionnaire catalogue",
  responsable: "Responsable",
  none: "Accès limité",
}

export function userCapabilities(user: Pick<DistributionUser, "canManageCatalog">): NavCapability[] {
  return user.canManageCatalog ? ["catalog"] : []
}

/** Rôle catalogue, Responsable, ou autre rôle doublé du rôle Gestionnaire catalogue. */
export function canAccessCatalog(user: Pick<DistributionUser, "role" | "canManageCatalog">) {
  return CATALOG_ROLES.includes(user.role) || Boolean(user.canManageCatalog)
}

export function visibleNavItems(role: DistributionRole, capabilities: readonly NavCapability[] = []) {
  return navItems.filter(
    (item) => item.roles.includes(role) || (item.capability !== undefined && capabilities.includes(item.capability)),
  )
}

/** Items groupés, groupes vides retirés — un caissier ne voit que « Opérationnel ». */
export function groupedNavItems(role: DistributionRole, capabilities: readonly NavCapability[] = []) {
  const visible = visibleNavItems(role, capabilities)
  return navGroups
    .map((group) => ({
      group,
      label: navGroupLabels[group],
      items: visible.filter((item) => item.group === group),
    }))
    .filter((entry) => entry.items.length > 0)
}

function matchesPath(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`)
}

/** L'entrée la plus précise gagne : /commandes/nouvelle n'active pas aussi « Commandes ». */
export function isNavItemActive(pathname: string, to: string) {
  if (!matchesPath(pathname, to)) return false
  return !navItems.some((item) => item.to !== to && item.to.startsWith(`${to}/`) && matchesPath(pathname, item.to))
}
