import { ChevronRight, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { RouteStop } from "@/shared/types/distribution";
import { stopAddress } from "@/features/driver/stopHelpers";
import { formatDriverMoney, stopExpectedAmount } from "@/features/driver/driverMobile";
import { cn } from "@/lib/utils";

export function RemainingStopsList({
  stops,
  canTreat,
  selecting,
  onSelect,
  compact = false,
}: {
  stops: RouteStop[];
  canTreat: boolean;
  selecting?: boolean;
  onSelect: (stop: RouteStop) => void;
  compact?: boolean;
}) {
  if (!stops.length) return null;

  return (
    <section className="flex flex-col gap-2" aria-label="Arrêts restants">
      {compact ? (
        <p className="text-sm font-semibold">Choisissez le prochain client</p>
      ) : (
        <div>
          <h2 className="t-section">À livrer</h2>
          <p className="t-body text-muted-foreground">
            Choisissez le prochain client — l’ordre GPS n’est qu’une suggestion.
          </p>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {stops.map((stop) => (
          <li key={stop.deliveryNote}>
            <button
              type="button"
              disabled={!canTreat || selecting}
              onClick={() => onSelect(stop)}
              aria-label={`Livrer ${stop.customerName}`}
              className={cn(
                "w-full text-left disabled:cursor-default",
                !canTreat && "opacity-70",
              )}
            >
              <Card density="touch" className={cn("flex items-center gap-3", compact ? "p-3" : "p-3.5")}>
                <span className="num grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold">
                  {stop.sequence}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{stop.customerName}</span>
                  {compact ? (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{stopAddress(stop)}</span>
                  ) : (
                    <>
                      <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <MapPin className="size-3.5 shrink-0" />
                        {stopAddress(stop)}
                      </span>
                      <span className="num mt-1 block text-xs text-muted-foreground">
                        {stop.deliveryNote} · {formatDriverMoney(stop.amountToCollect || stopExpectedAmount(stop), true)}
                      </span>
                    </>
                  )}
                </span>
                {canTreat ? <ChevronRight className="size-5 shrink-0 text-muted-foreground" /> : null}
              </Card>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
