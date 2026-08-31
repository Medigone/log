import { useEffect, useRef, useState } from "react"
import { NavLink, useNavigate, useSearchParams } from "react-router-dom"
import { MapPinCheck } from "lucide-react"
import { EmptyState } from "@/components/LoadState"
import { Paginator } from "@/components/Paginator"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CampaignBannerCarousel } from "@/features/store/campaigns/CampaignBannerCarousel"
import { CampaignBannerSkeleton } from "@/features/store/campaigns/CampaignBanner"
import { CampaignCard } from "@/features/store/campaigns/CampaignCard"
import { CampaignRailCard } from "@/features/store/campaigns/CampaignRailCard"
import {
  bannerCampaigns,
  findCampaign,
  railCampaignForGroup,
  visibleCampaigns,
} from "@/features/store/campaigns/campaignUtils"
import { CatalogToolbar } from "@/features/store/CatalogToolbar"
import { CategoryChips } from "@/features/store/CategoryChips"
import { parseCatalogSort, type CatalogSort } from "@/features/store/catalogQuery"
import { catalogColumnCount, ProductGrid, ProductGridSkeleton } from "@/features/store/ProductGrid"
import { ReorderSection } from "@/features/store/ReorderSection"
import { useIsMobile } from "@/hooks/use-mobile"
import { HeaderSearch } from "@/layouts/HeaderSearch"
import { useCatalog, usePromotionEvents, useRecentOrderItems, useStorefront } from "@/shared/api"
import type { PortalContext } from "@/shared/types"

function scrollStorefrontToTop() {
  if (typeof window === "undefined") return
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const behavior: ScrollBehavior = reduce ? "auto" : "smooth"
  const catalogue = document.getElementById("catalogue")
  if (catalogue) {
    catalogue.scrollIntoView({ behavior, block: "start" })
    return
  }
  window.scrollTo({ top: 0, left: 0, behavior })
}

