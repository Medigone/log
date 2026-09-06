import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { CashierPage } from "@/features/cashier/CashierPage";
import type { DistributionRoute } from "@/shared/types/distribution";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn().mockResolvedValue(undefined),
  routes: [] as DistributionRoute[],
}));

function cash(overrides: Partial<DistributionRoute["cash"]> & { status: string }): DistributionRoute["cash"] {
  return {
    routeId: "LIV-1",
    routeLifecycle: "Contrôle caisse",
    declaredCash: 0,
    declaredCheques: 0,
    declaredTotal: 0,
    countedTotal: 0,
    validatedTotal: 0,
    payments: [],
    ...overrides,
  };
}

function route(overrides: Partial<DistributionRoute> & Pick<DistributionRoute, "name">): DistributionRoute {
  return {
    date: "2026-08-25",
    lifecycle: "Contrôle caisse",
    revision: 1,
    publishedRevision: 1,
    acknowledgedRevision: 1,
    acknowledged: true,
    needsReview: false,
    driver: "DRV-1",
    driverName: "Livreur Test",
    vehicle: "VEH-1",
    vehicleLabel: "CAM-04",
    totalQuantity: 0,
    totalArticles: 0,
    totalCollected: 0,
    totalAmount: 0,
    stops: [],
    routing: {
      status: "idle",
      provider: "",
      profile: "",
      optimizationEnabled: false,
      distanceMeters: 0,
      durationSeconds: 0,
      stopDurationMinutes: 0,
      stopDurationSeconds: 0,
      totalDurationSeconds: 0,
      geometry: { type: "LineString", coordinates: [] },
      revision: 1,
    },
    stock: { status: "Chargé", loadedQuantity: 0, deliveredQuantity: 0, remainingQuantity: 0, returnedQuantity: 0, lines: [] },
    cash: cash({ status: "À contrôler", declaredCash: 1500, declaredTotal: 1500, routeId: overrides.name }),
    alerts: [],
    ...overrides,
  } as DistributionRoute;
}

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useCashierRoutes: () => ({ data: { message: mocks.routes }, error: undefined, isLoading: false, mutate: mocks.mutate }),
  useCashierReconciliation: () => ({ data: undefined, error: undefined, isLoading: false, mutate: mocks.mutate }),
  useDistributionMutations: () => ({ validateCashReconciliation: vi.fn(), cashier: false }),
}));

function DetailStub() {
  const { routeId } = useParams();
  return <p>Détail {routeId}</p>;
}

function renderList(entry = "/cashier") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/cashier" element={<CashierPage />} />
        <Route path="/cashier/:routeId" element={<DetailStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CashierPage", () => {
  it("affiche une ligne par tournée sans ouvrir de formulaire", () => {
    mocks.routes = [
      route({ name: "LIV-CASH-1" }),
      route({
        name: "LIV-CASH-2",
        driverName: "Autre livreur",
        cash: cash({ status: "Validée", declaredCash: 800, declaredTotal: 800, routeId: "LIV-CASH-2" }),
      }),
    ];
    renderList();
    expect(screen.getByRole("heading", { name: /caisse des tournées/i })).toBeInTheDocument();
    expect(screen.getByText("LIV-CASH-1")).toBeInTheDocument();
    expect(screen.getByText("LIV-CASH-2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /valider le contrôle de caisse/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /tournée/i })).not.toBeInTheDocument();
  });

  it("ouvre le détail au clic d’une ligne", async () => {
    mocks.routes = [route({ name: "LIV-CASH-1" })];
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByText("LIV-CASH-1"));
    expect(screen.getByText("Détail LIV-CASH-1")).toBeInTheDocument();
  });

  it("filtre les lignes via les chips d’état", async () => {
    mocks.routes = [
      route({ name: "LIV-CASH-1" }),
      route({
        name: "LIV-CASH-2",
        cash: cash({ status: "Validée", declaredCash: 800, declaredTotal: 800, routeId: "LIV-CASH-2" }),
      }),
    ];
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: /validée/i }));
    expect(screen.queryByText("LIV-CASH-1")).not.toBeInTheDocument();
    expect(screen.getByText("LIV-CASH-2")).toBeInTheDocument();
  });

  it("préremplit le chip depuis ?status=", () => {
    mocks.routes = [
      route({ name: "LIV-CASH-1" }),
      route({
        name: "LIV-CASH-2",
        cash: cash({ status: "Écart", declaredCash: 200, declaredTotal: 200, countedTotal: 100, routeId: "LIV-CASH-2" }),
      }),
    ];
    renderList("/cashier?status=Écart");
    expect(screen.queryByText("LIV-CASH-1")).not.toBeInTheDocument();
    expect(screen.getByText("LIV-CASH-2")).toBeInTheDocument();
  });
});
