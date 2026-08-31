import {
  ClipboardList,
  Home,
  PackageCheck,
  Tag,
  Banknote,
  type LucideIcon,
} from "lucide-react"

export type PortalNavMatch = "home" | "offres" | "orders" | "deliveries" | "payments"

export const storeNav: { to: string; label: string; icon: LucideIcon; match: PortalNavMatch }[] = [
  { to: "/", label: "Accueil", icon: Home, match: "home" },
  { to: "/?view=offres", label: "Offres", icon: Tag, match: "offres" },
  { to: "/orders", label: "Mes commandes", icon: ClipboardList, match: "orders" },
  { to: "/deliveries", label: "Bons de livraison", icon: PackageCheck, match: "deliveries" },
  { to: "/payments", label: "Paiements", icon: Banknote, match: "payments" },
]

export function isStoreNavActive(item: (typeof storeNav)[number], pathname: string, search = "") {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  const view = params.get("view") || ""
  const onStorefront = pathname === "/"

  if (item.match === "home") return (onStorefront && view !== "offres") || pathname.startsWith("/products")
  if (item.match === "offres") return onStorefront && view === "offres"
  if (item.match === "orders") return pathname === "/orders" || pathname.startsWith("/orders/")
  if (item.match === "deliveries") return pathname === "/deliveries" || pathname.startsWith("/deliveries/")
  if (item.match === "payments") return pathname === "/payments"
  return false
}
