import { ChevronRight, Navigation, Phone } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { RouteStop } from "@/shared/types/distribution";
import { directionUrl, stopAddress } from "@/features/driver/stopHelpers";
import { visitNotesLabel } from "@/features/driver/visitHelpers";
import { formatDriverMoney, stopExpectedAmount } from "@/features/driver/driverMobile";
import { cn } from "@/lib/utils";

export function StopNavLinks({ stop, compact = false }: { stop: RouteStop; compact?: boolean }) {
  const canCall = Boolean(stop.phone);
  if (compact) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <a
          href={directionUrl(stop)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Navigation vers ${stop.customerName}`}
          className="grid size-11 place-items-center rounded-xl border border-hairline-strong text-slate-700"
        >
          <Navigation className="size-4" />
        </a>
        <a
          href={canCall ? `tel:${stop.phone}` : undefined}
          aria-label={canCall ? `Appeler ${stop.customerName}` : "Téléphone non renseigné"}
          aria-disabled={!canCall}
          className={`grid size-11 place-items-center rounded-xl border ${
            canCall ? "border-hairline-strong text-slate-700" : "pointer-events-none border-hairline text-subtle"
          }`}
        >
          <Phone className="size-4" />
        </a>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <a
        href={directionUrl(stop)}
        target="_blank"
        rel="noreferrer"
        aria-label={`Navigation vers ${stop.customerName}`}
        className={cn(buttonVariants({ variant: "outline", size: "touch" }), "w-full")}
      >
        <Navigation className="size-4" />
        Navigation
      </a>
      <a
        href={canCall ? `tel:${stop.phone}` : undefined}
        aria-label={canCall ? `Appeler ${stop.customerName}` : "Téléphone non renseigné"}
        aria-disabled={!canCall}
        className={cn(
          buttonVariants({ variant: "outline", size: "touch" }),
          "w-full",
          !canCall && "pointer-events-none opacity-50",
        )}
      >
        <Phone className="size-4" />
        Appeler
      </a>
    </div>
  );
}

/**
 * Arrêt courant : une seule action primaire, navigation et appel en secondaire.
 */
/** Carte compacte de l’étape suivante, collée en bas de la vue Carte. */
export function MapNextStopCard({
  stop,
  index,
  routeId,
  canTreat = true,
  onOpen,
}: {
  stop: RouteStop;
  index: number;
  routeId: string;
  canTreat?: boolean;
  onOpen: (stop: RouteStop) => void;
}) {
  return (
    <div className="rounded-touch border-[1.5px] border-foreground bg-background p-3">
      <div className="flex items-start gap-2.5">
        <span className="num grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-[13px] font-semibold text-background">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[16.5px] font-semibold tracking-tight">{stop.customerName}</h2>
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{stopAddress(stop)}</p>
          {(stop.deliveryNotes?.length || 0) > 1 ? (
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">{visitNotesLabel(stop)}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <a
          href={directionUrl(stop)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Navigation vers ${stop.customerName}`}
          className={cn(buttonVariants({ variant: "outline", size: "touch" }), "h-12 w-full text-sm")}
        >
          <Navigation className="size-4" />
          Navigation
        </a>
        {canTreat ? (
          <Button
            size="touch"
            className="h-12 text-sm"
            onClick={() => onOpen(stop)}
            aria-label={`Traiter cet arrêt · ${stop.customerName} · ${routeId}`}
          >
            Traiter
            <ChevronRight className="size-4" />
          </Button>
        ) : (
          <span className="flex h-12 items-center justify-center rounded-touch border border-hairline text-sm font-semibold text-muted-foreground">
            {stop.status}
          </span>
        )}
      </div>
    </div>
  );
}

export function CurrentStopCard({
  stop,
  routeId,
  canTreat = true,
  onOpen,
}: {
  stop: RouteStop;
  routeId: string;
  canTreat?: boolean;
  onOpen: (stop: RouteStop) => void;
}) {
  const collect = stop.amountToCollect || stopExpectedAmount(stop);

  return (
    <Card density="touch" className="overflow-hidden border-[1.5px] border-foreground p-0 shadow-lg">
      <div className="p-3.5 pb-2.5">
        <p className="t-micro tracking-[0.09em] text-muted-foreground uppercase">Arrêt en cours</p>
        <h2 className="mt-0.5 text-lg font-semibold tracking-tight">{stop.customerName}</h2>
        <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{stopAddress(stop)}</p>
        {stop.instructions ? <p className="mt-2 t-meta text-slate-700">{stop.instructions}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {stop.requiresCustomerGeolocation ? (
            <StatusBadge tone="warning" size="sm">
              GPS client à collecter
            </StatusBadge>
          ) : null}
          <span className="num rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            {visitNotesLabel(stop)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-3.5 pb-3">
        <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2.5">
          <span className="text-sm text-muted-foreground">À encaisser</span>
          <strong className="num whitespace-nowrap text-base font-semibold">{formatDriverMoney(collect, true)}</strong>
        </div>

        <StopNavLinks stop={stop} />

        {canTreat ? (
          <Button
            size="touch"
            className="h-14 text-base"
            onClick={() => onOpen(stop)}
            aria-label={`Traiter cet arrêt · ${stop.customerName} · ${routeId}`}
          >
            Traiter cet arrêt
            <ChevronRight className="size-4 opacity-70" />
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
