import { wrapCarouselIndex } from "@/features/store/campaigns/CampaignBannerCarousel"
import { bannerCampaigns, campaignHref, railCampaignForGroup, visibleCampaigns } from "@/features/store/campaigns/campaignUtils"
import type { StorefrontCampaign, StorefrontPayload } from "@/shared/types"

const banner: StorefrontCampaign = {
  campaign: "CAMP-BANNER",
  placement: "Bandeau",
  title: "Promotion Biomil",
  cta: { type: "catalog", label: "Commander" },
  itemGroups: ["Nutrition"],
  itemCodes: ["ART-1"],
}

const rail: StorefrontCampaign = {
  campaign: "CAMP-RAIL",
  placement: "Rayon produits",
  title: "Promo rayon",
  cta: { type: "catalog", label: "Voir" },
  itemGroups: ["Nutrition"],
  itemCodes: ["ART-1"],
}

const payload: StorefrontPayload = {
  campaigns: [banner, rail],
  banners: [banner],
  categories: [],
  rails: [rail],
}

describe("campaignUtils", () => {
  it("déduit l’URL catalogue partageable", () => {
    expect(campaignHref(banner)).toBe("/?campaign=CAMP-BANNER")
    expect(campaignHref({ ...banner, cta: { type: "item", itemCode: "ART-1", label: "Voir" } })).toBe("/products/ART-1")
    expect(campaignHref({ ...banner, cta: { type: "group", itemGroup: "Nutrition", label: "Voir" } })).toBe("/?group=Nutrition")
  })

  it("sépare bandeau et rayon", () => {
    expect(bannerCampaigns(payload).map((item) => item.campaign)).toEqual(["CAMP-BANNER"])
    expect(visibleCampaigns(payload)).toHaveLength(2)
    expect(railCampaignForGroup(payload, "Nutrition", [])?.campaign).toBe("CAMP-RAIL")
    expect(railCampaignForGroup(payload, "Épicerie", [])).toBeNull()
  })
})

describe("carrousel bandeau", () => {
  it("boucle les index", () => {
    expect(wrapCarouselIndex(3, 3)).toBe(0)
    expect(wrapCarouselIndex(-1, 3)).toBe(2)
    expect(wrapCarouselIndex(0, 3)).toBe(0)
  })
})
