import type { LucideIcon } from "lucide-react"
import { isNavItemActive, navGroupIcons, navGroupLabels, navItems } from "@/layouts/navItems"

export type Crumb = {
  label: string
  to?: string
  icon?: LucideIcon
}

const SECTION_LABELS: Record<string, string> = {
  today: "Tableau de bord",
  preparation: "Préparation",
  "codes-barres": "Codes-barres",
  planning: "Planification",
  deliveries: "Livraisons",
  livreurs: "Livreurs",
  vehicules: "Véhicules",
  stock: "Stock véhicules",
  receptions: "Réceptions",
  inventaires: "Inventaires",
  commandes: "Commandes",
  cashier: "Caisse Tournées",
  caisses: "Caisses livreurs",
  articles: "Articles",
  clients: "Clients",
  analyses: "Aide à la décision",
  creances: "Créances clients",
}

const PILOTAGE_PAGES: Record<string, string> = {
  tresorerie: "Trésorerie",
  livraison: "Performance livraison",
  stock: "Préparation & stock",
  clients: "Clients & commercial",
  objectifs: "Objectifs",
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
  return [{ label: navGroupLabels[item.group], icon: navGroupIcons[item.group] }, ...withPageIcon]
}

function pickListNamesFromSearch(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  return (params.get("pick_lists") || params.get("pick_list") || "")
    .split(",")
    .map((name) => decodeURIComponent(name.trim()))
    .filter(Boolean)
}

export function crumbsFromPath(pathname: string, search = ""): Crumb[] {
  const parts = pathname.split("/").filter(Boolean)
  const section = parts[0]
  if (!section) return withNavContext("/today", [{ label: "Tableau de bord" }])
  const label = SECTION_LABELS[section] || section
  if (section === "planning" && parts[1] === "routes" && parts[2]) {
    return withNavContext(pathname, [{ label, to: "/planning" }, { label: decodeURIComponent(parts[2]) }])
  }
  if (section === "preparation") {
    const pickLists = pickListNamesFromSearch(search)
    if (pickLists.length) {
      return withNavContext("/preparation", [
        { label, to: "/preparation" },
        { label: pickLists.length === 1 ? pickLists[0] : pickLists.join(", ") },
      ])
    }
    if (parts[1] === "commandes" && parts[2]) {
      return withNavContext(pathname, [{ label, to: "/preparation" }, { label: decodeURIComponent(parts[2]) }])
    }
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
  if (section === "inventaires" && parts[1]) {
    const crumbs: Crumb[] = [{ label, to: "/inventaires" }, { label: decodeURIComponent(parts[1]), to: parts[2] ? `/inventaires/${parts[1]}` : undefined }]
    if (parts[2] === "comptage") crumbs.push({ label: "Comptage" })
    return withNavContext(pathname, crumbs)
  }
  if (section === "articles" && parts[1]) {
    const page = CATALOG_PAGES[parts[1]]
    if (page && !parts[2]) return withNavContext(pathname, [{ label: page }])
    return withNavContext(pathname, [{ label, to: "/articles" }, { label: decodeURIComponent(parts.slice(1).join("/")) }])
  }
  if (section === "pilotage" && PILOTAGE_PAGES[parts[1]]) {
    return withNavContext(pathname, [{ label: PILOTAGE_PAGES[parts[1]] }])
  }
  if (section === "cashier" && parts[1]) {
    return withNavContext(pathname, [{ label, to: "/cashier" }, { label: decodeURIComponent(parts[1]) }])
  }
  if (section === "caisses" && parts[1]) {
    return withNavContext(pathname, [{ label, to: "/caisses" }, { label: decodeURIComponent(parts[1]) }])
  }
  return withNavContext(pathname, [{ label }])
}
