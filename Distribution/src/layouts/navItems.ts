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

export interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  roles: DistributionRole[]
}

export const navItems: NavItem[] = [
  { to: "/today", label: "Tableau de bord", icon: LayoutDashboard, roles: ["preparateur", "planificateur", "responsable"] },
  { to: "/preparation", label: "Préparation", icon: ClipboardCheck, roles: ["preparateur", "responsable"] },
  { to: "/planning", label: "Planification", icon: Route, roles: ["planificateur", "responsable"] },
  { to: "/deliveries", label: "Livraisons", icon: Truck, roles: ["planificateur", "responsable"] },
  { to: "/livreurs", label: "Livreurs", icon: UserRound, roles: ["planificateur", "responsable"] },
  { to: "/vehicules", label: "Véhicules", icon: Car, roles: ["planificateur", "responsable"] },
  { to: "/stock", label: "Stock véhicules", icon: Package, roles: ["preparateur", "planificateur", "responsable"] },
  { to: "/cashier", label: "Caisse", icon: Banknote, roles: ["caissier", "responsable"] },
  { to: "/caisses", label: "Caisses livreurs", icon: Wallet, roles: ["caissier", "responsable"] },
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
