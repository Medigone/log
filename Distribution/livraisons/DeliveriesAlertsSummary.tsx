import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getStopVisualStyle } from "@/features/planning/stopStatus";
import type { DistributionRoute } from "@/shared/types/distribution";
import { lateDeparture, plural } from "./DeliveriesKpis";

/** Red chip next to the page title. Counts failed stops + unconfirmed departures. */
export function IncidentChip({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-2 text-xs font-semibold text-red-700 hover:bg-red-100"
    >
      <span className="size-1.5 rounded-full bg-red-600" />
      {count} à traiter
    </button>
  );
}

function AlertCard({
  tone,
  title,
  count,
  body,
  actionLabel,
  onAction,
}: {
  tone: "danger" | "warning";
  title: string;
  count: number;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const danger = tone === "danger";
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-lg border p-3.5", danger ? "border-red-200 bg-red-50/40" : "border-amber-200 bg-amber-50/40")}>
      <div className="flex items-center gap-2">
        <span className={cn("size-1.5 rounded-full", danger ? "bg-red-600" : "bg-amber-600")} />
        <span className={cn("text-sm font-semibold", danger ? "text-red-900" : "text-amber-900")}>{title}</span>
        <Badge variant="secondary" className="tabular-nums">{count}</Badge>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
      <button
        type="button"
        onClick={onAction}
        className={cn("w-fit text-xs font-medium hover:underline", danger ? "text-red-700" : "text-amber-700")}
      >
        {actionLabel} →
      </button>
    </div>
  );
}

export function DeliveriesAlertsSummary({
  routes,
  onFocusFailed,
  onFocusLate,
}: {
  routes: DistributionRoute[];
  /** applyKpi("failed") + select/expand the route */
  onFocusFailed: (routeName?: string) => void;
  /** applyKpi("late") + select/expand the route */
  onFocusLate: (routeName?: string) => void;
}) {
  const failedRoutes = routes.filter((route) =>
    route.stops.some((stop) => getStopVisualStyle(stop.status).state === "failed"),
  );
  const failedStops = routes
    .flatMap((route) => route.stops)
    .filter((stop) => getStopVisualStyle(stop.status).state === "failed");
  const lateRoutes = routes.filter((route) => lateDeparture(route));

  if (failedStops.length === 0 && lateRoutes.length === 0) return null;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {failedStops.length > 0 && (
        <AlertCard
          tone="danger"
          title="Arrêts en échec"
          count={failedStops.length}
          body={`${plural(failedStops.length, "arrêt")} ${failedStops.length > 1 ? "non livrés" : "non livré"} sur ${failedRoutes[0]?.name ?? "—"} · marchandise encore à bord.`}
          actionLabel="Voir ces arrêts"
          onAction={() => onFocusFailed(failedRoutes[0]?.name)}
        />
      )}
      {lateRoutes.length > 0 && (
        <AlertCard
          tone="warning"
          title="Départ en retard"
          count={lateRoutes.length}
          body={`${lateRoutes[0].name} (${lateRoutes[0].driverName ?? lateRoutes[0].driver ?? "livreur non affecté"}) n’a pas confirmé son départ prévu à ${(lateRoutes[0].plannedStart ?? "").slice(11, 16) || "—"}.`}
          actionLabel="Voir ces tournées"
          onAction={() => onFocusLate(lateRoutes[0]?.name)}
        />
      )}
    </div>
  );
}
