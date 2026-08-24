import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import type { RouteStop } from "@/shared/types/distribution";

export function RouteMap({ stops }: { stops: RouteStop[] }) {
  const located = stops.filter(
    (stop): stop is RouteStop & { latitude: number; longitude: number } =>
      typeof stop.latitude === "number" && typeof stop.longitude === "number",
  );
  const center: [number, number] = located.length
    ? [located[0].latitude, located[0].longitude]
    : [36.7525, 3.042];

  return (
    <div className="h-72 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      <MapContainer center={center} zoom={located.length ? 11 : 7} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {located.map((stop, index) => (
          <CircleMarker
            key={stop.deliveryNote}
            center={[stop.latitude, stop.longitude]}
            radius={13}
            pathOptions={{ color: "#1d4ed8", fillColor: "#2563eb", fillOpacity: 0.9 }}
          >
            <Popup>
              <strong>{index + 1}. {stop.customerName}</strong><br />
              {stop.deliveryNote}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
