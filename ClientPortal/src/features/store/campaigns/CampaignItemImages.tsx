import { ProductImage } from "@/features/store/ProductImage"
import { campaignItems } from "@/features/store/campaigns/campaignUtils"
import { cn } from "@/lib/utils"
import type { StorefrontCampaign } from "@/shared/types"

export function CampaignItemImages({
  campaign,
  max = 2,
  size = "banner",
  className,
}: {
  campaign: StorefrontCampaign
  max?: number
  size?: "banner" | "card" | "rail"
  className?: string
}) {
  const items = campaignItems(campaign)
    .filter((item) => Boolean(item.image))
    .slice(0, max)
  if (items.length === 0) return null

  const frame =
    size === "rail"
      ? "h-16 w-14"
      : size === "card"
        ? "h-20 w-16"
        : "h-[132px] w-[108px] md:h-[140px] md:w-[116px]"

  return (
    <div
      className={cn(
        "relative flex items-center justify-center",
        size === "banner" && "min-h-[140px] w-full max-w-[240px]",
        size === "card" && "h-20 min-w-[4.5rem]",
        size === "rail" && "h-16 min-w-16",
        items.length === 1 && "justify-center",
        className,
      )}
      aria-hidden
    >
      {items.map((item, index) => (
        <div
          key={item.itemCode}
          className={cn(
            "overflow-hidden rounded-lg bg-transparent",
            frame,
            items.length > 1 && size === "banner" && index === 0 && "relative z-10 -rotate-3",
            items.length > 1 && size === "banner" && index === 1 && "relative z-20 -ml-8 mt-4 rotate-3",
            items.length > 1 && size !== "banner" && index === 1 && "-ml-3",
            items.length === 1 && "mx-auto",
          )}
        >
          <ProductImage src={item.image} alt="" compact className="size-full bg-transparent" />
        </div>
      ))}
    </div>
  )
}
