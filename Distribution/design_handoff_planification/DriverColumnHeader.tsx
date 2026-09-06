import { Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatQuantity } from "@/shared/format";
import type { PlanningResource } from "@/shared/types/distribution";
import { vehicleLabelFor, type KanbanBLItem } from "./kanbanHelpers";

/**
 * Articles a vehicle is assumed to carry in one tour.
 * NOT exposed by the API today — confirm, or render the load without the bar.
 * Suggested home: kanbanHelpers.ts, next to columnLoad().
 */
export const CAPACITY_ARTICLES = 40;

export function driverLoad(items: KanbanBLItem[], capacity = CAPACITY_ARTICLES) {
  const articleCount = items.reduce(
    (sum, item) => sum + (Number(item.assignment.totalQuantity) || 0),
    0,
  );
  return {
    blCount: items.length,
    articleCount,
    pct: capacity ? Math.min(100, Math.round((articleCount / capacity) * 100)) : 0,
  };
}

/**
 * Column header for one driver. Replaces the current header, which showed
 * "0 BL · 0 art." with no reference point — nothing about whether the day fits.
 */
export function DriverColumnHeader({
  driver,
  items,
  vehicles,
  capacity = CAPACITY_ARTICLES,
  showCapacity = true,
}: {
  driver: PlanningResource;
  items: KanbanBLItem[];
  vehicles: PlanningResource[];
  capacity?: number;
  showCapacity?: boolean;
}) {
  const { blCount, articleCount, pct } = driverLoad(items, capacity);
  const vehicleLabel = vehicleLabelFor(driver.vehicle, vehicles);
  const empty = blCount === 0;

  return (
    <div className="flex flex-col gap-1.5 border-b px-3 py-2.5">
      <div className="flex items-center gap-2">
        <h3 className="truncate font-mono text-[10.5px] font-medium uppercase tracking-wider">
          {driver.label}
        </h3>
        <span
          className={cn(
            "ml-auto whitespace-nowrap font-mono text-[11px] tabular-nums",
            empty ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {blCount} BL · {formatQuantity(articleCount)} art.
        </span>
      </div>

      {vehicleLabel && (
        <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          <Truck className="size-3 shrink-0" /> {vehicleLabel}
        </p>
      )}

      {showCapacity && (
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full", pct >= 90 ? "bg-destructive" : "bg-foreground")}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="whitespace-nowrap font-mono text-[10.5px] tabular-nums text-muted-foreground">
            {pct}&nbsp;%
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Compact drop zone. The current one is ~100px tall with a two-line label and
 * dominates every empty column; it becomes a single 38px row.
 */
export function NewRouteDropZoneBody({ dragging }: { dragging: boolean }) {
  return (
    <div className="flex min-h-[38px] items-center justify-center gap-1.5 text-[11.5px] font-medium">
      <span className="leading-none">+</span>
      {dragging ? "Déposer pour créer une tournée" : "Nouvelle tournée"}
    </div>
  );
}
