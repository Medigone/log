import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
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
    ready: 2,
    unassigned: 1,
    waitingLoad: 1,
    overdue: 1,
    notes: [
      {
        deliveryNote: "MAT-DN-2026-00003",
        customerName: "Client A",
        requestedDate: "2026-08-26",
        lifecycle: "Préparé",
        routeId: "LIV-26-08-00002",
        routeDate: "2026-08-26",
        routeLifecycle: "Publiée",
        loadingStatus: "À charger",
      },
      {
        deliveryNote: "MAT-DN-2026-00099",
        customerName: "Client B",
        requestedDate: "2026-08-20",
        lifecycle: "Préparé",
      },
    ],
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
  alerts: [{ id: "prep-overdue", tone: "danger", title: "Préparation en retard", detail: "1 commande", target: "/preparation?dateScope=overdue" }],
  now: [
    { id: "pick-PICK-1", kind: "pick", title: "Prélèvement PICK-1", detail: "2 commandes · 3 restant(s)", tone: "info", target: "/preparation" },
    { id: "route-LIV-1", kind: "route", title: "Camion A", detail: "Karim · Client B", tone: "success", target: "/planning/routes/LIV-1" },
  ],
};

const state = { data: { message: dashboard } as { message: ActivityDashboardData } | undefined, error: undefined as string | undefined, isLoading: false, mutate: vi.fn() };
beforeEach(() => { state.data = { message: structuredClone(dashboard) }; state.error = undefined; state.isLoading = false; state.mutate.mockClear(); });

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useActivityDashboard: () => state,
}));

describe("TodayPage", () => {
  it("montre les exceptions et les files à traiter pour le responsable", () => {
    render(
      <MemoryRouter>
        <TodayPage role="responsable" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /aujourd/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /préparation en retard/i })).toBeInTheDocument();
    expect(screen.getByText("À traiter")).toBeInTheDocument();
    expect(screen.getByText("PICK-1")).toBeInTheDocument();
    expect(screen.getByText("MAT-DN-2026-00099")).toBeInTheDocument();
    expect(screen.getByText(/à charger · camion b/i)).toBeInTheDocument();
    expect(screen.getByText("Caisse à contrôler")).toBeInTheDocument();
    expect(screen.getByText("Tournées du jour")).toBeInTheDocument();
    expect(screen.getByText("Camion A")).toBeInTheDocument();
    expect(screen.getByText("1 / 2 arrêts traités")).toBeInTheDocument();
    expect(screen.queryByText("Paiements")).not.toBeInTheDocument();
    expect(screen.queryByText("Stock véhicules")).not.toBeInTheDocument();
    expect(screen.queryByText("Carte flotte")).not.toBeInTheDocument();
    expect(screen.queryByText("Suivi des livraisons")).not.toBeInTheDocument();
    expect(screen.queryByText("En cours maintenant")).not.toBeInTheDocument();
    expect(screen.queryByText("Prêts à expédier")).not.toBeInTheDocument();
  });

  it("montre la charge restante au préparateur sans caisse ni carte", () => {
    render(
      <MemoryRouter>
        <TodayPage role="preparateur" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /aujourd/i })).toBeInTheDocument();
    expect(screen.getByText("File par priorité")).toBeInTheDocument();
    expect(screen.getByText(/à charger · camion b/i)).toBeInTheDocument();
    expect(screen.queryByText("Alertes stock")).not.toBeInTheDocument();
    expect(screen.queryByText("MAT-DN-2026-00003")).not.toBeInTheDocument();
    expect(screen.queryByText("Tournées du jour")).not.toBeInTheDocument();
    expect(screen.queryByText("Paiements")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /bl à planifier/i })).not.toBeInTheDocument();
  });
});

function Location() { const loc = useLocation(); return <output aria-label="Destination">{loc.pathname}{loc.search}</output>; }
function show(role: "responsable" | "planificateur" | "preparateur" = "responsable") {
  return render(<MemoryRouter><TodayPage role={role} /><Location /></MemoryRouter>);
}
it("priorise l’affectation du planificateur sans caisse", () => {
  show("planificateur");
  expect(screen.queryByText("Caisse à contrôler")).not.toBeInTheDocument();
  expect(screen.getByText(/bons sans tournée en retard/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Camion A/ }));
  expect(screen.getByLabelText("Destination")).toHaveTextContent("/planning/routes/LIV-1");
});
it("ne montre pas de fausse file vide pendant le chargement", () => {
  state.data = undefined; state.isLoading = true; show();
  expect(screen.getByRole("status", { name: "Chargement du dashboard" })).toBeInTheDocument();
  expect(screen.queryByText(/Rien à traiter/)).not.toBeInTheDocument();
});
it("permet de réessayer après une erreur", () => {
  state.error = "Indisponible"; show();
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  expect(state.mutate).toHaveBeenCalledOnce();
  expect(screen.queryByText("Camion A")).not.toBeInTheDocument();
});
it("distingue une réponse absente d’une file vide", () => {
  state.data = undefined; show();
  expect(screen.getByText("Aucune donnée disponible")).toBeInTheDocument();
  expect(screen.queryByText(/Rien à traiter/)).not.toBeInTheDocument();
});
it("affiche une file vide après une réponse réussie", () => {
  state.data = { message: { date: dashboard.date, role: "responsable" } }; show();
  expect(screen.getByText("Rien à traiter pour le moment.")).toBeInTheDocument();
});
it("sépare échec, livraison réussie et progression", () => {
  const route = state.data!.message.fleet!.liveRoutes[0];
  route.driverName = null; route.stops[1].status = "Non livré"; show();
  expect(screen.getByText("2 / 2 arrêts traités")).toBeInTheDocument();
  expect(screen.getByText("1 livrés")).toBeInTheDocument();
  expect(screen.getByText("1 échec(s)")).toBeInTheDocument();
  expect(screen.getByText("Livreur non assigné")).toBeInTheDocument();
});
it("limite les tournées et prélèvements à cinq et garde les accès complets", () => {
  const data = state.data!.message;
  data.fleet!.liveRoutes = Array.from({ length: 7 }, (_, i) => ({ ...data.fleet!.liveRoutes[0], name: `route-${i}`, vehicleLabel: `Véhicule ${i}` }));
  data.preparation!.pickLists = Array.from({ length: 7 }, (_, i) => ({ name: `PICK-${i}`, remainingQty: 2, salesOrderCount: 1 }));
  show();
  expect(screen.queryByText("Véhicule 5")).not.toBeInTheDocument();
  expect(screen.queryByText("PICK-5")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Livraisons" }));
  expect(screen.getByLabelText("Destination")).toHaveTextContent("/deliveries");
});
it("ouvre la page filtrée depuis une alerte", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: /préparation en retard/i }));
  expect(screen.getByLabelText("Destination")).toHaveTextContent("/preparation?dateScope=overdue");
});
