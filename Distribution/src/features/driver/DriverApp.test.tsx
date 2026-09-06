import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DriverApp } from "@/features/driver/DriverApp";
import type { DistributionRoute, DriverDashboardData, RouteStop } from "@/shared/types/distribution";

vi.mock("leaflet", () => ({ divIcon: (options: unknown) => options }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="route-map">{children}</div>,
  Marker: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Polyline: () => null,
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  useMap: () => ({ setView: vi.fn(), fitBounds: vi.fn() }),
}));

function stop(overrides: Partial<RouteStop> & Pick<RouteStop, "deliveryNote" | "customerName" | "status" | "sequence">): RouteStop {
  return {
    customer: "CUST-1",
    customerGpsStatus: "known",
    requiresCustomerGeolocation: false,
    address: "1 rue A",
    phone: "0550000000",
    totalQuantity: 2,
    commune: "Hydra",
    wilaya: "Alger",
    amountCollected: 0,
    amountToCollect: 12000,
    payments: [],
    invoiceStatus: "Non créée",
    planningStatus: "Planifié",
    ...overrides,
  };
}

function makeRoute(overrides: Partial<DistributionRoute>): DistributionRoute {
  return {
    name: "LIV-1",
    date: "2026-08-25",
    lifecycle: "En cours",
    plannedStart: "2026-08-25 08:00:00",
    plannedEnd: "2026-08-25 16:00:00",
    revision: 3,
    publishedRevision: 3,
    acknowledgedRevision: 3,
    acknowledged: true,
    needsReview: false,
    driver: "DRV-1",
    driverName: "Karim",
    vehicle: "VEH-1",
    vehicleLabel: "Renault · 16-123-16",
    vehicleCapacity: 20,
    totalQuantity: 4,
    totalArticles: 4,
    totalCollected: 0,
    totalAmount: 18000,
    alerts: [],
    depot: { name: "Dépôt", label: "Dépôt", latitude: 36.7, longitude: 3.0, isDefault: true },
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
      geometry: { type: "LineString", coordinates: [] },
      revision: 3,
    },
    stock: { status: "Chargé", loadedQuantity: 4, deliveredQuantity: 2, remainingQuantity: 2, returnedQuantity: 0, lines: [] },
    cash: { routeId: "LIV-1", routeLifecycle: "En cours", status: "Sans encaissement", declaredCash: 0, declaredCheques: 0, declaredTotal: 0, countedTotal: 0, validatedTotal: 0, payments: [] },
    stops: [
      stop({
        deliveryNote: "DN-1",
        customer: "CUST-1",
        customerName: "Client A",
        amountCollected: 6000,
        amountToCollect: 0,
        invoiceStatus: "Créée",
        status: "Livré",
        planningStatus: "Terminé",
        sequence: 1,
      }),
      stop({
        deliveryNote: "DN-8",
        customer: "CUST-8",
        customerName: "Épicerie Nord",
        address: "12 rue des Oliviers",
        phone: "0550000000",
        status: "Enlevé",
        planningStatus: "En cours",
        sequence: 8,
      }),
    ],
    ...overrides,
  };
}

const mocks = vi.hoisted(() => ({
  logout: vi.fn().mockResolvedValue(undefined),
  mutate: vi.fn().mockResolvedValue(undefined),
  mutateDashboard: vi.fn().mockResolvedValue(undefined),
  mutateOpenRoute: vi.fn().mockResolvedValue(undefined),
  completeStop: vi.fn(),
  startRoute: vi.fn(),
  loadRoute: vi.fn(),
  acknowledgeRoute: vi.fn(),
  declareRouteReturn: vi.fn(),
  selectNextDeliveryStop: vi.fn().mockResolvedValue({}),
  current: null as DistributionRoute | null,
  fetchedRoute: null as DistributionRoute | null,
  history: [] as Array<{
    name: string;
    date: string;
    lifecycle: string;
    customerLabel: string;
    stopCount: number;
    totalArticles: number;
    locationLabel: string;
  }>,
}));

const inProgressRoute = makeRoute({});
const publishedRoute = makeRoute({
  lifecycle: "Publiée",
  stock: { status: "À charger", loadedQuantity: 0, deliveredQuantity: 0, remainingQuantity: 0, returnedQuantity: 0, lines: [] },
  cash: { routeId: "LIV-1", routeLifecycle: "Publiée", status: "Sans encaissement", declaredCash: 0, declaredCheques: 0, declaredTotal: 0, countedTotal: 0, validatedTotal: 0, payments: [] },
  stops: [
    stop({ deliveryNote: "DN-1", customerName: "Client A", status: "Préparé", sequence: 1 }),
    stop({ deliveryNote: "DN-2", customerName: "Client B", status: "Préparé", sequence: 2 }),
  ],
});

