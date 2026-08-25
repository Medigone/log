import "leaflet/dist/leaflet.css";
import { divIcon } from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { getStopVisualStyle } from "@/features/planning/stopStatus";
import type { RouteDepot, RouteItinerary, RouteStop } from "@/shared/types/distribution";

type MapPoint = [number, number];

function FitRouteBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 13);
    if (points.length > 1) map.fitBounds(points, { padding: [32, 32] });
  }, [map, points]);
  return null;
}

function stopIcon(stop: RouteStop) {
  const visual = getStopVisualStyle(stop.status);
  return divIcon({
    className: `distribution-map-marker ${visual.markerClass}`,
    html: `<span aria-label="${visual.label}">${visual.markerSymbol || stop.sequence}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

const depotIcon = divIcon({
  className: "distribution-map-depot",
  html: "<span>⌂</span>",
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

interface RouteMapProps {
  stops: RouteStop[];
  depot?: RouteDepot;
  routing: RouteItinerary;
}

export function RouteMap({ stops, depot, routing }: RouteMapProps) {
  const located = stops.filter(
    (stop): stop is RouteStop & { latitude: number; longitude: number } =>
      typeof stop.latitude === "number" && typeof stop.longitude === "number",
  );
  const routePoints = useMemo<MapPoint[]>(
    () => routing.geometry?.coordinates.map(([longitude, latitude]) => [latitude, longitude]) || [],
    [routing.geometry],
  );
  const markerPoints: MapPoint[] = [
    ...(depot ? [[depot.latitude, depot.longitude] as MapPoint] : []),
    ...located.map((stop) => [stop.latitude, stop.longitude] as MapPoint),
  ];
  const boundsPoints = routePoints.length ? routePoints : markerPoints;
  const center: MapPoint = depot
    ? [depot.latitude, depot.longitude]
    : markerPoints[0] || [36.7525, 3.042];

  return (
    <div>
      <div className="h-80 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        <MapContainer
          center={center}
          zoom={markerPoints.length ? 11 : 7}
          scrollWheelZoom
          attributionControl={false}
          className="h-full w-full"
        >
          <FitRouteBounds points={boundsPoints} />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {routePoints.length > 1 && (
            <Polyline
              positions={routePoints}
              pathOptions={{ color: "#1d4ed8", weight: 5, opacity: 0.82 }}
            />
          )}
          {depot && (
            <Marker position={[depot.latitude, depot.longitude]} icon={depotIcon}>
              <Popup>
                <strong>Dépôt · {depot.label}</strong>
                <br />
                {depot.address || "Adresse non renseignée"}
              </Popup>
            </Marker>
          )}
          {located.map((stop) => (
            <Marker
              key={stop.deliveryNote}
              position={[stop.latitude, stop.longitude]}
              icon={stopIcon(stop)}
            >
              <Popup>
                <strong>{stop.sequence}. {stop.customerName}</strong>
                <br />
                {stop.deliveryNote}
                <br />
                <strong>{getStopVisualStyle(stop.status).label}</strong>
                <br />
                {stop.amountCollected.toLocaleString("fr-DZ")} DZD encaissé(s) · {stop.amountToCollect.toLocaleString("fr-DZ")} DZD restant
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <p className="mt-1.5 text-right text-[10px] text-slate-400">
        Données cartographiques ©{" "}
        <a className="underline hover:text-slate-600" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>{" "}
        · itinéraire{" "}
        <a className="underline hover:text-slate-600" href="https://openrouteservice.org" target="_blank" rel="noreferrer">
          OpenRouteService
        </a>
      </p>
    </div>
  );
}
