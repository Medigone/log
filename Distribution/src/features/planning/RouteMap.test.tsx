import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouteMap } from "@/features/planning/RouteMap";

vi.mock("leaflet", () => ({ divIcon: (options: unknown) => options }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children, attributionControl }: { children: ReactNode; attributionControl?: boolean }) => <div data-testid="map" data-attribution={String(attributionControl)}>{children}</div>,
  Marker: ({ children, icon }: { children: ReactNode; icon?: { className?: string; html?: string } }) => <div data-testid="marker" data-icon-class={icon?.className} data-icon-html={icon?.html}>{children}</div>,
  Polyline: () => <div data-testid="road-line" />,
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => <div data-testid="tiles" />,
  useMap: () => ({ setView: vi.fn(), fitBounds: vi.fn() }),
}));

const stop = {
  deliveryNote: "DN-1",
  customer: "CUST-1",
  customerName: "Client Test",
  customerGpsStatus: "known" as const,
  requiresCustomerGeolocation: false,
  latitude: 35.7,
  longitude: -0.6,
  totalQuantity: 1,
  amountCollected: 0,
  amountToCollect: 0,
  payments: [],
  invoiceStatus: "Non créée",
  status: "Préparé",
  planningStatus: "Planifié" as const,
  sequence: 1,
};

describe("RouteMap", () => {
  it("affiche le dépôt, les arrêts et la géométrie routière sans contrôle Leaflet", () => {
    render(<RouteMap
      stops={[stop]}
      depot={{ name: "DEPOT", label: "Dépôt Principal", latitude: 35.67, longitude: -0.66, isDefault: true }}
      routing={{
        status: "ready",
        provider: "openrouteservice",
        profile: "driving-car",
        optimizationEnabled: false,
        geometry: { type: "LineString", coordinates: [[-0.66, 35.67], [-0.6, 35.7], [-0.66, 35.67]] },
      }}
    />);

    expect(screen.getByTestId("map")).toHaveAttribute("data-attribution", "false");
    expect(screen.getByTestId("road-line")).toBeInTheDocument();
    expect(screen.getAllByTestId("marker")).toHaveLength(2);
    expect(screen.getByText(/Dépôt Principal/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "OpenStreetMap" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "OpenRouteService" })).toBeInTheDocument();
  });

  it("n'invente pas de ligne droite sans itinéraire calculé", () => {
    render(<RouteMap
      stops={[stop]}
      routing={{ status: "not_calculated", provider: "openrouteservice", profile: "driving-car", optimizationEnabled: false }}
    />);
    expect(screen.queryByTestId("road-line")).not.toBeInTheDocument();
  });

  it("affiche une coche verte sur la carte lorsqu'un arrêt est livré", () => {
    render(<RouteMap
      stops={[{ ...stop, status: "Livré" }]}
      routing={{ status: "not_calculated", provider: "openrouteservice", profile: "driving-car", optimizationEnabled: false }}
    />);

    const marker = screen.getByTestId("marker");
    expect(marker).toHaveAttribute("data-icon-class", expect.stringContaining("distribution-map-marker--delivered"));
    expect(marker).toHaveAttribute("data-icon-html", expect.stringContaining("✓"));
    expect(screen.getByText("Livré")).toBeInTheDocument();
  });

  it("signale une position approximative quand le GPS vient de la commune", () => {
    render(<RouteMap
      stops={[{ ...stop, geolocationSource: "commune", requiresCustomerGeolocation: true, customerGpsStatus: "missing" }]}
      routing={{ status: "not_calculated", provider: "openrouteservice", profile: "driving-car", optimizationEnabled: false }}
    />);
    expect(screen.getByText(/position approximative \(commune\)/i)).toBeInTheDocument();
  });
});
