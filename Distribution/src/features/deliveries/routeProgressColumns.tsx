import { ChevronDown } from "lucide-react";
import type { DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { getStopVisualStyle } from "@/features/planning/stopStatus";
import { fleetColor, lateDeparture, stopProgress } from "@/features/today/fleetProgress";
import { routeLifecycleTone } from "@/shared/design/statusTone";
import { formatTime } from "@/shared/format";
import type { DistributionRoute } from "@/shared/types/distribution";
import type { RouteEvent } from "@/features/deliveries/routeEvents";

const EVENT_TEXT = {
  danger: "text-destructive",
  warning: "text-amber-700",
  ok: "text-foreground",
  neutral: "text-muted-foreground",
} as const;

export function routeProgressColumns({
  routes,
  expanded,
  lastEvent,
}: {
  routes: DistributionRoute[];
  expanded: string;
  lastEvent?: (route: DistributionRoute) => RouteEvent | undefined;
}): Array<DataTableColumn<DistributionRoute>> {
  const columns: Array<DataTableColumn<DistributionRoute>> = [
    {
      id: "color",
      header: "",
      width: "22px",
      cell: (route) => (
        <span
          className="block size-2 shrink-0 rounded-full"
          style={{ background: fleetColor(routes.indexOf(route)) }}
        />
      ),
    },
    {
      id: "name",
      header: "Tournée · Livreur",
      sortValue: (route) => route.name,
      cell: (route) => (
        <div className="min-w-0">
          <p className="num truncate text-[12.5px] font-medium">{route.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {route.driverName || "Livreur non affecté"} · {route.vehicleLabel || "Véhicule non affecté"}
          </p>
        </div>
      ),
    },
    {
      id: "lifecycle",
      header: "État",
      width: "112px",
      sortValue: (route) => route.lifecycle,
      cell: (route) => (
        <StatusBadge tone={routeLifecycleTone(route.lifecycle)} size="sm">
          {route.lifecycle}
        </StatusBadge>
      ),
    },
    {
      id: "start",
      header: "Départ",
      width: "78px",
      sortValue: (route) => route.plannedStart ?? "",
      cell: (route) => {
        const late = lateDeparture(route);
        return (
          <span
            className={cn("num whitespace-nowrap text-xs", late ? "text-destructive" : "text-muted-foreground")}
            title={late ? "Départ prévu dépassé, non confirmé" : undefined}
          >
            {formatTime(route.plannedStart)}
          </span>
        );
      },
    },
    {
      id: "progress",
      header: "Avancement",
      width: "168px",
      sortValue: (route) => stopProgress(route).percent,
      cell: (route) => {
        const progress = stopProgress(route);
        const delivered = route.stops.filter((stop) => getStopVisualStyle(stop.status).state === "delivered").length;
        const failed = route.stops.filter((stop) => getStopVisualStyle(stop.status).state === "failed").length;
        const total = progress.total || 1;
        return (
          <div className="flex items-center gap-2">
            <div className="flex h-[5px] min-w-10 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="bg-foreground" style={{ width: `${(delivered / total) * 100}%` }} />
              <div className="bg-destructive" style={{ width: `${(failed / total) * 100}%` }} />
            </div>
            <span
              className={cn(
                "num shrink-0 whitespace-nowrap text-[11.5px]",
                delivered === progress.total && progress.total > 0
                  ? "text-emerald-700"
                  : delivered === 0
                    ? "text-muted-foreground"
                    : "text-foreground",
              )}
            >
              {delivered} / {progress.total}
            </span>
          </div>
        );
      },
    },
  ];

  if (lastEvent) {
    columns.push({
      id: "lastEvent",
      header: "Dernier événement",
      cell: (route) => {
        const event = lastEvent(route);
        if (!event) return <span className="text-muted-foreground/50">—</span>;
        return (
          <div className="min-w-0">
            <p className={cn("truncate text-xs", EVENT_TEXT[event.tone])}>{event.label}</p>
            {event.age ? <p className="num whitespace-nowrap text-[10.5px] text-muted-foreground">{event.age}</p> : null}
          </div>
        );
      },
    });
  }

  columns.push({
    id: "expand",
    header: "",
    width: "34px",
    align: "right",
    cell: (route) => (
      <ChevronDown
        className={cn("size-4 text-muted-foreground transition-transform", expanded === route.name && "rotate-180")}
      />
    ),
  });

  return columns;
}
