import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { RouteStop } from "@/shared/types/distribution";
import { CurrentStopCard } from "@/features/driver/CurrentStopCard";
import { routeProgress, stopVisualState, type StopVisualState } from "@/features/driver/driverMobile";
import { cn } from "@/lib/utils";

const PIN_CLASS: Record<StopVisualState, string> = {
  delivered: "bg-emerald-500 border-white",
  partial: "bg-amber-500 border-white",
  failed: "bg-rose-500 border-white",
  current: "bg-foreground border-white text-background",
  upcoming: "bg-background border-subtle text-muted-foreground",
};

/**
 * 4ᵉ onglet. Les pastilles reprennent exactement la sémantique de couleur
 * de la timeline. Le fond de carte n'est pas branché : monter la même
 * dépendance que le planificateur dans le conteneur data-map-root.
 */
export function RouteMapTab({
  stops,
  routeId,
  onOpenStop,
  remainingDistanceKm,
}: {
  stops: RouteStop[];
  routeId: string;
  onOpenStop: (deliveryNote: string) => void;
  remainingDistanceKm?: number | null;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const progress = routeProgress(stops);
  const currentStop = stops[progress.currentIndex];
  const placeable = stops.filter((stop) => stop.latitude != null && stop.longitude != null);

  useEffect(() => {
    // TODO(carte) : initialiser les tuiles ici, rendre les pastilles en divIcon
    // pour réutiliser PIN_CLASS. Nettoyer l'instance au démontage.
  }, []);

  return (
    <div className="relative -mx-4 -mb-4 flex min-h-[70svh] flex-col">
      <div ref={mapRef} data-map-root className="absolute inset-0 bg-muted" aria-hidden="true" />

      <div className="relative p-4 pb-0">
        <Card density="touch" className="flex items-center gap-3 p-3 shadow-md">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">
              <span className="num">
                {progress.done} / {progress.total}
              </span>{" "}
              arrêts · {progress.remaining} restants
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {remainingDistanceKm != null ? `${remainingDistanceKm.toLocaleString("fr-FR")} km restants` : "Distance indisponible"}
            </p>
          </div>
          <Button size="sm" className="shrink-0">
            Recentrer
          </Button>
        </Card>

        {placeable.length < stops.length ? (
          <p className="mt-2 t-meta text-muted-foreground">
            {stops.length - placeable.length} arrêt(s) sans coordonnées client — non placés.
          </p>
        ) : null}
      </div>

      <div className="relative mt-auto rounded-t-[22px] bg-background px-4 pt-3.5 shadow-[0_-8px_24px_-12px_rgba(9,9,11,0.3)]">
        <span className="mx-auto mb-3 block h-1 w-9 rounded-full bg-border" />
        {currentStop ? (
          <CurrentStopCard stop={currentStop} routeId={routeId} onOpen={onOpenStop} />
        ) : (
          <p className="pb-3 text-center text-sm text-muted-foreground">Tous les arrêts sont traités.</p>
        )}
        <dl className="flex items-center gap-3.5 py-3 text-xs text-muted-foreground">
          {(
            [
              ["delivered", "Livré"],
              ["failed", "Échec"],
              ["upcoming", "À venir"],
            ] as Array<[StopVisualState, string]>
          ).map(([state, label]) => (
            <div key={state} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full border-[1.5px]", PIN_CLASS[state])} />
              <dt>{label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
