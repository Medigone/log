import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
  totalCollected: 0,
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
  stock: { status: "À charger", loadedQuantity: 0, deliveredQuantity: 0, remainingQuantity: 0, returnedQuantity: 0, lines: [] },
  cash: { routeId: "LIV-TEST-1", routeLifecycle: "Brouillon", status: "Sans encaissement", declaredCash: 0, declaredCheques: 0, declaredTotal: 0, countedTotal: 0, validatedTotal: 0, payments: [] },
  stops: [{
    deliveryNote: "DN-TEST-1",
    customer: "CUST-1",
    customerName: "Client Test",
    customerGpsStatus: "known",
    requiresCustomerGeolocation: false,
    commune: "Oran",
    latitude: 35.7,
    longitude: -0.6,
    totalQuantity: 2,
    amountCollected: 0,
    amountToCollect: 1500,
    payments: [],
    invoiceStatus: "Non créée",
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
  useRouteDetails: () => ({ data: { message: route }, error: undefined, isLoading: false, isValidating: false, mutate: mocks.mutate }),
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
    render(<MemoryRouter initialEntries={["/planning/routes/LIV-TEST-1"]}><Routes><Route path="/planning/routes/:routeId" element={<RouteDetailsPage />} /></Routes></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "LIV-TEST-1" })).toBeInTheDocument();
    expect(screen.getByText("Carte GPS OSM")).toBeInTheDocument();
    expect(screen.getByText("12 km")).toBeInTheDocument();
    expect(screen.getByText("45 min")).toBeInTheDocument();
    expect(screen.getByText("15 min × 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /optimiser l’ordre/i })).toBeInTheDocument();
    expect(screen.getByText("Renault Test · 001")).toBeInTheDocument();
    expect(screen.getByText("ART-1")).toBeInTheDocument();
    expect(screen.getByText("Aucun paiement saisi pour cet arrêt.")).toBeInTheDocument();
    expect(screen.getByAltText("QR du BL DN-TEST-1")).toBeInTheDocument();
    expect(screen.getByText("2 étiquette(s)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /publier la tournée/i }));
    expect(screen.getByRole("dialog", { name: /publier la tournée/i })).toBeInTheDocument();
    expect(mocks.publishRoute).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /confirmer et publier/i }));
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

  it("affiche l’erreur serveur dans la confirmation de publication", async () => {
    const user = userEvent.setup();
    mocks.publishRoute.mockRejectedValueOnce(new Error("Publication refusée"));
    render(<MemoryRouter initialEntries={["/planning/routes/LIV-TEST-1"]}><Routes><Route path="/planning/routes/:routeId" element={<RouteDetailsPage />} /></Routes></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: /publier la tournée/i }));
    await user.click(screen.getByRole("button", { name: /confirmer et publier/i }));

    const dialog = screen.getByRole("dialog", { name: /publier la tournée/i });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Publication refusée");
  });

  it("autorise la publication avec confirmation mais bloque le routage sans GPS client", async () => {
    const user = userEvent.setup();
    route.stops[0].customerGpsStatus = "missing";
    route.stops[0].requiresCustomerGeolocation = true;
    route.stops[0].latitude = undefined;
    route.stops[0].longitude = undefined;

    render(<MemoryRouter initialEntries={["/planning/routes/LIV-TEST-1"]}><Routes><Route path="/planning/routes/:routeId" element={<RouteDetailsPage />} /></Routes></MemoryRouter>);

    expect(screen.getByText("GPS client à collecter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recalculer l’itinéraire/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /optimiser l’ordre/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /publier la tournée/i }));
    const dialog = screen.getByRole("dialog", { name: /publier la tournée/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/1 client\(s\) sans GPS/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /confirmer et publier/i }));
    expect(mocks.publishRoute).toHaveBeenCalledWith("LIV-TEST-1", 2);

    route.stops[0].customerGpsStatus = "known";
    route.stops[0].requiresCustomerGeolocation = false;
    route.stops[0].latitude = 35.7;
    route.stops[0].longitude = -0.6;
  });

  it("met clairement en évidence un arrêt livré et la progression de la tournée", () => {
    route.lifecycle = "En cours";
    route.totalCollected = 500;
    route.totalAmount = 1000;
    route.stops[0].status = "Livré";
    route.stops[0].amountCollected = 500;
    route.stops[0].amountToCollect = 1000;
    route.stops[0].payments = [{ name: "PAY-1", date: "2026-08-26", method: "Espèce", amount: 500, status: "Déclaré" }];
    route.cash.declaredCash = 500;
    route.cash.declaredTotal = 500;
    route.stops[0].items![0].deliveredQuantity = 2;
    route.stops[0].items![0].remainingQuantity = 0;

    render(<MemoryRouter initialEntries={["/planning/routes/LIV-TEST-1"]}><Routes><Route path="/planning/routes/:routeId" element={<RouteDetailsPage />} /></Routes></MemoryRouter>);

    expect(screen.getByText("1/1")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Arrêts traités" })).toHaveAttribute("aria-valuenow", "1");
    const stopCard = screen.getByRole("article", { name: "Arrêt 1 · Livré" });
    expect(stopCard).toHaveAttribute("data-stop-state", "delivered");
    expect(screen.getByText(/2\/2 article\(s\) livré\(s\)/)).toBeInTheDocument();
    expect(screen.getByText("Mise à jour automatique")).toBeInTheDocument();
    expect(within(stopCard).getByText("Espèce")).toBeInTheDocument();
    expect(within(stopCard).getAllByText("500 DZD")).toHaveLength(2);
    expect(screen.getByText("Encaissements")).toBeInTheDocument();

    route.lifecycle = "Brouillon";
    route.totalCollected = 0;
    route.totalAmount = 1500;
    route.stops[0].status = "Préparé";
    route.stops[0].amountCollected = 0;
    route.stops[0].amountToCollect = 1500;
    route.stops[0].payments = [];
    route.cash.declaredCash = 0;
    route.cash.declaredTotal = 0;
    route.stops[0].items![0].deliveredQuantity = 0;
    route.stops[0].items![0].remainingQuantity = 2;
  });
});
