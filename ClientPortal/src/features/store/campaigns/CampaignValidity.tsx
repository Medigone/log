import { Calendar } from "lucide-react"
import { formatCampaignUntil } from "@/shared/format"
import { cn } from "@/lib/utils"
import type { StorefrontCampaign } from "@/shared/types"

export function CampaignValidity({
  campaign,
  className,
}: {
  campaign: StorefrontCampaign
  className?: string
}) {
  const label = formatCampaignUntil(campaign.validUpto)
  if (!label && !campaign.expiringSoon) return null
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground", className)}>
      {label ? (
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="size-3.5 shrink-0" aria-hidden />
          {label}
        </span>
      ) : null}
      {campaign.expiringSoon ? <span className="font-medium text-orange-700">Expire bientôt</span> : null}
    </div>
  )
}
