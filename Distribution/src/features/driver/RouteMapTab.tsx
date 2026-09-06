import "leaflet/dist/leaflet.css";
import { divIcon } from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MapNextStopCard } from "@/features/driver/CurrentStopCard";
import { routeProgress, stopVisualState, type StopVisualState } from "@/features/driver/driverMobile";
import { cn } from "@/lib/utils";
import type { DistributionRoute, RouteStop } from "@/shared/types/distribution";

const PIN_CLASS: Record<StopVisualState, string> = {
  delivered: "bg-emerald-500 border-white",
  partial: "bg-amber-500 border-white",
  failed: "bg-rose-500 border-white",
  current: "bg-foreground border-white text-background",
  upcoming: "bg-background border-subtle text-muted-foreground",
};

const BRAND = "#18181b";
type MapPoint = [number, number];

function FitAndRecenter({ points, token }: { points: MapPoint[]; token: number }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], 13);
    else map.fitBounds(points, { padding: [48, 180] });
  }, [map, points, token]);
  return null;
}

function pinIcon(state: StopVisualState, index: number) {
  const label = state === "current" ? String(index + 1) : String(index + 1);
  return divIcon({
    className: "distribution-driver-pin",
    html: `<span class="grid ${state === "current" ? "size-9 text-[13px]" : "size-7 text-[11px]"} place-items-center rounded-full border-2 font-semibold ${PIN_CLASS[state]}">${label}</span>`,
    iconSize: state === "current" ? [36, 36] : [28, 28],
    iconAnchor: state === "current" ? [18, 18] : [14, 14],
  });
}

export function RouteMapTab({
  route,
  canTreat,
  onOpenStop,
}: {
  route: DistributionRoute;
  canTreat: boolean;
  onOpenStop: (stop: RouteStop) => void;
}) {
  const [recenterToken, setRecenterToken] = useState(0);
  const progress = routeProgress(route.stops);
  const currentStop = route.stops[progress.currentIndex];
  const located = route.stops.filter(
    (stop): stop is RouteStop & { latitude: number; longitude: number } =>
      typeof stop.latitude === "number" && typeof stop.longitude === "number",
  );
  const routePoints = useMemo<MapPoint[]>(
    () => route.routing.geometry?.coordinates.map(([longitude, latitude]) => [latitude, longitude]) || [],
    [route.routing.geometry],
  );
  const markerPoints: MapPoint[] = [
    ...(route.depot ? [[route.depot.latitude, route.depot.longitude] as MapPoint] : []),
    ...located.map((stop) => [stop.latitude, stop.longitude] as MapPoint),
  ];
  const boundsPoints = routePoints.length ? routePoints : markerPoints;
  const center: MapPoint = route.depot
    ? [route.depot.latitude, route.depot.longitude]
    : markerPoints[0] || [36.7525, 3.042];
  const itineraryKm = route.routing.distanceMeters != null ? route.routing.distanceMeters / 1000 : null;

  return (
    <div className="relative h-full min-h-[24rem] overflow-hidden bg-muted">
      <div className="absolute inset-0 isolate z-0" data-map-root>
        <MapContainer
          center={center}
          zoom={markerPoints.length ? 11 : 7}
          scrollWheelZoom
          attributionControl={false}
          className="h-full w-full"
        >
          <FitAndRecenter points={boundsPoints} token={recenterToken} />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {routePoints.length > 1 && (
            <Polyline positions={routePoints} pathOptions={{ color: BRAND, weight: 5, opacity: 0.82 }} />
          )}
          {located.map((stop) => {
            const index = route.stops.findIndex((item) => item.deliveryNote === stop.deliveryNote);
            const state = stopVisualState(stop, index === progress.currentIndex);
            return (
              <Marker key={stop.deliveryNote} position={[stop.latitude, stop.longitude]} icon={pinIcon(state, index)}>
                <Popup>
                  <strong>
                    {stop.sequence}. {stop.customerName}
                  </strong>
                  <br />
                  {stop.deliveryNote}
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
        <div className="pointer-events-auto p-4 pb-0">
          <Card density="touch" className="flex items-center gap-3 p-3 shadow-md">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">
                <span className="num">
                  {progress.done} / {progress.total}
                </span>{" "}
                arrêts · {progress.remaining} restants
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {itineraryKm != null
                  ? `${itineraryKm.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km d’itinéraire`
                  : "Distance indisponible"}
              </p>
            </div>
            <Button size="sm" className="shrink-0" type="button" onClick={() => setRecenterToken((value) => value + 1)}>
              Recentrer
            </Button>
          </Card>
          {located.length < route.stops.length ? (
            <p className="mt-2 t-meta text-muted-foreground">
              {route.stops.length - located.length} arrêt(s) sans coordonnées client — non placés.
            </p>
          ) : null}
        </div>

        <div className="pointer-events-auto mt-auto rounded-t-[22px] bg-background px-4 pt-3.5 shadow-[0_-8px_24px_-12px_rgba(9,9,11,0.3)]">
          <span className="mx-auto mb-3 block h-1 w-9 rounded-full bg-border" />
          {currentStop ? (
            <MapNextStopCard
              stop={currentStop}
              index={progress.currentIndex + 1}
              routeId={route.name}
              canTreat={canTreat}
              onOpen={onOpenStop}
            />
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
    </div>
  );
}