export function StorefrontPage({ context }: { context: PortalContext }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [columns, setColumns] = useState(() => (typeof window === "undefined" ? 2 : catalogColumnCount(window.innerWidth)))
  const search = params.get("q") || ""
  const group = params.get("group") || ""
  const view = params.get("view") || ""
  const campaignId = params.get("campaign") || ""
  const sort = parseCatalogSort(params.get("sort"))
  const offersOnly = params.get("offers") === "1"
  const showCatalog = view !== "offres"
  const storefront = useStorefront()
  const catalog = useCatalog(search, group, page, showCatalog, 20, sort, offersOnly, campaignId)
  const recent = useRecentOrderItems(showCatalog && !search && !campaignId)
  const events = usePromotionEvents()
  const isMobile = useIsMobile()
  const payload = storefront.data?.message
  const products = catalog.data?.message
  const tracked = useRef("")
  const scrolledPage = useRef<number | null>(null)
  const campaigns = visibleCampaigns(payload)
  const banners = bannerCampaigns(payload)
  const activeCampaign = findCampaign(payload, campaignId)
  const hasOffers = campaigns.length > 0
  const categories = payload?.categories?.length ? payload.categories : (products?.groups ?? []).map((name) => ({ name }))
  const recentItems = recent.data?.message?.items ?? []
  const rail =
    showCatalog && !campaignId && page === 1
      ? railCampaignForGroup(payload, group, products?.items ?? [])
      : null

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
  }, [search, group, sort, offersOnly, campaignId])

  useEffect(() => {
    if (!showCatalog) return
    if (scrolledPage.current === page) return
    if (scrolledPage.current === null) {
      if (catalog.isLoading) return
      scrolledPage.current = page
      return
    }
    scrolledPage.current = page
    scrollStorefrontToTop()
  }, [catalog.isLoading, page, showCatalog])

  useEffect(() => {
    const update = () => setColumns(catalogColumnCount(window.innerWidth))
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  useEffect(() => {
    if (!payload) return
    const key = campaigns.map((campaign) => campaign.campaign).filter(Boolean).join("|")
    if (!key || tracked.current === key) return
    tracked.current = key
    const seen = new Set<string>()
    for (const block of campaigns) {
      if (!block.campaign) continue
      const seenKey = `${block.campaign}:${block.placement}`
      if (seen.has(seenKey)) continue
      seen.add(seenKey)
      void events.track({ eventType: "view_promotion", campaign: block.campaign, placement: block.placement })
    }
  }, [campaigns, events, payload])

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

      {storefront.error && showCatalog ? (
        <Alert>
          <AlertTitle>Promotions indisponibles</AlertTitle>
          <AlertDescription>Le catalogue reste consultable. Réessayez plus tard.</AlertDescription>
        </Alert>
      ) : null}

      {view === "offres" && (
        <section id="offres" className="flex scroll-mt-20 flex-col gap-4">
          {storefront.isLoading && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <CampaignBannerSkeleton />
              <CampaignBannerSkeleton />
            </div>
          )}
          {storefront.error && !storefront.isLoading && (
            <EmptyState
              title="Impossible de charger les promotions"
              description="Veuillez réessayer dans un instant."
              action={
                <Button variant="outline" onClick={() => void storefront.mutate()}>
                  Réessayer
                </Button>
              }
            />
          )}
          {!storefront.isLoading && !storefront.error && campaigns.length === 0 && (
            <EmptyState title="Aucune offre" description="Les promotions du moment apparaîtront ici dès qu'elles seront disponibles." />
          )}
          {campaigns.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {campaigns.map((campaign) => (
                <CampaignCard
                  key={campaign.campaign || campaign.title}
                  campaign={campaign}
                  onSelect={() => void events.track({ eventType: "select_promotion", campaign: campaign.campaign, placement: campaign.placement })}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {showCatalog && (
        <section id="catalogue" className="flex min-w-0 scroll-mt-20 flex-col gap-4">
          {isMobile ? <HeaderSearch /> : null}
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
          {storefront.isLoading && banners.length === 0 && !campaignId ? <CampaignBannerSkeleton /> : null}
          {!campaignId && banners.length > 0 && (
            <CampaignBannerCarousel
              campaigns={banners}
              onSelect={(campaign) => void events.track({ eventType: "select_promotion", campaign: campaign.campaign, placement: campaign.placement })}
            />
          )}
          {campaignId ? (
            <div className="flex flex-col gap-2 rounded-xl border bg-muted/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{activeCampaign?.title || "Promotion"}</p>
                <p className="text-xs text-muted-foreground">Filtre promotionnel actif</p>
              </div>
              <Button variant="outline" className="min-h-11" onClick={() => patch({ campaign: null })}>
                Afficher tous les articles
              </Button>
            </div>
          ) : null}
          {showCatalog && !search && !campaignId && recentItems.length > 0 && <ReorderSection items={recentItems} />}
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
              {products.items.length > 0 && (
                <ProductGrid
                  items={products.items}
                  insert={
                    rail ? (
                      <CampaignRailCard
                        campaign={rail}
                        onSelect={() => void events.track({ eventType: "select_promotion", campaign: rail.campaign, placement: rail.placement })}
                      />
                    ) : null
                  }
                  insertAfter={rail ? (products.items.length <= columns ? 0 : columns) : undefined}
                />
              )}
              {products.items.length === 0 && rail && <CampaignRailCard campaign={rail} />}
              {products.items.length === 0 && (
                <EmptyState
                  title={
                    campaignId
                      ? "Aucun article dans cette promotion."
                      : search
                        ? "Aucun article ne correspond à votre recherche."
                        : group
                          ? "Aucun article disponible dans ce rayon."
                          : "Aucun article"
                  }
                  description={
                    campaignId
                      ? "Affichez tous les articles ou changez de filtre."
                      : search
                        ? "Essayez un autre mot-clé ou réinitialisez les filtres."
                        : group
                          ? "Changez de rayon ou réinitialisez les filtres."
                          : "Les articles apparaîtront ici dès qu'ils seront disponibles."
                  }
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      {campaignId ? (
                        <Button variant="outline" onClick={() => patch({ campaign: null })}>
                          Afficher tous les articles
                        </Button>
                      ) : null}
                      {search ? (
                        <Button variant="outline" onClick={() => patch({ q: null })}>
                          Effacer la recherche
                        </Button>
                      ) : null}
                      {search ? (
                        <Button render={<NavLink to={`/requests/new?q=${encodeURIComponent(search)}`} />} nativeButton={false}>
                          Demander cet article
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
