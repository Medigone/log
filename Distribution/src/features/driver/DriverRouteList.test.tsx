import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DriverRouteList } from "@/features/driver/DriverRouteList";
import type { DistributionRoute, DriverRouteCard, RouteStop } from "@/shared/types/distribution";

function stop(overrides: Partial<RouteStop> & Pick<RouteStop, "deliveryNote" | "customerName" | "status" | "sequence">): RouteStop {
  return {
    customer: "CUST-1",
    customerGpsStatus: "known",
    requiresCustomerGeolocation: false,
    address: "1 rue A",
    phone: "0550000000",
    totalQuantity: 6,
    amountCollected: 0,
    amountToCollect: 12000,
    payments: [],
    invoiceStatus: "Non créée",
    planningStatus: "Planifié",
    commune: "Hydra",
    wilaya: "Alger",
    ...overrides,
  };
}

const programmed: DistributionRoute = {
  name: "LIV-1",
  date: "2026-08-28",
  lifecycle: "En cours",
  plannedStart: "2026-08-28 08:00:00",
  plannedEnd: "2026-08-28 16:00:00",
  revision: 1,
  publishedRevision: 1,
  acknowledgedRevision: 1,
  acknowledged: true,
  needsReview: false,
  totalQuantity: 6,
  totalArticles: 6,
  totalCollected: 0,
  totalAmount: 12000,
  alerts: [],
  routing: {
    status: "ready",
    provider: "openrouteservice",
    profile: "driving-car",
    optimizationEnabled: true,
    distanceMeters: 0,
    durationSeconds: 0,
    stopDurationMinutes: 15,
    stopDurationSeconds: 900,
    totalDurationSeconds: 0,
    geometry: { type: "LineString", coordinates: [] },
    revision: 1,
  },
  stock: { status: "Chargé", loadedQuantity: 6, deliveredQuantity: 0, remainingQuantity: 6, returnedQuantity: 0, lines: [] },
  cash: { routeId: "LIV-1", routeLifecycle: "En cours", status: "Sans encaissement", declaredCash: 0, declaredCheques: 0, declaredTotal: 0, countedTotal: 0, validatedTotal: 0, payments: [] },
  stops: [stop({ deliveryNote: "DN-1", customerName: "Épicerie Nord", status: "Enlevé", sequence: 1 })],
};

const history: DriverRouteCard = {
  name: "LIV-OLD",
  date: "2026-08-20",
  lifecycle: "Terminée",
  plannedStart: "2026-08-20 08:00:00",
  customerLabel: "Client A",
  stopCount: 3,
  totalArticles: 18,
  locationLabel: "Oran · Oran",
};

describe("DriverRouteList", () => {
  it("affiche le compteur sur Programmées seulement, et les cartes avec statut, client, arrêts, articles et lieu", () => {
    render(
      <DriverRouteList
        programmed={[programmed]}
        history={[history]}
        loading={false}
        tab="programmed"
        onTabChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: /programmées/i })).toHaveTextContent("1");
    expect(screen.getByRole("tab", { name: /^historique$/i })).not.toHaveTextContent("1");
    expect(screen.getByText("Épicerie Nord")).toBeInTheDocument();
    expect(screen.getByText("En cours")).toBeInTheDocument();
    expect(screen.getByText("1 arrêt")).toBeInTheDocument();
    expect(screen.getByText("6 articles")).toBeInTheDocument();
    expect(screen.getByText("Hydra · Alger")).toBeInTheDocument();
  });

  it("n’affiche pas le compteur sur l’onglet historique", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(
      <DriverRouteList
        programmed={[programmed]}
        history={[history]}
        loading={false}
        tab="programmed"
        onTabChange={onTabChange}
        onSelect={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /^historique$/i }));
    expect(onTabChange).toHaveBeenCalledWith("history");
  });

  it("ouvre une tournée au tap sur la carte", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DriverRouteList
        programmed={[programmed]}
        history={[]}
        loading={false}
        tab="programmed"
        onTabChange={vi.fn()}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: /tournée liv-1/i }));
    expect(onSelect).toHaveBeenCalledWith("LIV-1");
  });

  it("affiche l’historique une fois l’onglet sélectionné", () => {
    render(
      <DriverRouteList
        programmed={[programmed]}
        history={[history]}
        loading={false}
        tab="history"
        onTabChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Client A")).toBeInTheDocument();
    expect(screen.getByText("Terminée")).toBeInTheDocument();
    expect(screen.getByText("3 arrêts")).toBeInTheDocument();
    expect(screen.getByText("18 articles")).toBeInTheDocument();
    expect(screen.queryByText("Épicerie Nord")).not.toBeInTheDocument();
  });
});
