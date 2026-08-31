import { NavLink } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { campaignHref } from "@/features/store/campaigns/campaignUtils"
import { cn } from "@/lib/utils"
import type { StorefrontCampaign } from "@/shared/types"

export function CampaignCTA({
  campaign,
  onSelect,
  fullWidth = false,
  className,
}: {
  campaign: StorefrontCampaign
  onSelect?: () => void
  fullWidth?: boolean
  className?: string
}) {
  return (
    <Button
      className={cn(
        "min-h-11 bg-foreground px-5 text-background hover:bg-foreground/90 md:min-h-8",
        fullWidth && "w-full",
        className,
      )}
      render={<NavLink to={campaignHref(campaign)} onClick={onSelect} />}
      nativeButton={false}
    >
      {campaign.cta.label}
    </Button>
  )
}
