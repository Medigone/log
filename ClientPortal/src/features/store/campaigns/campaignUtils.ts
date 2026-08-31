import type { CatalogItem, StorefrontCampaign, StorefrontPayload } from "@/shared/types"

export const PLACEMENT_BANNER = "Bandeau"
export const PLACEMENT_RAIL = "Rayon produits"

export function campaignOfferLabel(campaign: StorefrontCampaign) {
  return campaign.offer?.label || campaign.offerLabel || null
}

export function campaignItems(campaign: StorefrontCampaign) {
  return campaign.items ?? []
}

export function campaignHref(campaign: StorefrontCampaign) {
  const cta = campaign.cta
  if (cta.type === "item" && cta.itemCode) return `/products/${encodeURIComponent(cta.itemCode)}`
  if (cta.type === "group" && cta.itemGroup) return `/?group=${encodeURIComponent(cta.itemGroup)}`
  if (campaign.campaign) return `/?campaign=${encodeURIComponent(campaign.campaign)}`
  return "/"
}

export function visibleCampaigns(payload: StorefrontPayload | null | undefined): StorefrontCampaign[] {
  if (!payload) return []
  if (payload.campaigns?.length) {
    const seen = new Set<string>()
    const unique: StorefrontCampaign[] = []
    for (const campaign of payload.campaigns) {
      const key = campaign.campaign || campaign.title
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(campaign)
    }
    return unique
  }
  const merged = [...payload.banners, ...payload.rails.filter((rail) => rail.kind !== "group")]
  const seen = new Set<string>()
  const unique: StorefrontCampaign[] = []
  for (const campaign of merged) {
    const key = campaign.campaign || campaign.title
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(campaign)
  }
  return unique
}

export function bannerCampaigns(payload: StorefrontPayload | null | undefined) {
  if (!payload) return []
  const fromCampaigns = (payload.campaigns ?? []).filter((campaign) => campaign.placement === PLACEMENT_BANNER)
  return (fromCampaigns.length ? fromCampaigns : payload.banners).slice(0, 3)
}

export function railCampaignForGroup(
  payload: StorefrontPayload | null | undefined,
  group: string,
  catalogItems: CatalogItem[],
) {
  if (!group || !payload) return null
  const fromCampaigns = (payload.campaigns ?? []).filter((campaign) => campaign.placement === PLACEMENT_RAIL)
  const source = fromCampaigns.length ? fromCampaigns : payload.rails.filter((rail) => rail.kind !== "group")
  return (
    source.find((campaign) => {
      const groups = campaign.itemGroups ?? []
      if (groups.length > 0 && !groups.includes(group)) return false
      if (groups.length === 0) return false
      const codes = new Set(campaign.itemCodes ?? [])
      if (codes.size === 0) return true
      if (catalogItems.length === 0) return true
      return catalogItems.some((item) => codes.has(item.itemCode))
    }) ?? null
  )
}

export function findCampaign(payload: StorefrontPayload | null | undefined, name: string) {
  if (!name) return null
  return visibleCampaigns(payload).find((campaign) => campaign.campaign === name) ?? null
}
