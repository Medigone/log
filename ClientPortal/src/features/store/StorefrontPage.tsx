import { useEffect, useRef, useState } from "react"
import { NavLink, useNavigate, useSearchParams } from "react-router-dom"
import { MapPinCheck } from "lucide-react"
import { EmptyState, ErrorState } from "@/components/LoadState"
import { Paginator } from "@/components/Paginator"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CatalogToolbar } from "@/features/store/CatalogToolbar"
import { CategoryChips } from "@/features/store/CategoryChips"
import { parseCatalogSort, type CatalogSort } from "@/features/store/catalogQuery"
import { ProductGrid, ProductGridSkeleton } from "@/features/store/ProductGrid"
import { ReorderSection } from "@/features/store/ReorderSection"
import { useCatalog, usePromotionEvents, useRecentOrderItems, useStorefront } from "@/shared/api"
import type { PortalContext, StorefrontCta, StorefrontHero } from "@/shared/types"

function ctaTo(cta: StorefrontCta) {
  if (cta.type === "item" && cta.itemCode) return `/products/${encodeURIComponent(cta.itemCode)}`
  if (cta.type === "group" && cta.itemGroup) return `/?group=${encodeURIComponent(cta.itemGroup)}`
  return "/"
}

export function StorefrontPage({ context }: { context: PortalContext }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const search = params.get("q") || ""
  const group = params.get("group") || ""
  const view = params.get("view") || ""
  const sort = parseCatalogSort(params.get("sort"))
  const offersOnly = params.get("offers") === "1"
  const showCatalog = view !== "offres"
  const storefront = useStorefront()
  const catalog = useCatalog(search, group, page, showCatalog, 20, sort, offersOnly)
  const recent = useRecentOrderItems(showCatalog && !search)
  const events = usePromotionEvents()
  const payload = storefront.data?.message
  const products = catalog.data?.message
  const tracked = useRef("")
  const showMerchandising = Boolean(payload && view === "offres")
  const rails = payload?.rails ?? []
  const offerRails = view === "offres" ? rails.filter((rail) => rail.kind !== "group") : rails
  const hasOffers = Boolean(payload && (payload.banners.length > 0 || rails.some((rail) => rail.kind !== "group")))
  const categories = payload?.categories?.length ? payload.categories : (products?.groups ?? []).map((name) => ({ name }))
  const recentItems = recent.data?.message?.items ?? []

  const patch = (update: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(update)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    const query = next.toString()
    navigate({ pathname: "/", search: query ? `?${query}` : "" })
  }

  useEffect(() => {
    setPage(1)
  }, [search, group, sort, offersOnly])

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
                <ProductGrid items={rail.items} />
              </section>
            ))}
            {view === "offres" && !hasOffers && !storefront.isLoading && (
              <EmptyState title="Aucune offre" description="Les promotions du moment apparaîtront ici dès qu'elles seront disponibles." />
            )}
          </div>
        </>
      )}

      {showCatalog && (
        <section id="catalogue" className="flex min-w-0 scroll-mt-20 flex-col gap-4">
          <CatalogToolbar
            total={products?.total}
            itemCount={products?.items.length ?? 0}
            hasNext={products?.hasNext ?? false}
            page={products?.page ?? page}
            loading={catalog.isLoading}
            groups={products?.groups ?? categories.map((category) => category.name)}
            group={group}
            sort={sort}
            offersOnly={offersOnly}
            hasOffers={hasOffers}
            onSortChange={(next: CatalogSort) => patch({ sort: next === "relevance" ? null : next, view: null })}
            onGroupChange={(next) => patch({ group: next || null, view: null })}
            onOffersChange={(next) => patch({ offers: next ? "1" : null, view: null })}
            onResetFilters={() => patch({ group: null, offers: null, sort: null, view: null })}
          />
          <CategoryChips groups={categories} active={group} loading={storefront.isLoading} params={params} />
          {showCatalog && !search && recentItems.length > 0 && <ReorderSection items={recentItems} />}
          {catalog.isLoading && <ProductGridSkeleton />}
          {catalog.error && (
            <EmptyState
              title="Impossible de charger le catalogue"
              description="Veuillez réessayer dans un instant."
              action={
                <Button variant="outline" onClick={() => void catalog.mutate()}>
                  Réessayer
                </Button>
              }
            />
          )}
          {products && !catalog.isLoading && (
            <>
              {products.items.length > 0 && <ProductGrid items={products.items} />}
              {products.items.length === 0 && (
                <EmptyState
                  title={search ? "Aucun article ne correspond à votre recherche." : group ? "Aucun article disponible dans ce rayon." : "Aucun article"}
                  description={search ? "Essayez un autre mot-clé ou réinitialisez les filtres." : group ? "Changez de rayon ou réinitialisez les filtres." : "Les articles apparaîtront ici dès qu'ils seront disponibles."}
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      {search ? (
                        <Button variant="outline" onClick={() => patch({ q: null })}>
                          Effacer la recherche
                        </Button>
                      ) : null}
                      {(group || offersOnly) && (
                        <Button variant="outline" onClick={() => patch({ group: null, offers: null, sort: null, view: null })}>
                          Réinitialiser les filtres
                        </Button>
                      )}
                    </div>
                  }
                />
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
