import { describe, expect, it, vi } from "vitest"
import { assertAccurateGps, locate } from "@/shared/geolocation"

describe("géolocalisation portail", () => {
  it("lit la position de l'appareil", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: 36.75, longitude: 3.05, accuracy: 12 } } as GeolocationPosition),
    )
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } })
    await expect(locate()).resolves.toEqual({ latitude: 36.75, longitude: 3.05, accuracy: 12 })
  })

  it("refuse une précision supérieure à 50 m", () => {
    expect(() => assertAccurateGps({ latitude: 36.75, longitude: 3.05, accuracy: 51 })).toThrow(/Précision insuffisante/)
  })
})
