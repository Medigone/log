import { cn } from "@/lib/utils"
import { campaignOfferLabel } from "@/features/store/campaigns/campaignUtils"
import type { StorefrontCampaign } from "@/shared/types"

export function CampaignDiscountBadge({
  campaign,
  className,
}: {
  campaign: StorefrontCampaign
  className?: string
}) {
  const label = campaignOfferLabel(campaign)
  if (!label) return null
  return (
    <span
      className={cn(
        "inline-flex w-fit rounded-md bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800",
        className,
      )}
    >
      {label}
    </span>
  )
}
