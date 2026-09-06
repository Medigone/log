import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getStopVisualStyle } from "@/features/planning/stopStatus";
import { lateDeparture, plural } from "@/features/today/fleetProgress";
import { formatTime } from "@/shared/format";
import type { DistributionRoute } from "@/shared/types/distribution";

/** Chip rouge à côté du titre. Compte les arrêts en échec et les départs non confirmés. */
export function IncidentChip({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full border border-destructive/25 bg-destructive/10 px-2 text-xs font-semibold text-destructive hover:bg-destructive/15"
    >
      <span className="size-1.5 rounded-full bg-destructive" />
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
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-3.5",
        danger ? "border-destructive/25 bg-destructive/5" : "border-warning/30 bg-warning/5",
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("size-1.5 rounded-full", danger ? "bg-destructive" : "bg-amber-600")} />
        <span className={cn("text-sm font-semibold", danger ? "text-destructive" : "text-warning-foreground")}>
          {title}
        </span>
        <Badge variant="secondary" className="tabular-nums">
          {count}
        </Badge>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
      <button
        type="button"
        onClick={onAction}
        className={cn("w-fit text-xs font-medium hover:underline", danger ? "text-destructive" : "text-amber-700")}
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
  onFocusFailed: (routeName?: string) => void;
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
          body={`${lateRoutes[0].name} (${lateRoutes[0].driverName ?? lateRoutes[0].driver ?? "livreur non affecté"}) n’a pas confirmé son départ prévu à ${formatTime(lateRoutes[0].plannedStart)}.`}
          actionLabel="Voir ces tournées"
          onAction={() => onFocusLate(lateRoutes[0]?.name)}
        />
      )}
    </div>
  );
}
