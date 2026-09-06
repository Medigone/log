import { AlertTriangle, ArrowRight, Check, Circle, X } from "lucide-react";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline";
import { cn } from "@/lib/utils";
import { getStopVisualStyle } from "@/features/planning/stopStatus";
import { plural, stopProgress } from "@/features/today/fleetProgress";
import { routeLifecycleTone } from "@/shared/design/statusTone";
import { formatTime } from "@/shared/format";
import type { DistributionRoute } from "@/shared/types/distribution";
import type { RouteEvent } from "@/features/deliveries/routeEvents";

const EVENT_INDICATOR = {
  danger: "bg-destructive text-white",
  warning: "bg-amber-500 text-white",
  ok: "bg-emerald-500 text-white",
  neutral: "bg-muted-foreground text-white",
} as const;

const EVENT_ICON = {
  danger: X,
  warning: AlertTriangle,
  ok: Check,
  neutral: Circle,
} as const;

const EVENT_BADGE = {
  danger: { variant: "destructive-light" as const, label: "échec" },
  warning: { variant: "warning-light" as const, label: "partiel" },
  ok: { variant: "success-light" as const, label: "ok" },
  neutral: { variant: "secondary" as const, label: "info" },
};

function EventTimeline({ events }: { events: RouteEvent[] }) {
  const items = [...events].sort((left, right) => (left.at ?? 0) - (right.at ?? 0));
  if (!items.length) return null;

  return (
    <div className="flex w-full flex-col gap-2">
      <p className="t-micro text-muted-foreground">Événements</p>
      <Timeline defaultValue={items.length}>
        {items.map((event, index) => {
          const Icon = EVENT_ICON[event.tone];
          const badge = EVENT_BADGE[event.tone];
          return (
            <TimelineItem
              key={`${event.label}-${event.stamp ?? index}`}
              step={index + 1}
              className="group-data-[orientation=vertical]/timeline:ms-10"
            >
              <TimelineHeader>
                <TimelineSeparator className="bg-input! group-data-[orientation=vertical]/timeline:-left-7 group-data-[orientation=vertical]/timeline:h-[calc(100%-1.5rem-0.25rem)] group-data-[orientation=vertical]/timeline:translate-y-6.5" />
                <div className="flex min-w-0 items-center gap-2">
                  <TimelineTitle className="truncate text-sm">{event.label}</TimelineTitle>
                  <Badge variant={badge.variant} size="sm">
                    {badge.label}
                  </Badge>
                  {event.time ? (
                    <TimelineDate dateTime={event.stamp} className="mb-0 ml-auto shrink-0">
                      {event.time}
                    </TimelineDate>
                  ) : null}
                </div>
                <TimelineIndicator
                  className={cn(
                    "flex size-6 items-center justify-center border-none group-data-[orientation=vertical]/timeline:-left-7",
                    EVENT_INDICATOR[event.tone],
                  )}
                >
                  <Icon className="size-3.5" />
                </TimelineIndicator>
              </TimelineHeader>
              {event.age && event.age !== "à l’instant" ? <TimelineContent>{event.age}</TimelineContent> : null}
            </TimelineItem>
          );
        })}
      </Timeline>
    </div>
  );
}

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

        {events && events.length > 0 ? <EventTimeline events={events} /> : null}

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
