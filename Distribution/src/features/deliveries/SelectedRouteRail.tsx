import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { getStopVisualStyle } from "@/features/planning/stopStatus";
import { plural, stopProgress } from "@/features/today/fleetProgress";
import { routeLifecycleTone } from "@/shared/design/statusTone";
import { formatTime } from "@/shared/format";
import type { DistributionRoute } from "@/shared/types/distribution";
import type { RouteEvent } from "@/features/deliveries/routeEvents";

const EVENT_DOT = {
  danger: "bg-destructive",
  warning: "bg-amber-500",
  ok: "bg-emerald-600",
  neutral: "bg-muted-foreground/40",
} as const;

export function SelectedRouteRail({
  route,
  events,
  eta,
  onOpenRoute,
  onCall,
  onTracking,
}: {
  route?: DistributionRoute;
  events?: RouteEvent[];
  eta?: string;
  onOpenRoute: (routeName: string) => void;
  onCall?: () => void;
  onTracking?: () => void;
}) {
  if (!route) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tournée sélectionnée</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="rounded-md border bg-muted/40 p-3 text-[12.5px] leading-relaxed text-muted-foreground">
            Sélectionnez une tournée dans le tableau.
          </p>
        </CardContent>
      </Card>
    );
  }

  const progress = stopProgress(route);
  const delivered = route.stops.filter((stop) => getStopVisualStyle(stop.status).state === "delivered").length;
  const failed = route.stops.filter((stop) => getStopVisualStyle(stop.status).state === "failed").length;
  const remaining = route.stops.filter((stop) => getStopVisualStyle(stop.status).state === "pending").length;
  const total = progress.total || 1;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="num text-sm">{route.name}</CardTitle>
        <StatusBadge tone={routeLifecycleTone(route.lifecycle)} size="sm">
          {route.lifecycle}
        </StatusBadge>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <div>
          <p className="text-[12.5px] text-muted-foreground">{route.driverName || "Livreur non affecté"}</p>
          <p className="text-[11.5px] text-muted-foreground/70">
            {route.vehicleLabel || "Véhicule non affecté"} · départ {formatTime(route.plannedStart)}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="num whitespace-nowrap text-[22px] font-semibold leading-none tracking-tight">
              {delivered} / {progress.total}
            </span>
            <span className="text-xs text-muted-foreground">arrêts livrés · {progress.percent}&nbsp;%</span>
          </div>
          <div className="flex h-[5px] overflow-hidden rounded-full bg-muted">
            <div className="bg-foreground" style={{ width: `${(delivered / total) * 100}%` }} />
            <div className="bg-destructive" style={{ width: `${(failed / total) * 100}%` }} />
          </div>
          <div className="flex items-center gap-3 text-[11.5px] text-muted-foreground">
            <span className="whitespace-nowrap">Reste {plural(remaining, "arrêt")}</span>
            {eta ? (
              <>
                <span className="text-border">·</span>
                <span className="whitespace-nowrap">Fin estimée {eta}</span>
              </>
            ) : null}
          </div>
        </div>

        {events && events.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="t-micro text-muted-foreground">Derniers événements</p>
            {events.slice(0, 3).map((event, index) => (
              <div key={`${event.label}-${index}`} className="flex items-start gap-2">
                <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", EVENT_DOT[event.tone])} />
                <div className="min-w-0">
                  <p className="truncate text-xs">{event.label}</p>
                  {event.age ? <p className="num text-[10.5px] text-muted-foreground">{event.age}</p> : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button className="w-full" onClick={() => onOpenRoute(route.name)}>
            Ouvrir la tournée
            <ArrowRight />
          </Button>
          {onCall || onTracking ? (
            <div className="flex gap-2">
              {onCall ? (
                <Button variant="outline" size="sm" className="flex-1" onClick={onCall}>
                  Appeler
                </Button>
              ) : null}
              {onTracking ? (
                <Button variant="outline" size="sm" className="flex-1" onClick={onTracking}>
                  Suivi client
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
