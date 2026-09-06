import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { getStopVisualStyle } from "@/features/planning/stopStatus";
import { plural } from "@/features/today/fleetProgress";
import { formatTime } from "@/shared/format";
import type { DistributionRoute, RouteStop } from "@/shared/types/distribution";

const STATE_ICON = {
  delivered: { glyph: "✓", className: "border-emerald-600 bg-emerald-100 text-emerald-700" },
  failed: { glyph: "✕", className: "border-destructive bg-red-100 text-red-700" },
  pending: { glyph: "○", className: "border-border bg-background text-muted-foreground" },
} as const;

function stopState(stop: RouteStop) {
  const state = getStopVisualStyle(stop.status).state;
  return (state in STATE_ICON ? state : "pending") as keyof typeof STATE_ICON;
}

export function StopsSubTable({
  route,
  onOpenRoute,
  onReplanStop,
}: {
  route: DistributionRoute;
  onOpenRoute: (routeName: string) => void;
  onReplanStop?: (stop: RouteStop) => void;
}) {
  const stops = [...route.stops].sort((left, right) => left.sequence - right.sequence);
  const delivered = stops.filter((stop) => stopState(stop) === "delivered").length;
  const pending = stops.filter((stop) => stopState(stop) === "pending").length;
  const failed = stops.filter((stop) => stopState(stop) === "failed");

  return (
    <div className="flex flex-col gap-2 bg-muted/20 px-3 pb-3.5 pt-2.5 pl-[34px]">
      <div className="flex items-center gap-2">
        <span className="t-micro text-muted-foreground">Arrêts</span>
        <span className="text-xs text-muted-foreground/70">
          {plural(stops.length, "arrêt")} · {plural(delivered, "livré")} · {plural(pending, "restant")}
        </span>
        <button
          type="button"
          onClick={() => onOpenRoute(route.name)}
          className="ml-auto text-[11.5px] font-medium hover:underline"
        >
          Ouvrir la tournée →
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-background">
        <div className="grid grid-cols-[44px_minmax(0,1.3fr)_minmax(0,1fr)_118px_96px_76px] border-b bg-muted/40 px-2.5">
          {["N°", "Client · BL", "Lieu", "Statut", "Heure", "Carte"].map((header, index) => (
            <div key={header} className={cn("t-micro py-1.5 text-muted-foreground", index === 5 && "text-right")}>
              {header}
            </div>
          ))}
        </div>

        {stops.map((stop) => {
          const state = stopState(stop);
          const icon = STATE_ICON[state];
          const visual = getStopVisualStyle(stop.status);
          const mapsHref =
            stop.latitude != null && stop.longitude != null
              ? `https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`
              : undefined;
          return (
            <div
              key={stop.deliveryNote}
              className="grid grid-cols-[44px_minmax(0,1.3fr)_minmax(0,1fr)_118px_96px_76px] items-center border-b px-2.5 last:border-b-0"
            >
              <div className="py-2">
                <span
                  className={cn(
                    "grid size-[22px] place-items-center rounded-full border-[1.5px] text-[11px] font-bold",
                    icon.className,
                  )}
                  aria-label={stop.status}
                >
                  {icon.glyph}
                </span>
              </div>
              <div className="min-w-0 py-2 pr-2">
                <p className="truncate text-[12.5px]">{stop.customerName}</p>
                <p className="num truncate text-[11px] text-muted-foreground">{stop.deliveryNote}</p>
              </div>
              <div className="min-w-0 truncate py-2 pr-2 text-xs text-muted-foreground">
                {stop.commune || stop.address || "Adresse non renseignée"}
              </div>
              <div className="py-2 pr-2">
                <StatusBadge tone={visual.tone} size="sm">
                  {stop.status}
                </StatusBadge>
              </div>
              <div className="num whitespace-nowrap py-2 text-[11.5px] text-muted-foreground">
                {formatTime(stop.completedAt)}
              </div>
              <div className="py-2 text-right">
                {mapsHref ? (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="text-[11.5px] font-medium text-muted-foreground hover:underline"
                    aria-label={`Ouvrir la position de ${stop.customerName}`}
                  >
                    {state === "pending" ? "Itinéraire" : "Position"}
                  </a>
                ) : (
                  <span className="text-[11.5px] text-muted-foreground/50">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {failed.length > 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-2.5 py-2">
          <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
          <span className="min-w-0 text-xs text-destructive">
            {plural(failed.length, "arrêt")} en échec —{" "}
            {failed.length > 1 ? "les BL doivent" : "le BL doit"} être replanifié ou le retour contrôlé au dépôt.
          </span>
          {onReplanStop ? (
            <Button size="sm" className="ml-auto shrink-0" onClick={() => onReplanStop(failed[0])}>
              Replanifier le BL
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
