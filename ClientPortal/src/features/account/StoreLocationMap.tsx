import "leaflet/dist/leaflet.css"
import { divIcon } from "leaflet"
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet"
import { DEFAULT_MAP_CENTER } from "@/shared/geolocation"

const PIN_WIDTH = 36
const PIN_HEIGHT = 48

const pinIcon = divIcon({
  className: "store-location-map-pin",
  iconSize: [PIN_WIDTH, PIN_HEIGHT],
  iconAnchor: [PIN_WIDTH / 2, PIN_HEIGHT],
  html: `<span aria-label="Position du magasin"><svg xmlns="http://www.w3.org/2000/svg" width="${PIN_WIDTH}" height="${PIN_HEIGHT}" viewBox="0 0 36 48" aria-hidden="true"><path fill="#e11d48" stroke="#fff" stroke-width="2" d="M18 2.5c-7.5 0-13.5 6-13.5 13.5 0 10.2 13.5 30 13.5 30s13.5-19.8 13.5-30C31.5 8.5 25.5 2.5 18 2.5z"/><circle cx="18" cy="16" r="5.5" fill="#fff"/></svg></span>`,
})

function MapClickHandler({ onPick }: { onPick: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

export function StoreLocationMap({
  pin,
  onPick,
  editable = true,
}: {
  pin: [number, number] | null
  onPick: (latitude: number, longitude: number) => void
  editable?: boolean
}) {
  const center = pin || DEFAULT_MAP_CENTER

  return (
    <div className="store-location-map relative z-0 h-80 overflow-hidden rounded-lg border">
      <MapContainer
        center={center}
        zoom={pin ? 16 : 12}
        scrollWheelZoom
        attributionControl={false}
        className="h-full w-full"
      >
        {editable ? <MapClickHandler onPick={onPick} /> : null}
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {pin && (
          <Marker
            position={pin}
            icon={pinIcon}
            draggable={editable}
            eventHandlers={
              editable
                ? {
                    dragend(event) {
                      const { lat, lng } = event.target.getLatLng()
                      onPick(lat, lng)
                    },
                  }
                : undefined
            }
          />
        )}
      </MapContainer>
    </div>
  )
}
