import { AlertTriangle, Calendar, MapPin, Square, SquareCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatQuantity } from "@/shared/format";
import type { KanbanBLItem } from "./kanbanHelpers";

/**
 * Replaces the BLCard defined inline in PlanningKanban.tsx.
 * Key change: the "En retard" StatusBadge is gone — it repeated on nearly every card.
 * Lateness is now a red left accent + a red date; the Statut filter/table column carries the wording.
 */
export function BLCard({
  item,
  today,
  selectable,
  selected,
  onToggleSelect,
  locked,
  sequence,
  onReprogrammer,
  onUnassign,
}: {
  item: KanbanBLItem;
  today: string;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  locked?: boolean;
  /** Stop rank inside its route — only shown for assigned cards. */
  sequence?: number;
  onReprogrammer?: () => void;
  onUnassign?: () => void;
}) {
  const a = item.assignment;
  const late = !a.route && Boolean(a.requestedDate) && (a.requestedDate as string) < today;
  const alert = a.planningAlert || (a.requiresCustomerGeolocation ? "GPS client manquant" : "");

  return (
    <Card
      className={cn(
        "overflow-hidden border-l-[3px] text-xs shadow-none ring-0 transition-colors",
        late ? "border-l-destructive" : alert ? "border-l-amber-500" : "border-l-border",
        selected && "border-foreground bg-muted/40",
        locked && "opacity-80",
      )}
    >
      <CardContent className="flex items-start gap-2 p-2.5">
        {selectable && (
          <button
            type="button"
            onClick={onToggleSelect}
            onPointerDown={(event) => event.stopPropagation()}
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={selected ? "Désélectionner" : "Sélectionner"}
          >
            {selected ? <SquareCheck className="size-4 text-foreground" /> : <Square className="size-4" />}
          </button>
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-mono text-xs font-medium leading-tight" title={a.deliveryNote}>
              {a.deliveryNote}
            </p>
            {sequence != null && (
              <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground">#{sequence}</span>
            )}
          </div>

          <p className="truncate text-muted-foreground">{a.customerName}</p>

          {a.commune && (
            <p className="flex items-center gap-1 truncate text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              {a.commune}
              {a.wilaya ? `, ${a.wilaya}` : ""}
            </p>
          )}

          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            {a.requestedDate && (
              <span className={cn("flex items-center gap-1 whitespace-nowrap", late ? "text-destructive" : "text-muted-foreground")}>
                <Calendar className="size-3 shrink-0" />
                {a.requestedDate}
              </span>
            )}
            <span className="text-border">·</span>
            <span className="whitespace-nowrap text-muted-foreground">
              {formatQuantity(a.totalQuantity)} art.
            </span>
          </div>

          {alert && (
            <p className="flex items-center gap-1 text-[11px] text-amber-700">
              <AlertTriangle className="size-3 shrink-0" />
              {alert}
            </p>
          )}

          {(onReprogrammer || onUnassign) && (
            <div className="flex items-center gap-1 pt-0.5">
              {onReprogrammer && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-5 px-1.5 text-[11px] text-amber-700"
                  onClick={onReprogrammer}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  Reprogrammer
                </Button>
              )}
              {onUnassign && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-5 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={onUnassign}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  Retirer
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
