import type { LucideIcon } from "lucide-react"
import { LayoutDashboard, PackageCheck, ShoppingCart, Truck } from "lucide-react"
import { isNavItemActive, navGroupLabels, navItems, type NavGroup } from "@/layouts/navItems"

export type Crumb = {
  label: string
  to?: string
  icon?: LucideIcon
}

const GROUP_ICONS: Record<NavGroup, LucideIcon> = {
  ventes: ShoppingCart,
  operations: LayoutDashboard,
  achats: PackageCheck,
  ressources: Truck,
}

const SECTION_LABELS: Record<string, string> = {
  today: "Tableau de bord",
  preparation: "Préparation",
  planning: "Planification",
  deliveries: "Livraisons",
  livreurs: "Livreurs",
  vehicules: "Véhicules",
  stock: "Stock véhicules",
  receptions: "Réceptions",
  commandes: "Commandes",
  cashier: "Caisse Tournées",
  caisses: "Caisses livreurs",
  articles: "Articles",
  clients: "Clients",
}

const CATALOG_PAGES: Record<string, string> = {
  prix: "Prix",
  promotions: "Promotions",
  referentiels: "Référentiels",
}

function withNavContext(pathname: string, crumbs: Crumb[]): Crumb[] {
  const item = navItems.find((entry) => isNavItemActive(pathname, entry.to))
  if (!item) return crumbs
  const withPageIcon = crumbs.map((crumb) =>
    crumb.label === item.label ? { ...crumb, icon: item.icon } : crumb,
  )
  return [{ label: navGroupLabels[item.group], icon: GROUP_ICONS[item.group] }, ...withPageIcon]
}

export function crumbsFromPath(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean)
  const section = parts[0]
  if (!section) return withNavContext("/today", [{ label: "Tableau de bord" }])
  const label = SECTION_LABELS[section] || section
  if (section === "planning" && parts[1] === "routes" && parts[2]) {
    return withNavContext(pathname, [{ label, to: "/planning" }, { label: decodeURIComponent(parts[2]) }])
  }
  if (section === "preparation" && parts[1] === "commandes" && parts[2]) {
    return withNavContext(pathname, [{ label, to: "/preparation" }, { label: decodeURIComponent(parts[2]) }])
  }
  if ((section === "livreurs" || section === "vehicules") && parts[1]) {
    return withNavContext(pathname, [{ label, to: `/${section}` }, { label: decodeURIComponent(parts[1]) }])
  }
  if (section === "commandes" && parts[1]) {
    const detail = parts[1] === "nouvelle" ? "Nouvelle commande" : decodeURIComponent(parts[1])
    return withNavContext(pathname, [{ label, to: "/commandes" }, { label: detail }])
  }
  if (section === "clients" && parts[1]) {
    return withNavContext(pathname, [{ label, to: "/clients" }, { label: decodeURIComponent(parts[1]) }])
  }
  if (section === "receptions" && parts[1]) {
    return withNavContext(pathname, [{ label, to: "/receptions" }, { label: decodeURIComponent(parts[1]) }])
  }
  if (section === "articles" && parts[1]) {
    const page = CATALOG_PAGES[parts[1]]
    if (page && !parts[2]) return withNavContext(pathname, [{ label: page }])
    return withNavContext(pathname, [{ label, to: "/articles" }, { label: decodeURIComponent(parts.slice(1).join("/")) }])
  }
  if (section === "cashier" && parts[1]) {
    return withNavContext(pathname, [{ label, to: "/cashier" }, { label: decodeURIComponent(parts[1]) }])
  }
  if (section === "caisses" && parts[1]) {
    return withNavContext(pathname, [{ label, to: "/caisses" }, { label: decodeURIComponent(parts[1]) }])
  }
  return withNavContext(pathname, [{ label }])
}
