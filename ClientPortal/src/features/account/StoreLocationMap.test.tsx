import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { vi } from "vitest"
import { StoreLocationMap } from "@/features/account/StoreLocationMap"

vi.mock("leaflet", () => ({ divIcon: (options: unknown) => options }))
vi.mock("react-leaflet", () => ({
  MapContainer: ({
    children,
    attributionControl,
  }: {
    children: ReactNode
    attributionControl?: boolean
  }) => (
    <div data-testid="map" data-attribution={String(attributionControl)}>
      {children}
    </div>
  ),
  Marker: ({
    position,
    draggable,
  }: {
    position: [number, number]
    draggable?: boolean
  }) => <div data-testid="marker" data-lat={position[0]} data-lng={position[1]} data-draggable={String(draggable)} />,
  TileLayer: () => <div data-testid="tiles" />,
  useMapEvents: () => null,
}))

describe("StoreLocationMap", () => {
  it("affiche un pin déplaçable sans mentions Leaflet ni OSM", () => {
    render(<StoreLocationMap pin={[36.75, 3.05]} onPick={vi.fn()} />)
    expect(screen.getByTestId("map")).toHaveAttribute("data-attribution", "false")
    expect(screen.getByTestId("tiles")).toBeInTheDocument()
    expect(screen.getByTestId("marker")).toHaveAttribute("data-lat", "36.75")
    expect(screen.getByTestId("marker")).toHaveAttribute("data-draggable", "true")
    expect(screen.queryByRole("link", { name: "OpenStreetMap" })).not.toBeInTheDocument()
    expect(screen.queryByText(/Leaflet/i)).not.toBeInTheDocument()
  })
})
