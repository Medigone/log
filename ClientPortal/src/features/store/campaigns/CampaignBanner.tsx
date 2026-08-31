import { CampaignCTA } from "@/features/store/campaigns/CampaignCTA"
import { CampaignDiscountBadge } from "@/features/store/campaigns/CampaignDiscountBadge"
import { CampaignItemImages } from "@/features/store/campaigns/CampaignItemImages"
import { CampaignValidity } from "@/features/store/campaigns/CampaignValidity"
import { campaignItems } from "@/features/store/campaigns/campaignUtils"
import { cn } from "@/lib/utils"
import type { StorefrontCampaign } from "@/shared/types"

export function CampaignBanner({
  campaign,
  onSelect,
}: {
  campaign: StorefrontCampaign
  onSelect?: () => void
}) {
  const hasImages = campaignItems(campaign).some((item) => Boolean(item.image))

  return (
    <article
      className={cn(
        "grid min-h-[160px] overflow-hidden rounded-xl border border-black/8 bg-background md:min-h-[168px]",
        hasImages ? "md:grid-cols-[minmax(0,1fr)_240px]" : "md:grid-cols-1",
      )}
    >
      <div className="flex min-w-0 flex-col justify-center gap-1.5 px-4 py-4 md:px-5 md:py-3">
        <CampaignDiscountBadge campaign={campaign} />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight text-foreground md:text-xl">{campaign.title}</h2>
          {campaign.body ? <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground md:line-clamp-1">{campaign.body}</p> : null}
        </div>
        <CampaignValidity campaign={campaign} />
        {hasImages ? (
          <div className="flex justify-center py-1 md:hidden">
            <CampaignItemImages campaign={campaign} />
          </div>
        ) : null}
        <div className="pt-1">
          <CampaignCTA campaign={campaign} onSelect={onSelect} fullWidth className="md:w-auto" />
        </div>
      </div>
      {hasImages ? (
        <div className="hidden items-center justify-center pr-4 md:flex">
          <CampaignItemImages campaign={campaign} />
        </div>
      ) : null}
    </article>
  )
}

export function CampaignBannerSkeleton() {
  return (
    <div
      className="min-h-[160px] animate-pulse rounded-xl border border-black/8 bg-background md:min-h-[168px]"
      aria-hidden
    />
  )
}
