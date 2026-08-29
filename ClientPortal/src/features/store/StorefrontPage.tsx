import { useEffect, useRef, useState } from "react"
import { NavLink, useSearchParams } from "react-router-dom"
import { MapPinCheck } from "lucide-react"
import { ProductCard } from "@/features/store/ProductCard"
import { EmptyState, ErrorState, LoadingCards } from "@/components/LoadState"
import { Paginator } from "@/components/Paginator"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useCatalog, usePromotionEvents, useStorefront } from "@/shared/api"
import type { PortalContext, StorefrontCta, StorefrontHero } from "@/shared/types"

function ctaTo(cta: StorefrontCta) {
  if (cta.type === "item" && cta.itemCode) return `/products/${encodeURIComponent(cta.itemCode)}`
  if (cta.type === "group" && cta.itemGroup) return `/?group=${encodeURIComponent(cta.itemGroup)}`
  return "/"
}

export function StorefrontPage({ context }: { context: PortalContext }) {
  const [params] = useSearchParams()
  const [page, setPage] = useState(1)
  const search = params.get("q") || ""
  const group = params.get("group") || "all"
  const view = params.get("view") || ""
  const showCatalog = view !== "offres"
  const storefront = useStorefront()
  const catalog = useCatalog(search, group === "all" ? "" : group, page, showCatalog)
  const events = usePromotionEvents()
  const payload = storefront.data?.message
  const products = catalog.data?.message
  const tracked = useRef("")
  const showMerchandising = Boolean(payload && !search && group === "all" && view !== "catalog")
  const rails = payload?.rails ?? []
  const offerRails = view === "offres" ? rails.filter((rail) => rail.kind !== "group") : rails
  const hasOffers = Boolean(
    payload && (payload.banners.length > 0 || rails.some((rail) => rail.kind !== "group")),
  )

  useEffect(() => {
    setPage(1)
  }, [search, group])

  useEffect(() => {
    if (view === "catalog") document.getElementById("catalogue")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [view, payload])

  useEffect(() => {
    if (!payload) return
    const key = [...payload.banners.map((banner) => banner.campaign), ...payload.rails.map((rail) => rail.campaign)]
      .filter(Boolean)
      .join("|")
    if (!key || tracked.current === key) return
    tracked.current = key
    const campaigns = [...payload.banners, ...payload.rails]
    const seen = new Set<string>()
    for (const block of campaigns) {
      if (!block.campaign) continue
      const seenKey = `${block.campaign}:${block.placement}`
      if (seen.has(seenKey)) continue
      seen.add(seenKey)
      void events.track({ eventType: "view_promotion", campaign: block.campaign, placement: block.placement })
    }
  }, [payload, events])

  return (
    <>
      {!context.gpsConfigured && (
        <Alert>
          <MapPinCheck />
          <AlertTitle>Point de livraison à confirmer</AlertTitle>
          <AlertDescription>
            Enregistrez-le depuis <NavLink to="/account?tab=localisation">Mon compte</NavLink> ou lors de la commande.
          </AlertDescription>
        </Alert>
      )}

      {storefront.isLoading && <LoadingCards />}
      {storefront.error && <ErrorState error={storefront.error} />}
      {showMerchandising && payload && (
        <>
          {payload.banners.map((banner) => (
            <BannerBlock
              key={banner.campaign || banner.title}
              banner={banner}
              onSelect={() => void events.track({ eventType: "select_promotion", campaign: banner.campaign, placement: banner.placement })}
            />
          ))}
          <div id="offres" className="flex scroll-mt-20 flex-col gap-8">
            {offerRails.map((rail) => (
              <section key={`${rail.kind}-${rail.campaign || rail.title}`} className="flex flex-col gap-3">
                <div className="flex items-end justify-between gap-3">
                  <h2 className="text-lg font-semibold">{rail.title}</h2>
                  {rail.cta?.itemGroup && (
                    <Button variant="ghost" render={<NavLink to={ctaTo(rail.cta)} />} nativeButton={false}>
                      {rail.cta.label}
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {rail.items.map((item) => (
                    <ProductCard key={item.itemCode} item={item} size="sm" />
                  ))}
                </div>
              </section>
            ))}
            {view === "offres" && !hasOffers && !storefront.isLoading && (
              <EmptyState title="Aucune offre" description="Les promotions du moment apparaîtront ici dès qu'elles seront disponibles." />
            )}
          </div>
        </>
      )}

      {showCatalog && (
      <section id="catalogue" className="flex scroll-mt-20 flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-lg font-semibold">{group !== "all" ? `Catalogue · ${group}` : "Catalogue"}</h2>
          {group !== "all" && (
            <Button variant="ghost" render={<NavLink to="/?view=catalog" />} nativeButton={false}>
              Tous les groupes
            </Button>
          )}
        </div>
        {catalog.isLoading && <LoadingCards />}
        {catalog.error && <ErrorState error={catalog.error} />}
        {products && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {products.items.map((item) => (
                <ProductCard key={item.itemCode} item={item} />
              ))}
            </div>
            {products.items.length === 0 && (
              <EmptyState title="Aucun article" description="Aucun article ne correspond à votre recherche." />
            )}
            <Paginator page={products.page} hasNext={products.hasNext} onChange={setPage} />
          </>
        )}
      </section>
      )}
    </>
  )
}

function BannerBlock({ banner, onSelect }: { banner: StorefrontHero; onSelect: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          {banner.offerLabel && <Badge variant="destructive" className="w-fit">{banner.offerLabel}</Badge>}
          <p className="font-medium">{banner.title}</p>
          {banner.body && <p className="text-sm text-muted-foreground">{banner.body}</p>}
        </div>
        <Button variant="outline" render={<NavLink to={ctaTo(banner.cta)} onClick={onSelect} />} nativeButton={false}>
          {banner.cta.label}
        </Button>
      </CardContent>
    </Card>
  )
}
