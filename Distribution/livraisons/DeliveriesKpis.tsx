import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getStopVisualStyle } from "@/features/planning/stopStatus";
import { isLiveRoute, stopProgress } from "@/features/today/fleetProgress";
import type { DistributionRoute, RouteLifecycle } from "@/shared/types/distribution";

const LIFECYCLE_DOT: Record<string, string> = {
  "Publiée": "bg-blue-500",
  "En cours": "bg-emerald-600",
  "Retour dépôt": "bg-amber-500",
  "Terminée": "bg-muted-foreground/40",
};

const LIFECYCLE_ORDER: RouteLifecycle[] = ["Publiée", "En cours", "Retour dépôt", "Terminée"];

/** Suggested home: features/today/fleetProgress.ts */
export function routeStopCounts(routes: DistributionRoute[]) {
  const stops = routes.flatMap((route) => route.stops);
  const state = (status: string) => getStopVisualStyle(status).state;
  return {
    total: stops.length,
    delivered: stops.filter((stop) => state(stop.status) === "delivered").length,
    failed: stops.filter((stop) => state(stop.status) === "failed").length,
    pending: stops.filter((stop) => state(stop.status) === "pending").length,
  };
}

/**
 * A published route whose planned start is in the past and that has no field event yet.
 * Needs a real "departure confirmed" flag from the API — see README (données manquantes).
 */
export function lateDeparture(route: DistributionRoute, now = new Date()) {
  if (route.lifecycle !== "Publiée" || !route.plannedStart) return false;
  return new Date(route.plannedStart).getTime() < now.getTime();
}

/** French agreement helper — the mock shipped with "1 arrêts" before this existed. */
export function plural(count: number, singular: string, pluralForm?: string) {
  return `${count} ${count > 1 ? pluralForm ?? `${singular}s` : singular}`;
}

function Tile({
  label,
  badge,
  value,
  unit,
  valueTone,
  children,
  onClick,
}: {
  label: string;
  badge?: { text: string; tone: "danger" | "success" | "neutral" };
  value: string;
  unit: string;
  valueTone?: "danger";
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Card
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      className={cn("shadow-none", onClick && "cursor-pointer transition-shadow hover:border-muted-foreground/30 hover:shadow-sm")}
    >
      <CardContent className="flex flex-col gap-2.5 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="t-micro whitespace-nowrap text-muted-foreground">{label}</span>
          {badge && (
            <span
              className={cn(
                "whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium",
                badge.tone === "danger" && "bg-red-50 text-red-700",
                badge.tone === "success" && "bg-emerald-50 text-emerald-700",
                badge.tone === "neutral" && "bg-muted text-muted-foreground",
              )}
            >
              {badge.text}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "whitespace-nowrap text-[30px] font-semibold leading-none tracking-tight tabular-nums",
              valueTone === "danger" && "text-destructive",
            )}
          >
            {value}
          </span>
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Bar({ pct, tone }: { pct: number; tone: "foreground" | "success" | "danger" }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full",
          tone === "success" && "bg-emerald-600",
          tone === "danger" && "bg-destructive",
          tone === "foreground" && "bg-foreground",
        )}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

export type KpiFocus = "all" | "live" | "delivered" | "failed" | "late";

export function DeliveriesKpis({
  routes,
  isLoading,
  onFocus,
}: {
  routes: DistributionRoute[];
  isLoading?: boolean;
  onFocus: (focus: KpiFocus) => void;
}) {
  const counts = routeStopCounts(routes);
  const liveRoutes = routes.filter(isLiveRoute);
  const lateRoutes = routes.filter((route) => lateDeparture(route));
  const liveRemaining = liveRoutes.reduce(
    (sum, route) => sum + (stopProgress(route).total - stopProgress(route).done),
    0,
  );
  const donePct = counts.total ? Math.round((counts.delivered / counts.total) * 100) : 0;
  const dash = isLoading ? "—" : null;

  const byLifecycle = LIFECYCLE_ORDER.map((lifecycle) => ({
    lifecycle,
    count: routes.filter((route) => route.lifecycle === lifecycle).length,
  })).filter((entry) => entry.count > 0);

  return (
    <section aria-label="Indicateurs du jour" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        label="Tournées du jour"
        value={dash ?? String(routes.length)}
        unit={
          routes.length
            ? `${liveRoutes.length} en cours · ${lateRoutes.length} ${lateRoutes.length > 1 ? "non parties" : "non partie"}`
            : "aucune tournée publiée"
        }
        onClick={() => onFocus("all")}
      >
        <div className="flex h-1 gap-0.5">
          {byLifecycle.map((entry) => (
            <div
              key={entry.lifecycle}
              className={cn("rounded-full", LIFECYCLE_DOT[entry.lifecycle])}
              style={{ flex: entry.count }}
            />
          ))}
        </div>
      </Tile>

      <Tile
        label="Sur le terrain"
        badge={{ text: "live", tone: "success" }}
        value={dash ?? String(liveRoutes.length)}
        unit={`${liveRoutes.length > 1 ? "véhicules" : "véhicule"} · ${plural(liveRemaining, "arrêt")} restant${liveRemaining > 1 ? "s" : ""}`}
        onClick={() => onFocus("live")}
      >
        <Bar pct={routes.length ? (liveRoutes.length / routes.length) * 100 : 0} tone="success" />
      </Tile>

      <Tile
        label="Arrêts livrés"
        badge={{ text: `${donePct}\u00a0%`, tone: "neutral" }}
        value={dash ?? String(counts.delivered)}
        unit={`sur ${counts.total} arrêts planifiés`}
        onClick={() => onFocus("delivered")}
      >
        <Bar pct={donePct} tone="foreground" />
      </Tile>

      <Tile
        label="Échecs"
        badge={{ text: counts.failed ? "à traiter" : "RAS", tone: counts.failed ? "danger" : "neutral" }}
        value={dash ?? String(counts.failed)}
        valueTone={counts.failed ? "danger" : undefined}
        unit={counts.failed ? `${counts.failed > 1 ? "arrêts" : "arrêt"} · ${counts.failed} BL à replanifier` : "arrêt en échec"}
        onClick={() => onFocus("failed")}
      >
        <Bar pct={counts.total ? (counts.failed / counts.total) * 100 : 0} tone="danger" />
      </Tile>
    </section>
  );
}
