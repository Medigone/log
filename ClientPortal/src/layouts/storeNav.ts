import { BadgePercent, Home, ShoppingBag, type LucideIcon } from "lucide-react"

export const storeNav: { to: string; label: string; icon: LucideIcon; view: string | null }[] = [
  { to: "/", label: "Accueil", icon: Home, view: null },
  { to: "/?view=offres", label: "Offres", icon: BadgePercent, view: "offres" },
  { to: "/?view=catalog", label: "Catalogue", icon: ShoppingBag, view: "catalog" },
]

export function isStoreNavActive(item: (typeof storeNav)[number], onStorefront: boolean, view: string, group: string) {
  return onStorefront && (item.view ? !group && view === item.view : !group && !view)
}
