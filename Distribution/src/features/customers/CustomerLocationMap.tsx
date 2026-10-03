import "leaflet/dist/leaflet.css";
import { divIcon, type LeafletMouseEvent, type Marker as LeafletMarker } from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

const ALGERIA_CENTER: [number, number] = [35.7, 0.6];

const pinIcon = divIcon({
  className: "distribution-map-marker distribution-map-marker--active",
  html: '<span aria-label="Position du client">●</span>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function Recenter({ position }: { position: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, Math.max(map.getZoom(), 15));
  }, [map, position]);
  return null;
}

function ClickToPlace({ onPick }: { onPick: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click: (event: LeafletMouseEvent) => onPick(event.latlng.lat, event.latlng.lng),
  });
  return null;
}

/** Carte : clic ou glisser du repère pour positionner le client. */
export function CustomerLocationMap({
  position,
  onPick,
}: {
  position: [number, number] | null;
  onPick: (latitude: number, longitude: number) => void;
}) {
  return (
    <div className="h-[340px] overflow-hidden rounded-lg bg-surface-subtle">
      <MapContainer
        center={position || ALGERIA_CENTER}
        zoom={position ? 15 : 6}
        scrollWheelZoom
        attributionControl={false}
        className="h-full w-full"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Recenter position={position} />
        <ClickToPlace onPick={onPick} />
        {position ? (
          <Marker
            position={position}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend: (event) => {
                const { lat, lng } = (event.target as LeafletMarker).getLatLng();
                onPick(lat, lng);
              },
            }}
          />
        ) : null}
      </MapContainer>
    </div>
  );
}
