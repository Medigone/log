import {
  Banknote,
  Car,
  ClipboardCheck,
  LayoutDashboard,
  Package,
  Route,
  Truck,
  UserRound,
  Wallet,
} from "lucide-react"
import type { DistributionRole } from "@/shared/types/distribution"

/** Groupes affichés dans la barre latérale, dans cet ordre. */
export const navGroups = ["exploitation", "ressources", "encaissement"] as const
export type NavGroup = (typeof navGroups)[number]

export const navGroupLabels: Record<NavGroup, string> = {
  exploitation: "Exploitation",
  ressources: "Ressources",
  encaissement: "Encaissement",
}

/** Clé de compteur : voir navBadges.ts */
export type NavBadgeKey = "toPick" | "toPlan" | "toLoad" | "cashToControl"

export interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  roles: DistributionRole[]
  group: NavGroup
  badgeKey?: NavBadgeKey
}

export const navItems: NavItem[] = [
  { to: "/today", label: "Tableau de bord", icon: LayoutDashboard, group: "exploitation", roles: ["preparateur", "planificateur", "responsable"] },
  { to: "/preparation", label: "Préparation", icon: ClipboardCheck, group: "exploitation", badgeKey: "toPick", roles: ["preparateur", "responsable"] },
  { to: "/planning", label: "Planification", icon: Route, group: "exploitation", badgeKey: "toPlan", roles: ["planificateur", "responsable"] },
  { to: "/deliveries", label: "Livraisons", icon: Truck, group: "exploitation", roles: ["planificateur", "responsable"] },
  { to: "/livreurs", label: "Livreurs", icon: UserRound, group: "ressources", roles: ["planificateur", "responsable"] },
  { to: "/vehicules", label: "Véhicules", icon: Car, group: "ressources", roles: ["planificateur", "responsable"] },
  { to: "/stock", label: "Stock véhicules", icon: Package, group: "ressources", badgeKey: "toLoad", roles: ["preparateur", "planificateur", "responsable"] },
  { to: "/cashier", label: "Caisse Tournées", icon: Banknote, group: "encaissement", badgeKey: "cashToControl", roles: ["caissier", "responsable"] },
  { to: "/caisses", label: "Caisses livreurs", icon: Wallet, group: "encaissement", roles: ["responsable"] },
]

export const roleLabels: Record<DistributionRole, string> = {
  preparateur: "Préparateur",
  planificateur: "Planificateur",
  livreur: "Livreur",
  caissier: "Caissier",
  responsable: "Responsable",
  none: "Accès limité",
}

export function visibleNavItems(role: DistributionRole) {
  return navItems.filter((item) => item.roles.includes(role))
}

/** Items groupés, groupes vides retirés — un caissier ne voit que « Encaissement ». */
export function groupedNavItems(role: DistributionRole) {
  const visible = visibleNavItems(role)
  return navGroups
    .map((group) => ({
      group,
      label: navGroupLabels[group],
      items: visible.filter((item) => item.group === group),
    }))
    .filter((entry) => entry.items.length > 0)
}

export function isNavItemActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`)
}
