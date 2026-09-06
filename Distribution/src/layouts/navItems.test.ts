import { describe, expect, it } from "vitest"
import { groupedNavItems, isNavItemActive, visibleNavItems } from "@/layouts/navItems"

describe("navItems", () => {
  it("retire les groupes vides selon le rôle", () => {
    expect(groupedNavItems("caissier").map((group) => group.group)).toEqual(["encaissement"])
    expect(groupedNavItems("preparateur").map((group) => group.group)).toEqual(["exploitation", "ressources"])
    expect(groupedNavItems("responsable").map((group) => group.group)).toEqual([
      "exploitation",
      "ressources",
      "encaissement",
    ])
  })

  it("filtre les pages selon le rôle", () => {
    expect(visibleNavItems("preparateur").map((item) => item.to)).toEqual(["/today", "/preparation", "/stock"])
    expect(visibleNavItems("caissier").map((item) => item.to)).toEqual(["/cashier", "/caisses"])
  })

  it("marque l’entrée active y compris sur une sous-page", () => {
    expect(isNavItemActive("/planning", "/planning")).toBe(true)
    expect(isNavItemActive("/planning/routes/LIV-1", "/planning")).toBe(true)
    expect(isNavItemActive("/today", "/planning")).toBe(false)
  })
})
