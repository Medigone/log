import { describe, expect, it } from "vitest"
import { canAccessCatalog, groupedNavItems, isNavItemActive, userCapabilities, visibleNavItems } from "@/layouts/navItems"

describe("navItems", () => {
  it("retire les groupes vides selon le rôle", () => {
    expect(groupedNavItems("caissier").map((group) => group.group)).toEqual(["operations"])
    expect(groupedNavItems("preparateur").map((group) => group.group)).toEqual(["operations", "stock"])
    expect(groupedNavItems("responsable").map((group) => group.group)).toEqual([
      "ventes",
      "operations",
      "stock",
      "ressources",
    ])
    expect(groupedNavItems("responsable")[0].items.map((item) => item.to)).toEqual([
      "/commandes/nouvelle",
      "/commandes",
      "/clients",
      "/articles",
      "/articles/prix",
      "/articles/promotions",
      "/articles/referentiels",
    ])
  })

  it("filtre les pages selon le rôle", () => {
    expect(visibleNavItems("preparateur").map((item) => item.to)).toEqual(["/today", "/preparation", "/stock", "/inventaires", "/codes-barres"])
    expect(groupedNavItems("responsable").find((group) => group.group === "stock")?.items.map((item) => item.to)).toEqual([
      "/preparation",
      "/stock",
      "/inventaires",
      "/codes-barres",
      "/receptions",
    ])
    expect(visibleNavItems("caissier").map((item) => item.to)).toEqual(["/cashier"])
    expect(groupedNavItems("commercial").map((group) => group.group)).toEqual(["ventes"])
    expect(visibleNavItems("commercial").map((item) => item.to)).toEqual(["/commandes/nouvelle", "/commandes", "/clients"])
    expect(groupedNavItems("magasinier").map((group) => group.group)).toEqual(["stock"])
    expect(visibleNavItems("magasinier").map((item) => item.to)).toEqual(["/inventaires", "/receptions"])
    expect(visibleNavItems("responsable").map((item) => item.to)).toContain("/receptions")
  })

  it("ouvre le catalogue au rôle dédié et aux rôles qui le cumulent", () => {
    const catalogPages = ["/articles", "/articles/prix", "/articles/promotions", "/articles/referentiels"]
    expect(visibleNavItems("catalogue").map((item) => item.to)).toEqual(catalogPages)
    expect(visibleNavItems("magasinier").map((item) => item.to)).toEqual(["/inventaires", "/receptions"])
    expect(visibleNavItems("magasinier", userCapabilities({ canManageCatalog: true })).map((item) => item.to)).toEqual([
      ...catalogPages,
      "/inventaires",
      "/receptions",
    ])
    expect(canAccessCatalog({ role: "commercial", canManageCatalog: false })).toBe(false)
    expect(canAccessCatalog({ role: "commercial", canManageCatalog: true })).toBe(true)
    expect(canAccessCatalog({ role: "responsable" })).toBe(true)
  })

  it("marque l’entrée active y compris sur une sous-page", () => {
    expect(isNavItemActive("/planning", "/planning")).toBe(true)
    expect(isNavItemActive("/planning/routes/LIV-1", "/planning")).toBe(true)
    expect(isNavItemActive("/today", "/planning")).toBe(false)
    expect(isNavItemActive("/commandes/nouvelle", "/commandes/nouvelle")).toBe(true)
    expect(isNavItemActive("/commandes/nouvelle", "/commandes")).toBe(false)
    expect(isNavItemActive("/commandes/SAL-ORD-1", "/commandes")).toBe(true)
    expect(isNavItemActive("/articles/PARA-001", "/articles")).toBe(true)
    expect(isNavItemActive("/articles/prix", "/articles")).toBe(false)
  })
})
