import type { GpsPosition } from "@/shared/types"

export const MAX_GPS_ACCURACY_METERS = 50
export const DEFAULT_MAP_CENTER: [number, number] = [36.7525, 3.042]

export function locate(): Promise<GpsPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("La géolocalisation n'est pas disponible sur cet appareil."))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      () => reject(new Error("Autorisez la localisation précise dans votre navigateur puis réessayez.")),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    )
  })
}

export function assertAccurateGps(position: GpsPosition): GpsPosition {
  if (position.accuracy > MAX_GPS_ACCURACY_METERS) {
    throw new Error(
      `Précision insuffisante (${Math.round(position.accuracy)} m). Placez-vous près d'une fenêtre et réessayez.`,
    )
  }
  return position
}
