import { Navigation, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { RouteStop } from "@/shared/types/distribution";
import { directionUrl, stopAddress } from "@/features/driver/stopHelpers";
import { formatDinars } from "@/features/driver/driverMobile";

/**
 * Arrêt courant : une seule action primaire, navigation et appel en secondaire.
 * Utilisée dans la timeline (1c) et dans la feuille basse de la carte (1g).
 */
export function CurrentStopCard({
  stop,
  routeId,
  onOpen,
}: {
  stop: RouteStop;
  routeId: string;
  onOpen: (deliveryNote: string) => void;
}) {
  const missingCustomerGps = stop.latitude == null || stop.longitude == null;

  return (
    <Card density="touch" className="overflow-hidden border-[1.5px] border-foreground p-0 shadow-lg">
      <div className="p-3.5 pb-2.5">
        <p className="t-micro text-muted-foreground">Arrêt en cours</p>
        <h3 className="mt-0.5 text-lg font-semibold tracking-tight">{stop.customerName}</h3>
        <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{stopAddress(stop)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {missingCustomerGps ? (
            <StatusBadge tone="warning" size="sm">
              GPS client à collecter
            </StatusBadge>
          ) : null}
          <span className="num rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            {stop.deliveryNote}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-3.5 pb-3">
        <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2.5">
          <span className="text-sm text-muted-foreground">À encaisser</span>
          <strong className="num whitespace-nowrap text-base font-semibold">
            {formatDinars(stop.totalAmount || 0)}
          </strong>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline" size="touch">
            <a href={directionUrl(stop)} target="_blank" rel="noreferrer">
              <Navigation className="size-4" />
              Navigation
            </a>
          </Button>
          <Button asChild variant="outline" size="touch" disabled={!stop.customerPhone}>
            <a href={`tel:${stop.customerPhone || ""}`}>
              <Phone className="size-4" />
              Appeler
            </a>
          </Button>
        </div>

        <Button
          size="touch"
          className="h-14 text-base"
          onClick={() => onOpen(stop.deliveryNote)}
          aria-label={`Traiter l'arrêt ${stop.customerName} de la tournée ${routeId}`}
        >
          Traiter cet arrêt
        </Button>
      </div>
    </Card>
  );
}
