import { catalogCountLabel, offerCount, parseCatalogSort } from "@/features/store/catalogQuery"
import { isStoreNavActive, storeNav } from "@/layouts/storeNav"

describe("catalogue", () => {
  it("forme le compteur d’articles", () => {
    expect(catalogCountLabel(0, 0, false, 1)).toBe("0 article disponible")
    expect(catalogCountLabel(1, 1, false, 1)).toBe("1 article disponible")
    expect(catalogCountLabel(128, 12, true, 1)).toBe("128 articles disponibles")
    expect(catalogCountLabel(undefined, 12, true, 1)).toBeNull()
    expect(catalogCountLabel(undefined, 4, false, 1)).toBe("4 articles disponibles")
  })

  it("compte les offres réelles sans doublon", () => {
    expect(
      offerCount({
        banners: [{ campaign: "CAMP-1" }],
        rails: [
          { kind: "campaign", campaign: "CAMP-1" },
          { kind: "group", campaign: null },
          { kind: "campaign", campaign: "CAMP-2" },
        ],
      }),
    ).toBe(2)
  })

  it("ignore un tri inconnu", () => {
    expect(parseCatalogSort("price_asc")).toBe("relevance")
    expect(parseCatalogSort("name_desc")).toBe("name_desc")
  })
})

describe("navigation portail", () => {
  const byMatch = Object.fromEntries(storeNav.map((item) => [item.match, item]))

  it("active l'accueil pour un rayon ou une recherche", () => {
    expect(isStoreNavActive(byMatch.home, "/", "")).toBe(true)
    expect(isStoreNavActive(byMatch.home, "/", "?view=catalog")).toBe(true)
    expect(isStoreNavActive(byMatch.home, "/", "?group=Boissons")).toBe(true)
    expect(isStoreNavActive(byMatch.home, "/products/ART-1", "")).toBe(true)
    expect(isStoreNavActive(byMatch.home, "/", "?view=offres")).toBe(false)
    expect(isStoreNavActive(byMatch.offres, "/", "?view=offres")).toBe(true)
    expect(isStoreNavActive(byMatch.orders, "/orders", "")).toBe(true)
    expect(isStoreNavActive(byMatch.deliveries, "/deliveries/DN-1", "")).toBe(true)
    expect(isStoreNavActive(byMatch.payments, "/payments", "")).toBe(true)
  })
})