const dashboard: DriverDashboardData = {
  date: "2026-08-25",
  driver: { name: "DRV-1", label: "Karim", vehicle: "Renault · 16-123-16" },
  kpis: {
    plannedStops: 2,
    completedStops: 1,
    deliveredStops: 1,
    failedStops: 0,
    remainingStops: 1,
    plannedRoutes: 1,
    amountCollected: 6000,
    amountToCollect: 12000,
  },
  cash: {
    balance: 45000,
    declaredCash: 6000,
    declaredCheques: 0,
    declaredTotal: 6000,
    status: "À contrôler",
    updatedAt: "2026-08-25 10:00:00",
    movements: [],
  },
  routes: [{
    name: "LIV-1",
    lifecycle: "En cours",
    plannedStart: "2026-08-25 08:00:00",
    plannedEnd: "2026-08-25 16:00:00",
    vehicle: "VEH-1",
    vehicleLabel: "Renault · 16-123-16",
    stopsTotal: 2,
    stopsDone: 1,
    stopsRemaining: 1,
    collected: 6000,
    toCollect: 12000,
    cashStatus: "À contrôler",
  }],
  nextStop: {
    deliveryNote: "DN-8",
    routeId: "LIV-1",
    sequence: 8,
    customer: "CUST-8",
    customerName: "Épicerie Nord",
    address: "12 rue des Oliviers",
    amountToCollect: 12000,
    status: "Enlevé",
  },
  week: {
    from: "2026-08-19",
    to: "2026-08-25",
    deliveredStops: 1,
    plannedStops: 2,
    collected: 6000,
    days: [{ date: "2026-08-25", plannedStops: 2, deliveredStops: 1, collected: 6000 }],
  },
};

vi.mock("frappe-react-sdk", () => ({
  useFrappeAuth: () => ({ logout: mocks.logout }),
}));

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useDriverRouteBoard: () => ({
    data: {
      message: {
        programmed: mocks.current ? [mocks.current] : [],
        history: mocks.history,
        programmedCount: mocks.current ? 1 : 0,
      },
    },
    error: undefined,
    isLoading: false,
    mutate: mocks.mutate,
  }),
  useDriverRoute: (routeId?: string) => ({
    data: { message: routeId && mocks.fetchedRoute?.name === routeId ? mocks.fetchedRoute : null },
    error: undefined,
    isLoading: false,
    mutate: mocks.mutateOpenRoute,
  }),
  useDriverDashboard: () => ({ data: { message: dashboard }, error: undefined, isLoading: false, mutate: mocks.mutateDashboard }),
  useDistributionMutations: () => ({
    completeStop: mocks.completeStop,
    startRoute: mocks.startRoute,
    loadRoute: mocks.loadRoute,
    acknowledgeRoute: mocks.acknowledgeRoute,
    declareRouteReturn: mocks.declareRouteReturn,
    selectNextDeliveryStop: mocks.selectNextDeliveryStop,
    saving: false,
    fulfillment: false,
    selectingStop: false,
  }),
}));

async function scanDeliveryNote(user: ReturnType<typeof userEvent.setup>, deliveryNote: string) {
  await user.click(screen.getByRole("button", { name: /^scanner$/i }));
  await user.clear(screen.getByPlaceholderText("BL-00001"));
  await user.type(screen.getByPlaceholderText("BL-00001"), deliveryNote);
  await user.click(screen.getByRole("button", { name: /vérifier le bon/i }));
}

async function openListedRoute(user: ReturnType<typeof userEvent.setup>, name = "LIV-1") {
  await user.click(screen.getByRole("button", { name: new RegExp(`tournée ${name}`, "i") }));
}

