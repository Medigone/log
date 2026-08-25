import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RouteDetailsPage } from "@/features/planning/RouteDetailsPage";
import type { DistributionRoute } from "@/shared/types/distribution";

const mocks = vi.hoisted(() => ({
  publishRoute: vi.fn().mockResolvedValue({}),
  generateQrCode: vi.fn().mockResolvedValue({}),
  calculateRouteItinerary: vi.fn().mockResolvedValue({}),
  proposeRouteOptimization: vi.fn(),
  applyRouteOptimization: vi.fn(),
  mutate: vi.fn().mockResolvedValue(undefined),
}));

const route: DistributionRoute = {
  name: "LIV-TEST-1",
  date: "2026-08-26",
  lifecycle: "Brouillon",
  plannedStart: "2026-08-26 08:00:00",
  plannedEnd: "2026-08-26 12:00:00",
  revision: 2,
  publishedRevision: 0,
  acknowledgedRevision: 0,
  acknowledged: false,
  needsReview: false,
  driver: "DRV-1",
  driverName: "Livreur Test",
  vehicle: "VEH-1",
  vehicleLabel: "Renault Test · 001",
  vehicleCapacity: 20,
  totalQuantity: 2,
  totalAmount: 1500,
  alerts: [],
  depot: { name: "Dépôt Principal", label: "Dépôt Principal", latitude: 35.67, longitude: -0.66, isDefault: true },
  routing: {
    status: "ready",
    provider: "openrouteservice",
    profile: "driving-car",
    optimizationEnabled: true,
    distanceMeters: 12000,
    durationSeconds: 1800,
    stopDurationMinutes: 15,
    stopDurationSeconds: 900,
    totalDurationSeconds: 2700,
    geometry: { type: "LineString", coordinates: [[-0.66, 35.67], [-0.6, 35.7], [-0.66, 35.67]] },
    revision: 2,
  },
  stops: [{
    deliveryNote: "DN-TEST-1",
    customer: "CUST-1",
    customerName: "Client Test",
    commune: "Oran",
    latitude: 35.7,
    longitude: -0.6,
    totalQuantity: 2,
    amountToCollect: 1500,
    status: "Préparé",
    planningStatus: "Planifié",
    sequence: 1,
    qrCode: "/files/qr-test.png",
    packageCount: 2,
    items: [{ name: "ROW-1", itemCode: "ART-1", itemName: "Article Test", quantity: 2, deliveredQuantity: 0, remainingQuantity: 2 }],
  }],
};

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useRouteDetails: () => ({ data: { message: route }, error: undefined, isLoading: false, mutate: mocks.mutate }),
  useDistributionMutations: () => ({
    publishRoute: mocks.publishRoute,
    generateQrCode: mocks.generateQrCode,
    calculateRouteItinerary: mocks.calculateRouteItinerary,
    proposeRouteOptimization: mocks.proposeRouteOptimization,
    applyRouteOptimization: mocks.applyRouteOptimization,
    saving: false,
    routing: false,
  }),
}));
vi.mock("@/features/planning/RouteMap", () => ({ RouteMap: () => <div>Carte GPS OSM</div> }));

describe("RouteDetailsPage", () => {
  it("présente les ressources, la carte, les articles et le QR avant publication", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MemoryRouter initialEntries={["/planning/routes/LIV-TEST-1"]}><Routes><Route path="/planning/routes/:routeId" element={<RouteDetailsPage />} /></Routes></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "LIV-TEST-1" })).toBeInTheDocument();
    expect(screen.getByText("Carte GPS OSM")).toBeInTheDocument();
    expect(screen.getByText("12 km")).toBeInTheDocument();
    expect(screen.getByText("45 min")).toBeInTheDocument();
    expect(screen.getByText("15 min × 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /optimiser l’ordre/i })).toBeInTheDocument();
    expect(screen.getByText("Renault Test · 001")).toBeInTheDocument();
    expect(screen.getByText("ART-1")).toBeInTheDocument();
    expect(screen.getByAltText("QR du BL DN-TEST-1")).toBeInTheDocument();
    expect(screen.getByText("2 étiquette(s)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /publier la tournée/i }));
    expect(mocks.publishRoute).toHaveBeenCalledWith("LIV-TEST-1", 2);
  });

  it("compare puis applique explicitement l'ordre optimisé", async () => {
    const user = userEvent.setup();
    mocks.proposeRouteOptimization.mockResolvedValue({
      routeId: route.name,
      revision: route.revision,
      currentOrder: ["DN-TEST-1"],
      optimizedOrder: ["DN-TEST-1"],
      current: { distanceMeters: 12000, durationSeconds: 1800, stopDurationSeconds: 900, totalDurationSeconds: 2700 },
      optimized: { distanceMeters: 11000, durationSeconds: 1500, stopDurationSeconds: 900, totalDurationSeconds: 2400 },
    });
    mocks.applyRouteOptimization.mockResolvedValue({ ...route, revision: 3 });
    render(<MemoryRouter initialEntries={["/planning/routes/LIV-TEST-1"]}><Routes><Route path="/planning/routes/:routeId" element={<RouteDetailsPage />} /></Routes></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: /optimiser l’ordre/i }));
    expect(await screen.findByRole("dialog", { name: /comparer l’ordre/i })).toBeInTheDocument();
    expect(mocks.applyRouteOptimization).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /appliquer cet ordre/i }));
    expect(mocks.applyRouteOptimization).toHaveBeenCalledWith("LIV-TEST-1", ["DN-TEST-1"], 2);
    expect(mocks.calculateRouteItinerary).toHaveBeenCalledWith("LIV-TEST-1", 3);
  });
});
