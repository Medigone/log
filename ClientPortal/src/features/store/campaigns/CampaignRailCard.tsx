import { CampaignCTA } from "@/features/store/campaigns/CampaignCTA"
import { CampaignDiscountBadge } from "@/features/store/campaigns/CampaignDiscountBadge"
import { CampaignItemImages } from "@/features/store/campaigns/CampaignItemImages"
import { CampaignValidity } from "@/features/store/campaigns/CampaignValidity"
import { campaignItems } from "@/features/store/campaigns/campaignUtils"
import type { StorefrontCampaign } from "@/shared/types"

export function CampaignRailCard({
  campaign,
  onSelect,
}: {
  campaign: StorefrontCampaign
  onSelect?: () => void
}) {
  const hasImages = campaignItems(campaign).some((item) => Boolean(item.image))

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-black/8 bg-[#FFF5F0] p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 sm:py-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {hasImages ? <CampaignItemImages campaign={campaign} size="rail" className="hidden sm:flex" /> : null}
        <div className="min-w-0 flex-1">
          <CampaignDiscountBadge campaign={campaign} />
          <h3 className="mt-1 text-sm font-semibold text-foreground">{campaign.title}</h3>
          {campaign.body ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{campaign.body}</p> : null}
          <CampaignValidity campaign={campaign} className="mt-1" />
        </div>
      </div>
      {hasImages ? (
        <div className="flex justify-center sm:hidden">
          <CampaignItemImages campaign={campaign} size="rail" />
        </div>
      ) : null}
      <CampaignCTA campaign={campaign} onSelect={onSelect} fullWidth className="sm:w-auto sm:min-w-32" />
    </article>
  )
}
