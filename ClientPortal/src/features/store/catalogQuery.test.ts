import { catalogCountLabel, offerCount, parseCatalogSort } from "@/features/store/catalogQuery"
import { isStoreNavActive, mobileHeaderTitle, productBackTo, productDetailsTo } from "@/layouts/storeNav"

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
  it("active l'accueil pour un rayon, une recherche ou une fiche produit", () => {
    expect(isStoreNavActive("home", "/", "")).toBe(true)
    expect(isStoreNavActive("home", "/", "?view=catalog")).toBe(true)
    expect(isStoreNavActive("home", "/", "?group=Boissons")).toBe(true)
    expect(isStoreNavActive("home", "/", "?q=lait")).toBe(true)
    expect(isStoreNavActive("home", "/products/ART-1", "")).toBe(true)
    expect(isStoreNavActive("home", "/", "?view=offres")).toBe(false)
    expect(isStoreNavActive("home", "/products/ART-1", "?view=offres")).toBe(false)
  })

  it("active les promotions sur la vue offres et les fiches liées", () => {
    expect(isStoreNavActive("offres", "/", "?view=offres")).toBe(true)
    expect(isStoreNavActive("offres", "/products/ART-1", "?view=offres")).toBe(true)
    expect(isStoreNavActive("offres", "/", "?offers=1")).toBe(false)
    expect(isStoreNavActive("offres", "/products/ART-1", "")).toBe(false)
  })

  it("active le panier pendant la commande", () => {
    expect(isStoreNavActive("cart", "/cart", "")).toBe(true)
    expect(isStoreNavActive("cart", "/cart/", "")).toBe(true)
    expect(isStoreNavActive("cart", "/orders/SAL-1", "")).toBe(false)
  })

  it("active le compte sur le profil, les commandes, les BL et les paiements", () => {
    expect(isStoreNavActive("account", "/account", "")).toBe(true)
    expect(isStoreNavActive("account", "/account", "?tab=profile")).toBe(true)
    expect(isStoreNavActive("account", "/orders", "")).toBe(true)
    expect(isStoreNavActive("account", "/orders/SAL-1", "")).toBe(true)
    expect(isStoreNavActive("account", "/deliveries", "")).toBe(true)
    expect(isStoreNavActive("account", "/deliveries/DN-1", "")).toBe(true)
    expect(isStoreNavActive("account", "/payments", "")).toBe(true)
    expect(isStoreNavActive("account", "/", "")).toBe(false)
    expect(isStoreNavActive("orders", "/orders", "")).toBe(true)
    expect(isStoreNavActive("deliveries", "/deliveries/DN-1", "")).toBe(true)
    expect(isStoreNavActive("payments", "/payments", "")).toBe(true)
  })

  it("conserve le contexte promotion dans les liens produit", () => {
    expect(productDetailsTo("ART-1", "?view=offres")).toBe("/products/ART-1?view=offres")
    expect(productDetailsTo("ART-1", "")).toBe("/products/ART-1")
    expect(productBackTo("?view=offres")).toBe("/?view=offres")
    expect(productBackTo("")).toBe("/")
  })

  it("titre l’en-tête mobile selon la route", () => {
    expect(mobileHeaderTitle("/", "")).toBe("Boutique")
    expect(mobileHeaderTitle("/", "?view=offres")).toBe("Promotions")
    expect(mobileHeaderTitle("/cart", "")).toBe("Panier")
    expect(mobileHeaderTitle("/account", "")).toBe("Compte")
    expect(mobileHeaderTitle("/account", "?tab=profile")).toBe("Mon compte")
    expect(mobileHeaderTitle("/orders/SAL-1", "")).toBe("Mes commandes")
  })
})
