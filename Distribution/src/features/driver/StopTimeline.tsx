import { Check, X } from "lucide-react";
import type { RouteStop } from "@/shared/types/distribution";
import {
  formatDriverMoney,
  stopTimelineDetail,
  stopVisualState,
  type StopVisualState,
} from "@/features/driver/driverMobile";
import { completedStops } from "@/features/driver/stopHelpers";
import { cn } from "@/lib/utils";

const MARKER_CLASS: Record<Extract<StopVisualState, "delivered" | "partial" | "failed">, string> = {
  delivered: "bg-emerald-500 text-white border-transparent",
  partial: "bg-emerald-50 text-emerald-700 border-emerald-500",
  failed: "bg-rose-50 text-rose-600 border-rose-500",
};

function HalfDisc({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-3.5", className)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
    </svg>
  );
}

function Marker({ state }: { state: Extract<StopVisualState, "delivered" | "partial" | "failed"> }) {
  return (
    <span
      className={cn(
        "flex size-[1.625rem] items-center justify-center rounded-full border-[1.5px] font-semibold",
        MARKER_CLASS[state],
      )}
    >
      {state === "delivered" ? (
        <Check className="size-3.5" strokeWidth={2.5} />
      ) : state === "failed" ? (
        <X className="size-3.5" strokeWidth={2.25} />
      ) : (
        <HalfDisc />
      )}
    </span>
  );
}

/** Arrêts déjà traités, affichés en compact sous le choix du prochain client. */
export function CompletedStopsTimeline({ stops }: { stops: RouteStop[] }) {
  const done = completedStops(stops);
  if (!done.length) return null;

  return (
    <section className="flex flex-col gap-2" aria-label="Arrêts traités">
      <h2 className="t-section text-muted-foreground">Déjà traités</h2>
      <ol>
        {done.map((stop, index) => {
          const state = stopVisualState(stop, false);
          const visual = state === "current" || state === "upcoming" ? "delivered" : state;
          return (
            <li key={stop.deliveryNote} className="flex gap-3">
              <div className="flex w-8 flex-col items-center">
                <Marker state={visual} />
                {index < done.length - 1 ? <span className="my-1 w-0.5 flex-1 bg-border" /> : null}
              </div>
              <div className="min-w-0 flex-1 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
                    {stop.customerName}
                  </span>
                  {visual === "failed" ? (
                    <span className="whitespace-nowrap text-xs font-semibold text-rose-600">Non livré</span>
                  ) : (
                    <span className="num whitespace-nowrap text-xs text-muted-foreground">
                      {formatDriverMoney(stop.amountCollected || 0, false)}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate t-meta text-subtle">{stopTimelineDetail(stop, visual)}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
