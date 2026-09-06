import { Check, X } from "lucide-react";
import type { RouteStop } from "@/shared/types/distribution";
import { CurrentStopCard } from "@/features/driver/CurrentStopCard";
import {
  estimateArrivals,
  formatDinars,
  routeProgress,
  stopVisualState,
  type StopVisualState,
} from "@/features/driver/driverMobile";
import { cn } from "@/lib/utils";

const MARKER_CLASS: Record<StopVisualState, string> = {
  delivered: "bg-emerald-500 text-white border-transparent",
  partial: "bg-emerald-50 text-emerald-700 border-emerald-500",
  failed: "bg-rose-50 text-rose-600 border-rose-500",
  current: "bg-foreground text-background border-transparent ring-4 ring-foreground/10",
  upcoming: "bg-background text-subtle border-border",
};

function HalfDisc({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-3.5", className)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
    </svg>
  );
}

function Marker({ state, index }: { state: StopVisualState; index: number }) {
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full border-[1.5px] font-semibold",
        state === "current" ? "size-8 text-[13px]" : "size-6.5 text-xs",
        MARKER_CLASS[state],
      )}
    >
      {state === "delivered" ? (
        <Check className="size-3.5" strokeWidth={2.5} />
      ) : state === "failed" ? (
        <X className="size-3.5" strokeWidth={2.25} />
      ) : state === "partial" ? (
        <HalfDisc />
      ) : (
        <span className="num">{index + 1}</span>
      )}
    </span>
  );
}

/**
 * Timeline verticale des arrêts. Les arrêts traités tiennent sur une ligne
 * (heure + montant), l'arrêt courant se développe en carte d'action.
 */
export function StopTimeline({
  stops,
  routeId,
  onOpenStop,
  showEta = false,
}: {
  stops: RouteStop[];
  routeId: string;
  onOpenStop: (deliveryNote: string) => void;
  showEta?: boolean;
}) {
  const { currentIndex } = routeProgress(stops);
  const etas = showEta ? estimateArrivals(stops) : null;

  return (
    <ol className="space-y-0">
      {stops.map((stop, index) => {
        const isCurrent = index === currentIndex;
        const state = stopVisualState(stop, isCurrent);
        const isDone = state === "delivered" || state === "partial" || state === "failed";
        return (
          <li key={stop.deliveryNote} className="flex gap-3">
            <div className="flex w-8 flex-col items-center">
              <Marker state={state} index={index} />
              {index < stops.length - 1 ? <span className="my-1 w-0.5 flex-1 bg-border" /> : null}
            </div>

            <div className={cn("min-w-0 flex-1", isCurrent ? "pb-3" : "pb-2.5")}>
              {isCurrent ? (
                <CurrentStopCard stop={stop} routeId={routeId} onOpen={onOpenStop} />
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenStop(stop.deliveryNote)}
                  className="w-full text-left"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm",
                        isDone ? "font-medium text-muted-foreground" : "text-[15px] font-semibold",
                      )}
                    >
                      {stop.customerName}
                    </span>
                    {state === "failed" ? (
                      <span className="whitespace-nowrap text-xs font-semibold text-rose-600">Non livré</span>
                    ) : isDone ? (
                      <span className="num whitespace-nowrap text-xs text-muted-foreground">
                        {formatDinars(stop.collectedAmount || 0, false)}
                      </span>
                    ) : etas?.get(stop.deliveryNote) ? (
                      <span className="num whitespace-nowrap text-xs text-muted-foreground">
                        ~{etas.get(stop.deliveryNote)}
                      </span>
                    ) : null}
                  </div>
                  <p className={cn("mt-0.5 truncate", isDone ? "t-meta text-subtle" : "text-xs text-subtle")}>
                    {isDone
                      ? [stop.completedAt?.slice(11, 16), stop.statusDetail || stop.status].filter(Boolean).join(" · ")
                      : [stop.commune, `${stop.totalQuantity} art.`, formatDinars(stop.totalAmount || 0, false)]
                          .filter(Boolean)
                          .join(" · ")}
                  </p>
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
