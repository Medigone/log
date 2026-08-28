import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TodayPage } from "@/features/today/TodayPage";
import type { ActivityDashboardData } from "@/shared/types/distribution";

const dashboard: ActivityDashboardData = {
  date: "2026-08-28",
  role: "responsable",
  pipeline: { toPrepare: 4, toPlan: 2, toDispatch: 1, live: 1, returning: 0, cashier: 1 },
  preparation: {
    toPick: 4,
    overdue: 1,
    today: 2,
    later: 1,
    inProgressPickLists: 1,
    remainingQty: 12,
    shortageOrders: 1,
    pickLists: [{ name: "PICK-1", salesOrderCount: 2, remainingQty: 3 }],
  },
  fulfillment: {
    toLoad: 1,
    loaded: 1,
    returnsPending: 0,
    toLoadRoutes: [{ name: "LIV-LOAD", vehicleLabel: "Camion B", driverName: "Samir", loadingStatus: "À charger" }],
    returnRoutes: [],
  },
  fleet: {
    published: 0,
    inProgress: 1,
    returning: 0,
    doneStops: 1,
    remainingStops: 1,
    failedStops: 0,
    liveRoutes: [{
      name: "LIV-1",
      date: "2026-08-28",
      lifecycle: "En cours",
      driverName: "Karim",
      vehicleLabel: "Camion A",
      doneStops: 1,
      remainingStops: 1,
      failedStops: 0,
      stops: [
        { deliveryNote: "DN-2", customerName: "Client A", status: "Livré", sequence: 1, latitude: 36.7, longitude: 3.0 },
        { deliveryNote: "DN-3", customerName: "Client B", status: "Préparé", sequence: 2, latitude: 36.8, longitude: 3.1 },
      ],
      nextStop: { deliveryNote: "DN-3", customerName: "Client B", status: "Préparé" },
    }],
  },
  planning: { unassigned: 2, overdue: 1 },
  dispatch: {
    ready: 1,
    unassigned: 0,
    waitingLoad: 1,
    overdue: 1,
    notes: [{
      deliveryNote: "MAT-DN-2026-00003",
      customerName: "Client A",
      requestedDate: "2026-08-26",
      lifecycle: "Préparé",
      routeId: "LIV-26-08-00002",
      routeDate: "2026-08-26",
      routeLifecycle: "Publiée",
      loadingStatus: "À charger",
    }],
  },
  stock: { onRoute: 1, loaded: 2, empty: 3, missingWarehouse: 0 },
  payments: {
    toControl: 1,
    discrepancies: 0,
    declaredToday: 12000,
    pendingPayments: 2,
    driverCashTotal: 45000,
    driverCashBoxes: 3,
  },
  alerts: [{ id: "prep-overdue", tone: "danger", title: "Préparation en retard", detail: "1 commande", target: "/preparation" }],
  now: [
    { id: "pick-PICK-1", kind: "pick", title: "Prélèvement PICK-1", detail: "2 commandes · 3 restant(s)", tone: "info", target: "/preparation" },
    { id: "route-LIV-1", kind: "route", title: "Camion A", detail: "Karim · Client B", tone: "success", target: "/planning/routes/LIV-1" },
  ],
};

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useActivityDashboard: () => ({
    data: { message: dashboard },
    error: undefined,
    isLoading: false,
  }),
}));

vi.mock("@/features/today/FleetMap", () => ({
  FleetMap: () => <div>Carte flotte</div>,
}));

describe("TodayPage", () => {
  it("affiche le pipeline global et les paiements pour le responsable", () => {
    render(
      <MemoryRouter>
        <TodayPage role="responsable" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /tableau de bord/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /à préparer/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /prêts à expédier/i }).length).toBeGreaterThan(0);
    expect(screen.getByText("MAT-DN-2026-00003")).toBeInTheDocument();
    expect(screen.getByText("Suivi des livraisons")).toBeInTheDocument();
    expect(screen.getByText("Carte flotte")).toBeInTheDocument();
    expect(screen.getAllByText("Camion A").length).toBeGreaterThan(0);
    expect(screen.getByText("1 / 2 arrêts")).toBeInTheDocument();
    expect(screen.getByText("Paiements")).toBeInTheDocument();
    expect(screen.getByText("Stock véhicules")).toBeInTheDocument();
    expect(screen.getByText("En cours maintenant")).toBeInTheDocument();
  });

  it("montre la charge restante au préparateur sans caisse ni carte", () => {
    render(
      <MemoryRouter>
        <TodayPage role="preparateur" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /tableau de bord/i })).toBeInTheDocument();
    expect(screen.getByText("File par priorité")).toBeInTheDocument();
    expect(screen.getByText("Alertes stock")).toBeInTheDocument();
    expect(screen.getByText(/PICK-1/)).toBeInTheDocument();
    expect(screen.getByText(/à charger · camion b/i)).toBeInTheDocument();
    expect(screen.getByText("MAT-DN-2026-00003")).toBeInTheDocument();
    expect(screen.queryByText("Suivi des livraisons")).not.toBeInTheDocument();
    expect(screen.queryByText("Carte flotte")).not.toBeInTheDocument();
    expect(screen.queryByText("Paiements")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /bl à planifier/i })).not.toBeInTheDocument();
  });
});
