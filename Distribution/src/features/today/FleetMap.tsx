import "leaflet/dist/leaflet.css";
import { divIcon } from "leaflet";
import { Fragment, useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { Link } from "react-router-dom";
import { getStopVisualStyle } from "@/features/planning/stopStatus";
import {
  TRAVELED_PATH_COLOR,
  fleetColor,
  lastProcessedStop,
  mapStops,
  splitTraveledPath,
  vehiclePosition,
  type MapPoint,
} from "@/features/today/fleetProgress";
import type { ActivityLiveRoute, ActivityLiveStop, DistributionRoute, RouteStop } from "@/shared/types/distribution";

const ALGIERS: MapPoint = [36.7525, 3.042];

function FitFleetBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 12);
    if (points.length > 1) map.fitBounds(points, { padding: [36, 36] });
  }, [map, points]);
  return null;
}

function stopIcon(stop: ActivityLiveStop | RouteStop, color: string) {
  const visual = getStopVisualStyle(stop.status);
  return divIcon({
    className: `distribution-map-marker ${visual.markerClass}`,
    html: `<span aria-label="${visual.label}" style="background:${visual.state === "pending" ? color : ""}">${visual.markerSymbol || stop.sequence}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function vehicleIcon(color: string, live: boolean) {
  return divIcon({
    className: `distribution-map-vehicle${live ? " distribution-map-vehicle--live" : ""}`,
    html: `<span aria-label="Véhicule" style="background:${color}">🚚</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

const depotIcon = divIcon({
  className: "distribution-map-depot",
  html: '<span aria-label="Dépôt">⌂</span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function uniqueDepots(routes: FleetMapRoute[]) {
  const seen = new Set<string>();
  const depots: NonNullable<FleetMapRoute["depot"]>[] = [];
  for (const route of routes) {
    if (!route.depot) continue;
    const key = route.depot.name || `${route.depot.latitude},${route.depot.longitude}`;
    if (seen.has(key)) continue;
    seen.add(key);
    depots.push(route.depot);
  }
  return depots;
}

function routePoints(route: FleetMapRoute): MapPoint[] {
  return route.routing?.geometry?.coordinates.map(([longitude, latitude]) => [latitude, longitude] as MapPoint) || [];
}

export type FleetMapRoute = Pick<ActivityLiveRoute, "name" | "lifecycle" | "stops" | "visits"> & {
  driverName?: string | null;
  vehicleLabel?: string | null;
  depot?: ActivityLiveRoute["depot"];
  routing?: ActivityLiveRoute["routing"] | DistributionRoute["routing"] | null;
};

interface FleetMapProps {
  routes: FleetMapRoute[];
  focus?: string;
}

export function FleetMap({ routes, focus }: FleetMapProps) {
  const visible = useMemo(
    () => (focus ? routes.filter((route) => route.name === focus) : routes),
    [focus, routes],
  );
  const bounds = useMemo(() => {
    const points: MapPoint[] = [];
    for (const route of visible) {
      points.push(...routePoints(route));
      const vehicle = vehiclePosition(route);
      if (vehicle) points.push(vehicle);
      if (route.depot) points.push([route.depot.latitude, route.depot.longitude]);
      for (const stop of mapStops(route)) {
        if (stop.latitude != null && stop.longitude != null) points.push([stop.latitude, stop.longitude]);
      }
    }
    return points;
  }, [visible]);

  return (
    <div className="h-[420px] overflow-hidden rounded-lg bg-surface-subtle">
      <MapContainer
        center={bounds[0] || ALGIERS}
        zoom={bounds.length ? 11 : 7}
        scrollWheelZoom
        attributionControl={false}
        className="h-full w-full"
      >
        <FitFleetBounds points={bounds} />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {uniqueDepots(visible).map((depot) => (
          <Marker
            key={depot.name || `${depot.latitude},${depot.longitude}`}
            position={[depot.latitude, depot.longitude]}
            icon={depotIcon}
            zIndexOffset={500}
          >
            <Popup>
              <strong>Dépôt · {depot.label}</strong>
              <br />
              {depot.address || "Adresse non renseignée"}
            </Popup>
          </Marker>
        ))}
        {visible.map((route) => {
          const color = fleetColor(Math.max(0, routes.findIndex((item) => item.name === route.name)));
          const line = routePoints(route);
          const lastProcessed = lastProcessedStop(route);
          const lastPoint =
            lastProcessed?.latitude != null && lastProcessed.longitude != null
              ? ([lastProcessed.latitude, lastProcessed.longitude] as MapPoint)
              : null;
          const { traveled, remaining } = splitTraveledPath(line, lastPoint, route.lifecycle === "Terminée");
          const vehicle = vehiclePosition(route);
          const progressStops = mapStops(route).filter(
            (stop): stop is ActivityLiveStop & { latitude: number; longitude: number } =>
              typeof stop.latitude === "number" && typeof stop.longitude === "number",
          );
          return (
            <Fragment key={route.name}>
              {remaining.length > 1 && (
                <Polyline positions={remaining} pathOptions={{ color, weight: 5, opacity: 0.78 }} />
              )}
              {traveled.length > 1 && (
                <Polyline positions={traveled} pathOptions={{ color: TRAVELED_PATH_COLOR, weight: 5, opacity: 0.9 }} />
              )}
              {progressStops.map((stop) => (
                <Marker key={stop.deliveryNotes?.join(",") || stop.deliveryNote} position={[stop.latitude, stop.longitude]} icon={stopIcon(stop, color)}>
                  <Popup>
                    <strong>{stop.sequence}. {stop.customerName}</strong>
                    <br />
                    {stop.deliveryNotes && stop.deliveryNotes.length > 1 ? `${stop.deliveryNotes.length} BL` : stop.deliveryNote}
                    <br />
                    {getStopVisualStyle(stop.status).label}
                    <br />
                    {route.driverName || route.name}
                  </Popup>
                </Marker>
              ))}
              {vehicle && (
                <Marker position={vehicle} icon={vehicleIcon(color, route.lifecycle === "En cours")} zIndexOffset={800}>
                  <Popup>
                    <strong>{route.vehicleLabel || "Véhicule"}</strong>
                    <br />
                    {route.driverName || "Livreur non assigné"}
                    <br />
                    {route.lifecycle}
                    <br />
                    <Link className="mt-1 inline-block font-medium text-brand-700 underline" to={`/planning/routes/${route.name}`}>
                      Voir la tournée
                    </Link>
                  </Popup>
                </Marker>
              )}
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
