import { CampaignCTA } from "@/features/store/campaigns/CampaignCTA"
import { CampaignDiscountBadge } from "@/features/store/campaigns/CampaignDiscountBadge"
import { CampaignItemImages } from "@/features/store/campaigns/CampaignItemImages"
import { CampaignValidity } from "@/features/store/campaigns/CampaignValidity"
import { campaignItems } from "@/features/store/campaigns/campaignUtils"
import type { StorefrontCampaign } from "@/shared/types"

export function CampaignCard({
  campaign,
  onSelect,
}: {
  campaign: StorefrontCampaign
  onSelect?: () => void
}) {
  const hasImages = campaignItems(campaign).some((item) => Boolean(item.image))

  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <CampaignDiscountBadge campaign={campaign} />
          <h2 className="mt-2 text-base font-semibold text-foreground">{campaign.title}</h2>
        </div>
        {hasImages ? <CampaignItemImages campaign={campaign} size="card" /> : null}
      </div>
      {campaign.body ? <p className="line-clamp-3 text-sm text-muted-foreground">{campaign.body}</p> : null}
      <CampaignValidity campaign={campaign} />
      <div className="mt-auto pt-1">
        <CampaignCTA campaign={campaign} onSelect={onSelect} fullWidth />
      </div>
    </article>
  )
}
