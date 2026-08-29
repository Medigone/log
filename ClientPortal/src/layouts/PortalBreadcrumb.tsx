import { Fragment } from "react"
import { Link, useLocation } from "react-router-dom"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

type Crumb = { label: string; to?: string }

export function crumbsFromPath(pathname: string, search = ""): Crumb[] {
  const params = new URLSearchParams(search)
  const group = params.get("group")
  const view = params.get("view")
  const [section, id] = pathname.split("/").filter(Boolean)
  if (!section) {
    if (group) return [{ label: "Boutique", to: "/" }, { label: group }]
    if (view === "offres") return [{ label: "Boutique", to: "/" }, { label: "Offres" }]
    if (view === "catalog") return [{ label: "Boutique", to: "/" }, { label: "Catalogue" }]
    return [{ label: "Boutique" }]
  }
  if (section === "store") return [{ label: "Boutique" }]
  if (section === "products") return [{ label: "Boutique", to: "/" }, { label: id || "Article" }]
  if (section === "cart") return [{ label: "Panier" }]
  if (section === "orders") {
    return id
      ? [{ label: "Commandes", to: "/orders" }, { label: id }]
      : [{ label: "Commandes" }]
  }
  if (section === "deliveries") {
    return id
      ? [{ label: "Bons de livraison", to: "/deliveries" }, { label: id }]
      : [{ label: "Bons de livraison" }]
  }
  if (section === "payments") return [{ label: "Paiements" }]
  if (section === "account") return [{ label: "Mon compte" }]
  return [{ label: "Boutique" }]
}

export function PortalBreadcrumb() {
  const { pathname, search } = useLocation()
  const crumbs = crumbsFromPath(pathname, search)

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              {index > 0 && <BreadcrumbSeparator className="hidden md:block" />}
              <BreadcrumbItem className={index === 0 && !last ? "hidden md:block" : undefined}>
                {last || !crumb.to ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link to={crumb.to} />}>{crumb.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
