import {
  Banknote,
  ClipboardList,
  Home,
  House,
  PackageCheck,
  PackagePlus,
  ShoppingCart,
  Tag,
  UserRound,
  type LucideIcon,
} from "lucide-react"

export type StoreNavMatch = "home" | "offres" | "orders" | "deliveries" | "payments" | "cart" | "account" | "requests"

export type StoreNavItem = {
  to: string
  label: string
  icon: LucideIcon
  match: StoreNavMatch
}

export const storeNav: StoreNavItem[] = [
  { to: "/", label: "Accueil", icon: Home, match: "home" },
  { to: "/?view=offres", label: "Offres", icon: Tag, match: "offres" },
  { to: "/requests", label: "Demander un article", icon: PackagePlus, match: "requests" },
  { to: "/orders", label: "Mes commandes", icon: ClipboardList, match: "orders" },
  { to: "/deliveries", label: "Bons de livraison", icon: PackageCheck, match: "deliveries" },
  { to: "/payments", label: "Paiements", icon: Banknote, match: "payments" },
]

export const mobileStoreNav: StoreNavItem[] = [
  { to: "/", label: "Accueil", icon: House, match: "home" },
  { to: "/?view=offres", label: "Promotions", icon: Tag, match: "offres" },
  { to: "/cart", label: "Panier", icon: ShoppingCart, match: "cart" },
  { to: "/account", label: "Compte", icon: UserRound, match: "account" },
]

export function searchParamsOf(search = "") {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
}

export function isPromotionContext(pathname: string, search = "") {
  const view = searchParamsOf(search).get("view")
  if (view !== "offres") return false
  return pathname === "/" || pathname.startsWith("/products")
}

export function productDetailsTo(itemCode: string, search = "") {
  const path = `/products/${encodeURIComponent(itemCode)}`
  const params = searchParamsOf(search)
  if (params.get("view") === "offres") return `${path}?view=offres`
  const campaign = params.get("campaign")
  if (campaign) return `${path}?campaign=${encodeURIComponent(campaign)}`
  return path
}

export function productBackTo(search = "") {
  const params = searchParamsOf(search)
  if (params.get("view") === "offres") return "/?view=offres"
  const campaign = params.get("campaign")
  if (campaign) return `/?campaign=${encodeURIComponent(campaign)}`
  return "/"
}

export function isStoreNavActive(match: StoreNavMatch, pathname: string, search = "") {
  const params = searchParamsOf(search)
  const view = params.get("view") || ""
  const onStorefront = pathname === "/"
  const onProduct = pathname.startsWith("/products")
  const fromPromotion = isPromotionContext(pathname, search)

  if (match === "home") return (onStorefront && view !== "offres") || (onProduct && !fromPromotion)
  if (match === "offres") return fromPromotion
  if (match === "cart") return pathname === "/cart" || pathname.startsWith("/cart/")
  if (match === "account") {
    return (
      pathname === "/account" ||
      pathname.startsWith("/account/") ||
      pathname === "/orders" ||
      pathname.startsWith("/orders/") ||
      pathname === "/deliveries" ||
      pathname.startsWith("/deliveries/") ||
      pathname === "/payments" ||
      pathname.startsWith("/payments/") ||
      pathname === "/notifications" ||
      pathname.startsWith("/notifications/")
    )
  }
  if (match === "orders") return pathname === "/orders" || pathname.startsWith("/orders/")
  if (match === "deliveries") return pathname === "/deliveries" || pathname.startsWith("/deliveries/")
  if (match === "payments") return pathname === "/payments" || pathname.startsWith("/payments/")
  if (match === "requests") return pathname === "/requests" || pathname.startsWith("/requests/")
  return false
}

export function mobileHeaderTitle(pathname: string, search = "") {
  const params = searchParamsOf(search)
  const section = pathname.split("/").filter(Boolean)[0]
  if (!section) return params.get("view") === "offres" ? "Promotions" : "Boutique"
  if (section === "store" || section === "products") return "Boutique"
  if (section === "cart") return "Panier"
  if (section === "orders") return "Mes commandes"
  if (section === "deliveries") return "Bons de livraison"
  if (section === "payments") return "Paiements"
  if (section === "account") return params.get("tab") ? "Mon compte" : "Compte"
  if (section === "requests") return "Demandes"
  if (section === "notifications") return "Notifications"
  return "Boutique"
}