describe("DriverApp", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.current = structuredClone(inProgressRoute);
    mocks.fetchedRoute = null;
    mocks.history = [
      {
        name: "LIV-OLD",
        date: "2026-08-20",
        lifecycle: "Terminée",
        customerLabel: "Client Hier",
        stopCount: 3,
        totalArticles: 18,
        locationLabel: "Oran · Oran",
      },
    ];
    mocks.loadRoute.mockReset();
    mocks.startRoute.mockReset();
    mocks.selectNextDeliveryStop.mockReset().mockResolvedValue({});
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: vi.fn() },
    });
  });

  it("affiche d’abord la liste Programmées avec le compteur, sans le select", () => {
    render(<DriverApp />);

    expect(screen.getByRole("navigation", { name: /navigation livreur/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^tournée$/i })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: /^accueil$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/tournée du jour/i)).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /programmées/i })).toHaveTextContent("1");
    expect(screen.getByRole("tab", { name: /^historique$/i })).not.toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /tournée liv-1/i })).toBeInTheDocument();
    expect(screen.queryByText(/arrêt en cours/i)).not.toBeInTheDocument();
  });

  it("ouvre la tournée sur la liste des restants, sans imposer le prochain arrêt", async () => {
    const user = userEvent.setup();
    render(<DriverApp />);
    await openListedRoute(user);

    expect(screen.queryByText(/arrêt en cours/i)).not.toBeInTheDocument();
    expect(screen.getByText(/1 arrêt restant/i)).toBeInTheDocument();
    expect(screen.getByText(/^encaissé$/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /à livrer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /livrer épicerie nord/i })).toBeEnabled();
    expect(screen.getByText(/client a/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /traiter cet arrêt/i })).not.toBeInTheDocument();
  });

  it("revient à la liste via le bouton retour ou un second tap sur Tournée", async () => {
    const user = userEvent.setup();
    render(<DriverApp />);
    await openListedRoute(user);
    expect(screen.getByRole("heading", { name: /à livrer/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retour aux tournées/i }));
    expect(screen.queryByRole("heading", { name: /à livrer/i })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /programmées/i })).toBeInTheDocument();

    await openListedRoute(user);
    await user.click(screen.getByRole("button", { name: /^tournée$/i }));
    expect(screen.queryByRole("heading", { name: /à livrer/i })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /programmées/i })).toBeInTheDocument();
  });

  it("ouvre l’onglet carte avec la progression de la tournée", async () => {
    const user = userEvent.setup();
    render(<DriverApp />);
    await user.click(screen.getByRole("button", { name: /^carte$/i }));
    expect(screen.getAllByText(/1 \/ 2/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /recentrer/i })).toBeInTheDocument();
    expect(screen.getByText(/choisissez le prochain client/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /livrer épicerie nord/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /traiter cet arrêt/i })).not.toBeInTheDocument();
  });

  it("ouvre l’assistant après le choix d’un arrêt restant", async () => {
    const user = userEvent.setup();
    render(<DriverApp />);
    await openListedRoute(user);
    await user.click(screen.getByRole("button", { name: /livrer épicerie nord/i }));
    expect(mocks.selectNextDeliveryStop).toHaveBeenCalledWith("LIV-1", "DN-8", 3);
    expect(await screen.findByText(/résultat de l’arrêt/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /livré en totalité/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continuer/i })).not.toBeInTheDocument();
  });

  it("affiche le bilan caisse sans dupliquer le prochain arrêt", async () => {
    const user = userEvent.setup();
    render(<DriverApp />);
    await user.click(screen.getByRole("button", { name: /^bilan$/i }));
    expect(screen.getByText(/à remettre au dépôt/i)).toBeInTheDocument();
    expect(screen.getByText(/rapprochement/i)).toBeInTheDocument();
    expect(screen.getByText(/la remise se fait au dépôt avec le caissier/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /traiter cet arrêt/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/caisse et activité/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/arrêts traités/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Client A")).not.toBeInTheDocument();
  });

  it("remet à zéro le montant à remettre une fois la caisse validée", async () => {
    mocks.current = makeRoute({
      cash: {
        ...inProgressRoute.cash,
        status: "Validée",
        declaredCash: 6000,
        declaredTotal: 6000,
        countedTotal: 6000,
        validatedTotal: 6000,
      },
    });
    const user = userEvent.setup();
    render(<DriverApp />);
    await user.click(screen.getByRole("button", { name: /^bilan$/i }));
    const header = screen.getByText(/à remettre au dépôt/i).closest("header");
    expect(header).toHaveTextContent(/caisse validée/i);
    expect(header?.querySelector("p.num")).toHaveTextContent(/0\s*DZD/);
    expect(screen.getByText(/encaissé sur 1 arrêts/i)).toBeInTheDocument();
  });

  it("affiche le bilan de remise même si la tournée n’est plus programmée", async () => {
    mocks.current = null;
    mocks.fetchedRoute = structuredClone(inProgressRoute);
    const user = userEvent.setup();
    render(<DriverApp />);
    await user.click(screen.getByRole("button", { name: /^bilan$/i }));
    expect(screen.getByText(/à remettre au dépôt/i)).toBeInTheDocument();
    expect(screen.getByText(/rapprochement/i)).toBeInTheDocument();
    expect(screen.queryByText(/caisse et activité/i)).not.toBeInTheDocument();
  });

  it("n’affiche pas Traiter tant que la tournée est publiée", async () => {
    mocks.current = structuredClone(publishedRoute);
    const user = userEvent.setup();
    render(<DriverApp />);
    await openListedRoute(user);
    expect(screen.queryByRole("button", { name: /traiter cet arrêt/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /vérifier, charger et démarrer/i })).not.toBeInTheDocument();
    expect(screen.getByText(/contrôle départ/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /scanner un bl/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /charger le véhicule/i })).toBeDisabled();
  });

  it("coche un BL scanné et indique le nombre restant", async () => {
    mocks.current = structuredClone(publishedRoute);
    const user = userEvent.setup();
    render(<DriverApp />);
    await scanDeliveryNote(user, "DN-1");
    expect(screen.getByText("BL vérifié, 1 restant.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /client a/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("propose le chargement après le dernier BL scanné", async () => {
    mocks.current = structuredClone(publishedRoute);
    const user = userEvent.setup();
    render(<DriverApp />);
    await scanDeliveryNote(user, "DN-1");
    await scanDeliveryNote(user, "DN-2");
    expect(screen.getByText(/tous les bons sont vérifiés/i)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/transférer la marchandise dans le véhicule/i)).toBeInTheDocument();
  });

  it("propose le départ une fois le véhicule chargé", async () => {
    mocks.current = structuredClone({
      ...publishedRoute,
      stock: { ...publishedRoute.stock, status: "Chargé", loadedQuantity: 4, remainingQuantity: 4 },
    });
    const user = userEvent.setup();
    render(<DriverApp />);
    await scanDeliveryNote(user, "DN-1");
    expect(screen.getByText(/démarrez la tournée pour livrer/i)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/vous pourrez alors livrer et encaisser/i)).toBeInTheDocument();
  });

  it("ouvre Traiter au scan d’un arrêt en cours", async () => {
    const user = userEvent.setup();
    render(<DriverApp />);
    await scanDeliveryNote(user, "DN-8");
    expect(mocks.selectNextDeliveryStop).toHaveBeenCalledWith("LIV-1", "DN-8", 3);
    expect(await screen.findByText(/résultat de l’arrêt/i)).toBeInTheDocument();
  });

  it("n’ouvre pas l’assistant au scan d’un BL déjà livré", async () => {
    const user = userEvent.setup();
    render(<DriverApp />);
    await scanDeliveryNote(user, "DN-1");
    expect(screen.getByText(/déjà livré/i)).toBeInTheDocument();
    expect(screen.queryByText(/résultat de l’arrêt/i)).not.toBeInTheDocument();
  });

  it("appelle loadRoute après confirmation du chargement", async () => {
    mocks.current = structuredClone(publishedRoute);
    mocks.loadRoute.mockResolvedValue({});
    const user = userEvent.setup();
    render(<DriverApp />);
    await openListedRoute(user);
    await user.click(screen.getByRole("button", { name: /client a/i }));
    await user.click(screen.getByRole("button", { name: /client b/i }));
    await user.click(screen.getByRole("button", { name: /charger le véhicule/i }));
    await user.click(screen.getByRole("button", { name: /confirmer le chargement/i }));
    expect(mocks.loadRoute).toHaveBeenCalledWith("LIV-1", 3, expect.arrayContaining(["DN-1", "DN-2"]));
  });

  it("affiche le retour déclaré sans bouton après une tournée clôturée avec reliquat", async () => {
    mocks.current = structuredClone(
      makeRoute({
        lifecycle: "Retour dépôt",
        stock: {
          status: "Retour déclaré",
          loadedQuantity: 4,
          deliveredQuantity: 2,
          remainingQuantity: 2,
          returnedQuantity: 0,
          lines: [],
        },
        stops: [
          stop({
            deliveryNote: "DN-1",
            customerName: "Client A",
            status: "Livré",
            planningStatus: "Terminé",
            sequence: 1,
          }),
          stop({
            deliveryNote: "DN-8",
            customerName: "Épicerie Nord",
            status: "Partiellement Livré",
            planningStatus: "Terminé",
            sequence: 8,
          }),
        ],
      }),
    );
    const user = userEvent.setup();
    render(<DriverApp />);
    await openListedRoute(user);
    expect(screen.getByRole("heading", { name: /retour au dépôt requis/i })).toBeInTheDocument();
    expect(screen.getByText(/retour déclaré · contrôle entrepôt en attente/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /déclarer mon retour/i })).not.toBeInTheDocument();
  });

  it("conserve le bouton de rattrapage si le retour est encore requis", async () => {
    mocks.current = structuredClone(
      makeRoute({
        lifecycle: "Retour dépôt",
        stock: {
          status: "Retour requis",
          loadedQuantity: 4,
          deliveredQuantity: 2,
          remainingQuantity: 2,
          returnedQuantity: 0,
          lines: [],
        },
        stops: [
          stop({
            deliveryNote: "DN-1",
            customerName: "Client A",
            status: "Livré",
            planningStatus: "Terminé",
            sequence: 1,
          }),
          stop({
            deliveryNote: "DN-8",
            customerName: "Épicerie Nord",
            status: "Partiellement Livré",
            planningStatus: "Terminé",
            sequence: 8,
          }),
        ],
      }),
    );
    const user = userEvent.setup();
    render(<DriverApp />);
    await openListedRoute(user);
    expect(screen.getByRole("heading", { name: /retour au dépôt requis/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /déclarer mon retour/i })).toBeEnabled();
  });
});
