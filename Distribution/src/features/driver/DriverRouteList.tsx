import { Clock3, MapPin, Package, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { routeLifecycleTone } from "@/shared/design/statusTone";
import { formatTime } from "@/shared/format";
import { formatRouteDate, routeCardFromRoute } from "@/features/driver/routeCard";
import type { DistributionRoute, DriverRouteCard } from "@/shared/types/distribution";

type RouteListTab = "programmed" | "history";

function TodayRouteCard({
  route,
  onSelect,
}: {
  route: DistributionRoute;
  onSelect: (name: string) => void;
}) {
  const card = routeCardFromRoute(route);
  const stopsLabel = `${card.stopCount} arrêt${card.stopCount > 1 ? "s" : ""}`;
  const articlesLabel = `${card.totalArticles} article${card.totalArticles > 1 ? "s" : ""}`;
  const endLabel = formatTime(route.plannedEnd);
  return (
    <Card density="touch" className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight">{card.customerLabel}</h3>
          <p className="mt-1 t-meta text-muted-foreground">{card.locationLabel || "Commune non renseignée"}</p>
        </div>
        <StatusBadge tone={routeLifecycleTone(String(card.lifecycle))} size="sm">
          {card.lifecycle}
        </StatusBadge>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted px-2 py-2.5">
          <dt className="sr-only">Arrêts</dt>
          <dd className="num text-sm font-semibold">{stopsLabel}</dd>
        </div>
        <div className="rounded-xl bg-muted px-2 py-2.5">
          <dt className="sr-only">Articles</dt>
          <dd className="num text-sm font-semibold">{articlesLabel}</dd>
        </div>
        <div className="rounded-xl bg-muted px-2 py-2.5">
          <dt className="flex items-center justify-center gap-1 t-meta text-muted-foreground">
            <Clock3 className="size-3.5" />
            Fin
          </dt>
          <dd className="num text-sm font-semibold">{endLabel}</dd>
        </div>
      </dl>
      <Button
        size="touch"
        className="mt-4 w-full"
        onClick={() => onSelect(card.name)}
        aria-label={`Tournée ${card.name} · ${card.lifecycle} · ${card.customerLabel}`}
      >
        Ouvrir la tournée
      </Button>
    </Card>
  );
}

function RouteCardButton({
  card,
  onSelect,
  showDate = false,
}: {
  card: DriverRouteCard;
  onSelect: (name: string) => void;
  showDate?: boolean;
}) {
  const stopsLabel = `${card.stopCount} arrêt${card.stopCount > 1 ? "s" : ""}`;
  const articlesLabel = `${card.totalArticles} article${card.totalArticles > 1 ? "s" : ""}`;
  return (
    <button
      type="button"
      onClick={() => onSelect(card.name)}
      aria-label={`Tournée ${card.name} · ${card.lifecycle} · ${card.customerLabel}`}
      className="w-full text-left"
    >
      <Card density="touch" className="p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {showDate && card.date ? (
              <p className="t-micro text-brand-700">{formatRouteDate(card.date)}</p>
            ) : null}
            <h3 className="truncate text-base font-semibold tracking-tight">{card.customerLabel}</h3>
          </div>
          <StatusBadge tone={routeLifecycleTone(String(card.lifecycle))} size="sm">
            {card.lifecycle}
          </StatusBadge>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="size-4 shrink-0" />
            <span className="num">{stopsLabel}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Package className="size-4 shrink-0" />
            <span className="num">{articlesLabel}</span>
          </div>
        </dl>
        <p className="mt-3 t-meta text-muted-foreground">{card.locationLabel || "Commune non renseignée"}</p>
      </Card>
    </button>
  );
}

function EmptyRoutes({ title, description }: { title: string; description: string }) {
  return (
    <Card density="touch" className="p-8 text-center">
      <Route className="mx-auto size-9 text-subtle" />
      <h3 className="mt-3 t-section">{title}</h3>
      <p className="mt-2 t-body text-muted-foreground">{description}</p>
    </Card>
  );
}

function RouteListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Chargement des tournées">
      <Skeleton className="h-11 rounded-lg" />
      <Skeleton className="h-32 rounded-touch" />
      <Skeleton className="h-32 rounded-touch" />
    </div>
  );
}

export function DriverRouteList({
  programmed,
  history,
  loading,
  tab,
  onTabChange,
  onSelect,
}: {
  programmed: DistributionRoute[];
  history: DriverRouteCard[];
  loading: boolean;
  tab: RouteListTab;
  onTabChange: (tab: RouteListTab) => void;
  onSelect: (routeId: string) => void;
}) {
  if (loading && !programmed.length && !history.length) {
    return <RouteListSkeleton />;
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => onTabChange(value as RouteListTab)}
      aria-label="Tournées livreur"
    >
      <TabsList variant="segmented" className="grid w-full grid-cols-2">
        <TabsTrigger value="programmed" variant="segmented">
          Programmées
          <span className="num rounded-full bg-brand-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
            {programmed.length}
          </span>
        </TabsTrigger>
        <TabsTrigger value="history" variant="segmented">
          Historique
        </TabsTrigger>
      </TabsList>

      <TabsContent value="programmed" className="space-y-3 pt-4">
        {programmed.length ? (
          programmed.map((route) => <TodayRouteCard key={route.name} route={route} onSelect={onSelect} />)
        ) : (
          <EmptyRoutes
            title="Aucune tournée programmée"
            description="Les tournées publiées ou en cours apparaîtront ici."
          />
        )}
      </TabsContent>

      <TabsContent value="history" className="space-y-3 pt-4">
        {history.length ? (
          history.map((card) => <RouteCardButton key={card.name} card={card} onSelect={onSelect} showDate />)
        ) : (
          <EmptyRoutes
            title="Aucun historique"
            description="Les tournées terminées des 30 derniers jours apparaîtront ici."
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
