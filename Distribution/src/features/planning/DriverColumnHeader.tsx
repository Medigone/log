import { Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatQuantity } from "@/shared/format";
import type { PlanningResource } from "@/shared/types/distribution";
import { driverLoad, resourceCapacity, vehicleLabelFor, type KanbanBLItem } from "./kanbanHelpers";

export function DriverColumnHeader({
  driver,
  items,
  vehicles,
}: {
  driver: PlanningResource;
  items: KanbanBLItem[];
  vehicles: PlanningResource[];
}) {
  const capacity = resourceCapacity(driver, vehicles);
  const { blCount, articleCount, pct } = driverLoad(items, capacity);
  const vehicleLabel = vehicleLabelFor(driver.vehicle, vehicles);
  const empty = blCount === 0;

  return (
    <div className="flex flex-col gap-1.5 border-b px-3 py-2.5">
      <div className="flex items-center gap-2">
        <h3 className="truncate text-[10.5px] font-medium tracking-wider uppercase">{driver.label}</h3>
        <span
          className={cn(
            "num ml-auto whitespace-nowrap text-[11px]",
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

      {pct != null && (
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full", pct >= 90 ? "bg-destructive" : "bg-foreground")} style={{ width: `${pct}%` }} />
          </div>
          <span className="num whitespace-nowrap text-[10.5px] text-muted-foreground">{pct}&nbsp;%</span>
        </div>
      )}
    </div>
  );
}

export function NewRouteDropZoneBody({ dragging }: { dragging: boolean }) {
  return (
    <div className="flex min-h-[38px] items-center justify-center gap-1.5 text-[11.5px] font-medium">
      <span className="leading-none">+</span>
      {dragging ? "Déposer pour créer une tournée" : "Nouvelle tournée"}
    </div>
  );
}
