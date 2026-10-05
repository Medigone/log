import { describe, expect, it } from "vitest"
import { crumbsFromPath } from "@/layouts/breadcrumbPath"
import { Truck, UserRound } from "lucide-react"
import { navGroupIcons } from "@/layouts/navItems"

function labels(pathname: string, search = "") {
  return crumbsFromPath(pathname, search).map((crumb) => crumb.label)
}

function hops(pathname: string, search = "") {
  return crumbsFromPath(pathname, search).map((crumb) => ({ label: crumb.label, to: crumb.to }))
}

describe("crumbsFromPath", () => {
  it("préfixe la liste par la catégorie du menu", () => {
    expect(labels("/today")).toEqual(["Opérationnel", "Tableau de bord"])
    expect(labels("/deliveries")).toEqual(["Opérationnel", "Livraisons"])
    expect(labels("/codes-barres")).toEqual(["Stock", "Codes-barres"])
    expect(labels("/stock")).toEqual(["Stock", "Stock véhicules"])
    expect(labels("/cashier")).toEqual(["Opérationnel", "Caisse Tournées"])
    expect(labels("/articles")).toEqual(["Ventes", "Articles"])
    expect(labels("/articles/prix")).toEqual(["Ventes", "Prix"])
    expect(labels("/articles/referentiels")).toEqual(["Ventes", "Référentiels"])
  })

  it("relie une fiche article au catalogue", () => {
    expect(hops("/articles/PARA-001")).toEqual([
      { label: "Ventes", to: undefined },
      { label: "Articles", to: "/articles" },
      { label: "PARA-001", to: undefined },
    ])
  })

  it("garde le lien vers la liste sur une fiche détail", () => {
    expect(hops("/planning/routes/LIV-26-09-00001")).toEqual([
      { label: "Opérationnel", to: undefined },
      { label: "Planification", to: "/planning" },
      { label: "LIV-26-09-00001", to: undefined },
    ])
    expect(hops("/livreurs/i1m9bh99va")).toEqual([
      { label: "Ressources", to: undefined },
      { label: "Livreurs", to: "/livreurs" },
      { label: "i1m9bh99va", to: undefined },
    ])
    expect(hops("/cashier/LIV-1")).toEqual([
      { label: "Opérationnel", to: undefined },
      { label: "Caisse Tournées", to: "/cashier" },
      { label: "LIV-1", to: undefined },
    ])
    expect(hops("/caisses/i1m9bh99va")).toEqual([
      { label: "Opérationnel", to: undefined },
      { label: "Caisses livreurs", to: "/caisses" },
      { label: "i1m9bh99va", to: undefined },
    ])
    expect(hops("/commandes/nouvelle")).toEqual([
      { label: "Ventes", to: undefined },
      { label: "Commandes", to: "/commandes" },
      { label: "Nouvelle commande", to: undefined },
    ])
    expect(hops("/commandes/SAL-ORD-2026-00002")).toEqual([
      { label: "Ventes", to: undefined },
      { label: "Commandes", to: "/commandes" },
      { label: "SAL-ORD-2026-00002", to: undefined },
    ])
    expect(hops("/clients/CUST-2026-00012")).toEqual([
      { label: "Ventes", to: undefined },
      { label: "Clients", to: "/clients" },
      { label: "CUST-2026-00012", to: undefined },
    ])
    expect(hops("/receptions/MAT-PRE-2026-00001")).toEqual([
      { label: "Stock", to: undefined },
      { label: "Réceptions", to: "/receptions" },
      { label: "MAT-PRE-2026-00001", to: undefined },
    ])
    expect(hops("/preparation/commandes/SAL-ORD-1")).toEqual([
      { label: "Stock", to: undefined },
      { label: "Préparation", to: "/preparation" },
      { label: "SAL-ORD-1", to: undefined },
    ])
  })

  it("affiche l’id de la pick list ouverte", () => {
    expect(hops("/preparation", "?pick_lists=PL-1")).toEqual([
      { label: "Stock", to: undefined },
      { label: "Préparation", to: "/preparation" },
      { label: "PL-1", to: undefined },
    ])
    expect(labels("/preparation", "?pick_lists=PL-1,PL-2")).toEqual([
      "Stock",
      "Préparation",
      "PL-1, PL-2",
    ])
  })

  it("attache les icônes de catégorie et de page", () => {
    // Mêmes icônes de section que la barre latérale.
    const deliveries = crumbsFromPath("/deliveries")
    expect(deliveries[0].icon).toBe(navGroupIcons.operations)
    expect(deliveries[1].icon).toBe(Truck)
    const livreurs = crumbsFromPath("/livreurs/abc")
    expect(livreurs[0].icon).toBe(navGroupIcons.ressources)
    expect(livreurs[1].icon).toBe(UserRound)
    expect(livreurs[2].icon).toBeUndefined()
    expect(crumbsFromPath("/caisses")[0].icon).toBe(navGroupIcons.operations)
  })

  it("nomme les pages de pilotage", () => {
    expect(labels("/pilotage/tresorerie")).toEqual(["Pilotage", "Trésorerie"])
    expect(labels("/pilotage/objectifs")).toEqual(["Pilotage", "Objectifs"])
  })

  it("laisse un chemin hors nav sans catégorie", () => {
    expect(labels("/unknown")).toEqual(["unknown"])
  })
})
