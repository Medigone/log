import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CampaignBanner } from "@/features/store/campaigns/CampaignBanner"
import { cn } from "@/lib/utils"
import type { StorefrontCampaign } from "@/shared/types"

export const BANNER_AUTOPLAY_MS = 5000

export function wrapCarouselIndex(index: number, count: number) {
  if (count <= 0) return 0
  return ((index % count) + count) % count
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function canHoverPause() {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches
}

export function CampaignBannerCarousel({
  campaigns,
  onSelect,
}: {
  campaigns: StorefrontCampaign[]
  onSelect?: (campaign: StorefrontCampaign) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const jumping = useRef(false)
  const indexRef = useRef(0)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(prefersReducedMotion)
  const [hovered, setHovered] = useState(false)
  const count = campaigns.length
  const first = campaigns[0]
  const last = campaigns[count - 1]
  const autoplay = count >= 2 && !paused && !hovered

  const commitIndex = useCallback((value: number) => {
    indexRef.current = value
    setIndex(value)
  }, [])

  const widthOf = useCallback(() => scroller.current?.clientWidth ?? 0, [])

  const scrollToPhysical = useCallback((physical: number) => {
    const node = scroller.current
    const width = widthOf()
    if (!node || width <= 0) return
    jumping.current = true
    node.scrollLeft = physical * width
    requestAnimationFrame(() => {
      jumping.current = false
    })
  }, [widthOf])

  const goBy = useCallback(
    (delta: number) => {
      if (count < 2) return
      const next = wrapCarouselIndex(indexRef.current + delta, count)
      commitIndex(next)
      scrollToPhysical(next + 1)
    },
    [commitIndex, count, scrollToPhysical],
  )

  const goTo = (logical: number) => {
    const wrapped = wrapCarouselIndex(logical, count)
    commitIndex(wrapped)
    scrollToPhysical(wrapped + 1)
  }

  const syncFromScroll = useCallback(() => {
    const node = scroller.current
    const width = widthOf()
    if (!node || jumping.current || count < 2 || width <= 0) return
    const physical = Math.round(node.scrollLeft / width)
    if (physical <= 0) {
      commitIndex(count - 1)
      scrollToPhysical(count)
      return
    }
    if (physical >= count + 1) {
      commitIndex(0)
      scrollToPhysical(1)
      return
    }
    commitIndex(physical - 1)
  }, [commitIndex, count, scrollToPhysical, widthOf])

  useEffect(() => {
    if (count < 2) return
    const node = scroller.current
    if (!node) return
    const showFirst = () => {
      if (widthOf() <= 0) return false
      scrollToPhysical(1)
      return true
    }
    if (showFirst()) return
    if (typeof ResizeObserver === "undefined") {
      const retry = window.setTimeout(() => {
        showFirst()
      }, 50)
      return () => window.clearTimeout(retry)
    }
    const observer = new ResizeObserver(() => {
      if (showFirst()) observer.disconnect()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [count, scrollToPhysical, widthOf])

  useEffect(() => {
    const node = scroller.current
    if (!node || count < 2) return
    node.addEventListener("scroll", syncFromScroll, { passive: true })
    const onResize = () => scrollToPhysical(indexRef.current + 1)
    window.addEventListener("resize", onResize)
    return () => {
      node.removeEventListener("scroll", syncFromScroll)
      window.removeEventListener("resize", onResize)
    }
  }, [count, scrollToPhysical, syncFromScroll])

  useEffect(() => {
    if (!autoplay) return
    const timer = window.setInterval(() => {
      if (document.hidden) return
      goBy(1)
    }, BANNER_AUTOPLAY_MS)
    return () => window.clearInterval(timer)
  }, [autoplay, goBy])

  if (count === 0 || !first) return null

  if (count === 1) {
    return <CampaignBanner campaign={first} onSelect={() => onSelect?.(first)} />
  }

  if (!last) return null

  const slides: Array<{ campaign: StorefrontCampaign; key: string }> = [
    { campaign: last, key: `${last.campaign || last.title}-clone-start` },
    ...campaigns.map((campaign) => ({ campaign, key: campaign.campaign || campaign.title })),
    { campaign: first, key: `${first.campaign || first.title}-clone-end` },
  ]

  return (
    <div
      className="flex min-w-0 flex-col gap-2"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse" && canHoverPause()) setHovered(true)
      }}
      onPointerLeave={() => setHovered(false)}
    >
      <div
        ref={scroller}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide) => (
          <div key={slide.key} className="w-full min-w-full shrink-0 snap-start">
            <CampaignBanner campaign={slide.campaign} onSelect={() => onSelect?.(slide.campaign)} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="hidden rounded-full md:inline-flex"
          aria-label="Promotion précédente"
          onClick={() => goBy(-1)}
        >
          <ChevronLeft />
        </Button>
        <div className="flex items-center gap-1.5">
          {campaigns.map((campaign, position) => (
            <button
              key={campaign.campaign || campaign.title}
              type="button"
              aria-label={`Promotion ${position + 1} sur ${count}`}
              aria-current={position === index ? "true" : undefined}
              className={cn("h-1.5 rounded-full transition-all", position === index ? "w-4 bg-foreground" : "w-1.5 bg-foreground/25")}
              onClick={() => goTo(position)}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="hidden rounded-full md:inline-flex"
          aria-label="Promotion suivante"
          onClick={() => goBy(1)}
        >
          <ChevronRight />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="rounded-full"
          aria-label={paused ? "Lire le carrousel" : "Mettre le carrousel en pause"}
          aria-pressed={paused}
          onClick={() => setPaused((current) => !current)}
        >
          {paused ? <Play /> : <Pause />}
        </Button>
      </div>
    </div>
  )
}
