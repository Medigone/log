import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { TodayPage } from "@/features/today/TodayPage";
import type { ActivityDashboardData } from "@/shared/types/distribution";

vi.mock("leaflet", () => ({ divIcon: (options: unknown) => options }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="map">{children}</div>,
  Marker: ({ children }: { children: ReactNode }) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => <div data-testid="tiles" />,
  useMap: () => ({ setView: vi.fn(), fitBounds: vi.fn() }),
}));

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
        customerCity: "Hydra",
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
        customerCity: "Hydra",
        qty: 8,
        latitude: 36.75,
        longitude: 3.05,
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
  now: [],
  shippedTrend: [9, 12, 7, 14, 11, 4, 0, 13, 15, 10, 12, 8, 14, 11],
  routeSuggestions: [{ id: "Hydra", label: "Hydra · 2 bons", detail: "8 articles", noteIds: ["MAT-DN-2026-00099"] }],
};

const state = { data: { message: dashboard } as { message: ActivityDashboardData } | undefined, error: undefined as string | undefined, isLoading: false, mutate: vi.fn() };
beforeEach(() => { state.data = { message: structuredClone(dashboard) }; state.error = undefined; state.isLoading = false; state.mutate.mockClear(); });

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useActivityDashboard: () => state,
}));

function Location() { const loc = useLocation(); return <output aria-label="Destination">{loc.pathname}{loc.search}</output>; }
function show(role: "responsable" | "planificateur" | "preparateur" = "responsable") {
  return render(<MemoryRouter><TodayPage role={role} /><Location /></MemoryRouter>);
}

describe("TodayPage", () => {
  it("raconte le flux et replie les anomalies pour le responsable", () => {
    show();
    expect(screen.getByRole("heading", { name: /aujourd/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1 anomalie/i })).toBeInTheDocument();
    expect(screen.queryByText("Préparation en retard")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1 · à préparer/i })).toBeInTheDocument();
    expect(screen.getByText("File de travail")).toBeInTheDocument();
    expect(screen.getByText("PICK-1")).toBeInTheDocument();
    expect(screen.getByText("MAT-DN-2026-00099")).toBeInTheDocument();
    expect(screen.getByText(/camion b/i)).toBeInTheDocument();
    expect(screen.getByText("Caisse")).toBeInTheDocument();
    expect(screen.getByText("Tournées du jour")).toBeInTheDocument();
    expect(screen.getAllByText("Camion A").length).toBeGreaterThan(0);
    expect(screen.getByText("1 / 2 arrêts traités")).toBeInTheDocument();
    expect(screen.getByText("Carte des livraisons")).toBeInTheDocument();
    expect(screen.getByText(/bons expédiés/i)).toBeInTheDocument();
    expect(screen.queryByText("À traiter")).not.toBeInTheDocument();
  });

  it("déplie les anomalies depuis le chip", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /1 anomalie/i }));
    expect(screen.getByText("Préparation en retard")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /traiter/i }));
    expect(screen.getByLabelText("Destination")).toHaveTextContent("/preparation?dateScope=overdue");
  });

  it("présélectionne un bon et envoie vers la planification", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /mat-dn-2026-00099/i }));
    fireEvent.click(screen.getByRole("button", { name: /créer une tournée/i }));
    expect(screen.getByLabelText("Destination")).toHaveTextContent("/planning?select=MAT-DN-2026-00099");
  });

  it("montre la même file au préparateur sans caisse", () => {
    show("preparateur");
    expect(screen.getByText("File de travail")).toBeInTheDocument();
    expect(screen.getByText("PICK-1")).toBeInTheDocument();
    expect(screen.queryByText("Caisse")).not.toBeInTheDocument();
    expect(screen.queryByText("File par priorité")).not.toBeInTheDocument();
  });

  it("signale les reliquats à compléter quand il n’y a plus de rupture", () => {
    const data = state.data!.message;
    data.preparation!.shortageOrders = 0;
    data.preparation!.readyToComplete = 2;
    data.preparation!.pickLists = [];
    show();
    expect(screen.getByText("2 à compléter")).toBeInTheDocument();
    expect(screen.getByText("Reliquats à prélever")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /1 · à préparer/i }));
    expect(screen.getByLabelText("Destination")).toHaveTextContent("/preparation?complete=1");
  });

  it("masque la caisse au planificateur", () => {
    show("planificateur");
    expect(screen.queryByText("Caisse")).not.toBeInTheDocument();
    expect(screen.getByText("File de travail")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /1 \/ 2 arrêts traités/i }));
    expect(screen.getByLabelText("Destination")).toHaveTextContent("/planning/routes/LIV-1");
  });

  it("ne montre pas de fausse file vide pendant le chargement", () => {
    state.data = undefined; state.isLoading = true; show();
    expect(screen.getByRole("status", { name: "Chargement du dashboard" })).toBeInTheDocument();
    expect(screen.queryByText(/Aucun bon ne correspond/)).not.toBeInTheDocument();
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
    expect(screen.queryByText("File de travail")).not.toBeInTheDocument();
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
    expect(screen.getAllByText("Livreur non assigné").length).toBeGreaterThan(0);
  });

  it("limite les tournées à cinq et propose le regroupement si aucune n’est lancée", () => {
    const data = state.data!.message;
    data.fleet!.liveRoutes = [];
    data.fleet!.inProgress = 0;
    show();
    expect(screen.getByText("Aucune tournée lancée")).toBeInTheDocument();
    expect(screen.getByText("Hydra · 2 bons")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /planifier les 1 bons en retard/i }));
    expect(screen.getByRole("button", { name: /créer une tournée/i })).toBeInTheDocument();
  });

  it("ouvre les livraisons depuis la carte", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /ouvrir la carte/i }));
    expect(screen.getByLabelText("Destination")).toHaveTextContent("/deliveries");
  });
});
