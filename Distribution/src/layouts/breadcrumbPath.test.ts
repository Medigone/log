import { describe, expect, it } from "vitest"
import { crumbsFromPath } from "@/layouts/breadcrumbPath"
import { LayoutDashboard, Package, Truck, UserRound, Wallet } from "lucide-react"

function labels(pathname: string, search = "") {
  return crumbsFromPath(pathname, search).map((crumb) => crumb.label)
}

function hops(pathname: string, search = "") {
  return crumbsFromPath(pathname, search).map((crumb) => ({ label: crumb.label, to: crumb.to }))
}

describe("crumbsFromPath", () => {
  it("préfixe la liste par la catégorie du menu", () => {
    expect(labels("/today")).toEqual(["Exploitation", "Tableau de bord"])
    expect(labels("/deliveries")).toEqual(["Exploitation", "Livraisons"])
    expect(labels("/codes-barres")).toEqual(["Ressources", "Codes-barres"])
    expect(labels("/stock")).toEqual(["Ressources", "Stock véhicules"])
    expect(labels("/cashier")).toEqual(["Caisse", "Caisse Tournées"])
  })

  it("garde le lien vers la liste sur une fiche détail", () => {
    expect(hops("/planning/routes/LIV-26-09-00001")).toEqual([
      { label: "Exploitation", to: undefined },
      { label: "Planification", to: "/planning" },
      { label: "LIV-26-09-00001", to: undefined },
    ])
    expect(hops("/livreurs/i1m9bh99va")).toEqual([
      { label: "Ressources", to: undefined },
      { label: "Livreurs", to: "/livreurs" },
      { label: "i1m9bh99va", to: undefined },
    ])
    expect(hops("/cashier/LIV-1")).toEqual([
      { label: "Caisse", to: undefined },
      { label: "Caisse Tournées", to: "/cashier" },
      { label: "LIV-1", to: undefined },
    ])
    expect(hops("/caisses/i1m9bh99va")).toEqual([
      { label: "Caisse", to: undefined },
      { label: "Caisses livreurs", to: "/caisses" },
      { label: "i1m9bh99va", to: undefined },
    ])
    expect(hops("/preparation/commandes/SAL-ORD-1")).toEqual([
      { label: "Exploitation", to: undefined },
      { label: "Préparation", to: "/preparation" },
      { label: "SAL-ORD-1", to: undefined },
    ])
  })

  it("affiche l’id de la pick list ouverte", () => {
    expect(hops("/preparation", "?pick_lists=PL-1")).toEqual([
      { label: "Exploitation", to: undefined },
      { label: "Préparation", to: "/preparation" },
      { label: "PL-1", to: undefined },
    ])
    expect(labels("/preparation", "?pick_lists=PL-1,PL-2")).toEqual([
      "Exploitation",
      "Préparation",
      "PL-1, PL-2",
    ])
  })

  it("attache les icônes de catégorie et de page", () => {
    const deliveries = crumbsFromPath("/deliveries")
    expect(deliveries[0].icon).toBe(LayoutDashboard)
    expect(deliveries[1].icon).toBe(Truck)
    const livreurs = crumbsFromPath("/livreurs/abc")
    expect(livreurs[0].icon).toBe(Package)
    expect(livreurs[1].icon).toBe(UserRound)
    expect(livreurs[2].icon).toBeUndefined()
    expect(crumbsFromPath("/caisses")[0].icon).toBe(Wallet)
  })

  it("laisse un chemin hors nav sans catégorie", () => {
    expect(labels("/unknown")).toEqual(["unknown"])
  })
})
