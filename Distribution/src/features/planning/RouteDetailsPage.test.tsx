import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { RouteDetailsPage } from "@/features/planning/RouteDetailsPage";
import type { DistributionRoute, RouteStop } from "@/shared/types/distribution";

const mocks = vi.hoisted(() => ({
  publishRoute: vi.fn().mockResolvedValue({}),
  generateQrCode: vi.fn().mockResolvedValue({}),
  calculateRouteItinerary: vi.fn().mockResolvedValue({}),
  proposeRouteOptimization: vi.fn(),
  applyRouteOptimization: vi.fn(),
  reorderRouteStops: vi.fn(),
  deleteDraftRoute: vi.fn().mockResolvedValue({ success: true, routeId: "LIV-TEST-1" }),
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
    reorderRouteStops: mocks.reorderRouteStops,
    deleteDraftRoute: mocks.deleteDraftRoute,
    saving: false,
    routing: false,
    accounting: false,
  }),
}));
vi.mock("@/features/planning/RouteMap", () => ({ RouteMap: () => <div>Carte GPS OSM</div> }));

vi.mock("@/components/reui/sortable", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/reui/sortable")>();
  return {
    ...actual,
    Sortable: (props: any) => (
      <>
        <actual.Sortable {...props} />
        {props.value.length > 1 && String(props.className || "").includes("is-reorderable") ? (
          <button
            type="button"
            onClick={() => {
              const previousValue = props.value;
              props.onValueCommit?.([...previousValue].reverse(), {
                previousValue,
                activeIndex: 0,
                overIndex: previousValue.length - 1,
                event: {},
              });
            }}
          >
            Simuler le réordonnancement
          </button>
        ) : null}
      </>
    ),
  };
});

function extraStop(overrides: Partial<RouteStop> = {}): RouteStop {
  return {
    ...route.stops[0],
    deliveryNote: "DN-TEST-2",
    customer: "CUST-2",
    customerName: "Client Bis",
    sequence: 2,
    items: [
      {
        name: "ROW-2",
        itemCode: "ART-2",
        itemName: "Article Bis",
        quantity: 1,
        deliveredQuantity: 0,
        remainingQuantity: 1,
      },
    ],
    ...overrides,
  };
}

function SearchProbe() {
  const [params] = useSearchParams();
  return <span data-testid="search-params">{params.toString()}</span>;
}

function renderDetails(entry = "/planning/routes/LIV-TEST-1") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/planning" element={<div>Planning</div>} />
        <Route
          path="/planning/routes/:routeId"
          element={
            <>
              <SearchProbe />
              <RouteDetailsPage />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RouteDetailsPage", () => {
  beforeEach(() => {
    mocks.publishRoute.mockClear();
    mocks.generateQrCode.mockClear();
    mocks.calculateRouteItinerary.mockClear();
    mocks.proposeRouteOptimization.mockClear();
    mocks.applyRouteOptimization.mockClear();
    mocks.reorderRouteStops.mockClear();
    mocks.deleteDraftRoute.mockClear();
    mocks.mutate.mockClear();
  });

  it("présente les ressources, la carte, les articles et le QR avant publication", async () => {
    const user = userEvent.setup();
    renderDetails();

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
    expect(screen.queryByRole("button", { name: /^supprimer$/i })).not.toBeInTheDocument();

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
    renderDetails();

    await user.click(screen.getByRole("button", { name: /optimiser l’ordre/i }));
    const dialog = await screen.findByRole("dialog", { name: /comparer l’ordre/i });
    expect(within(dialog).getAllByText("Client Test")).toHaveLength(2);
    expect(within(dialog).getAllByText("Oran")).toHaveLength(2);
    expect(within(dialog).queryByText("DN-TEST-1")).not.toBeInTheDocument();
    expect(mocks.applyRouteOptimization).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /appliquer cet ordre/i }));
    expect(mocks.applyRouteOptimization).toHaveBeenCalledWith("LIV-TEST-1", ["DN-TEST-1"], 2);
    expect(mocks.calculateRouteItinerary).toHaveBeenCalledWith("LIV-TEST-1", 3);
  });

  it("affiche l’erreur serveur dans la confirmation de publication", async () => {
    const user = userEvent.setup();
    mocks.publishRoute.mockRejectedValueOnce(new Error("Publication refusée"));
    renderDetails();

    await user.click(screen.getByRole("button", { name: /publier la tournée/i }));
    await user.click(screen.getByRole("button", { name: /confirmer et publier/i }));

    const dialog = screen.getByRole("dialog", { name: /publier la tournée/i });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Publication refusée");
  });

  it("autorise la publication et le routage avec GPS client manquant si la commune est connue", async () => {
    const user = userEvent.setup();
    route.stops[0].customerGpsStatus = "missing";
    route.stops[0].requiresCustomerGeolocation = true;
    route.stops[0].geolocationSource = "commune";
    route.stops[0].latitude = 35.69;
    route.stops[0].longitude = -0.63;

    renderDetails();

    expect(screen.getByText("GPS client à collecter")).toBeInTheDocument();
    expect(screen.getByText(/position à collecter par le livreur/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recalculer l’itinéraire/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /optimiser l’ordre/i })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /publier la tournée/i }));
    const dialog = screen.getByRole("dialog", { name: /publier la tournée/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/1 client\(s\) sans GPS/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/centre de la commune/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /confirmer et publier/i }));
    expect(mocks.publishRoute).toHaveBeenCalledWith("LIV-TEST-1", 2);

    route.stops[0].customerGpsStatus = "known";
    route.stops[0].requiresCustomerGeolocation = false;
    route.stops[0].geolocationSource = "customer";
    route.stops[0].latitude = 35.7;
    route.stops[0].longitude = -0.6;
  });

  it("autorise le routage si la commune est connue même sans coords encore en cache", () => {
    route.stops[0].customerGpsStatus = "missing";
    route.stops[0].requiresCustomerGeolocation = true;
    route.stops[0].geolocationSource = undefined;
    route.stops[0].commune = "Oran";
    route.stops[0].latitude = undefined;
    route.stops[0].longitude = undefined;

    renderDetails();

    expect(screen.getByText("GPS client à collecter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recalculer l’itinéraire/i })).toBeEnabled();

    route.stops[0].customerGpsStatus = "known";
    route.stops[0].requiresCustomerGeolocation = false;
    route.stops[0].geolocationSource = "customer";
    route.stops[0].latitude = 35.7;
    route.stops[0].longitude = -0.6;
  });

  it("bloque le routage seulement s’il n’y a ni GPS client ni commune", () => {
    route.stops[0].customerGpsStatus = "missing";
    route.stops[0].requiresCustomerGeolocation = true;
    route.stops[0].geolocationSource = undefined;
    route.stops[0].commune = undefined;
    route.stops[0].latitude = undefined;
    route.stops[0].longitude = undefined;

    renderDetails();

    expect(screen.getByText("GPS client à collecter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recalculer l’itinéraire/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /optimiser l’ordre/i })).toBeDisabled();

    route.stops[0].customerGpsStatus = "known";
    route.stops[0].requiresCustomerGeolocation = false;
    route.stops[0].geolocationSource = "customer";
    route.stops[0].commune = "Oran";
    route.stops[0].latitude = 35.7;
    route.stops[0].longitude = -0.6;
  });

  it("affiche Calculer l’itinéraire tant qu’aucun tracé n’existe", () => {
    const previous = route.routing;
    route.routing = {
      status: "not_calculated",
      provider: "openrouteservice",
      profile: "driving-car",
      optimizationEnabled: true,
    };
    try {
      renderDetails();
      expect(screen.getByRole("button", { name: /calculer l’itinéraire/i })).toBeEnabled();
      expect(screen.queryByRole("button", { name: /recalculer l’itinéraire/i })).not.toBeInTheDocument();
      expect(screen.getByText(/utilisez « Calculer l’itinéraire »/i)).toBeInTheDocument();
    } finally {
      route.routing = previous;
    }
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

    renderDetails();

    expect(screen.getByText("1/1")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Arrêts traités" })).toHaveAttribute("aria-valuenow", "1");
    const stopCard = screen.getByRole("article", { name: "Arrêt 1 · Livré" });
    expect(stopCard).toHaveAttribute("data-stop-state", "delivered");
    expect(within(stopCard).getByText("2/2")).toBeInTheDocument();
    expect(screen.getByText("Ordre de livraison")).toBeInTheDocument();
    expect(screen.queryAllByLabelText(/Déplacer /)).toHaveLength(0);
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

  it("permet de supprimer une tournée brouillon vide après confirmation", async () => {
    const user = userEvent.setup();
    const originalStops = route.stops;
    route.stops = [];
    try {
      renderDetails();
      await user.click(screen.getByRole("button", { name: /^supprimer$/i }));
      const dialog = screen.getByRole("dialog", { name: /supprimer la tournée/i });
      expect(dialog).toHaveTextContent("LIV-TEST-1");
      expect(mocks.deleteDraftRoute).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole("button", { name: /^supprimer$/i }));
      expect(mocks.deleteDraftRoute).toHaveBeenCalledWith("LIV-TEST-1", 2);
      expect(await screen.findByText("Planning")).toBeInTheDocument();
    } finally {
      route.stops = originalStops;
    }
  });

  it("propose une liste réordonnable seulement sur une tournée brouillon à plusieurs arrêts", () => {
    const originalStops = route.stops;
    route.stops = [...route.stops, extraStop()];
    try {
      renderDetails();
      expect(screen.getByText("Ordre de livraison")).toBeInTheDocument();
      expect(screen.getAllByLabelText(/Déplacer /)).toHaveLength(2);
      expect(screen.queryByText(/l’itinéraire gps est une suggestion/i)).not.toBeInTheDocument();
      expect(screen.getAllByRole("table")).toHaveLength(1);
      expect(screen.getAllByText("Client Bis")).toHaveLength(1);
      expect(screen.getByText("ART-1")).toBeInTheDocument();
      expect(screen.queryByText("ART-2")).not.toBeInTheDocument();
    } finally {
      route.stops = originalStops;
    }
  });

  it("sélectionne un arrêt au clic et met à jour ?stop=", async () => {
    const user = userEvent.setup();
    const originalStops = route.stops;
    route.stops = [...route.stops, extraStop()];
    try {
      renderDetails();
      await user.click(screen.getByRole("option", { name: /client bis/i }));
      expect(screen.getByTestId("search-params")).toHaveTextContent("stop=DN-TEST-2");
      expect(screen.getByRole("heading", { name: "Client Bis" })).toBeInTheDocument();
      expect(screen.getByText("ART-2")).toBeInTheDocument();
      expect(screen.queryByText("ART-1")).not.toBeInTheDocument();
      expect(screen.getAllByRole("table")).toHaveLength(1);
    } finally {
      route.stops = originalStops;
    }
  });

  it("sélectionne l’arrêt visé par ?focus= au montage", async () => {
    const originalStops = route.stops;
    route.stops = [...route.stops, extraStop()];
    try {
      renderDetails("/planning/routes/LIV-TEST-1?focus=DN-TEST-2");
      expect(screen.getByRole("option", { selected: true })).toHaveTextContent("Client Bis");
      expect(screen.getByRole("heading", { name: "Client Bis" })).toBeInTheDocument();
      expect(screen.getByText("ART-2")).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByTestId("search-params")).toHaveTextContent("stop=DN-TEST-2");
      });
    } finally {
      route.stops = originalStops;
    }
  });

  it("regroupe visuellement les arrêts par commune sans changer les numéros de séquence", () => {
    const originalStops = route.stops;
    route.stops = [
      { ...route.stops[0], commune: "Oran", wilaya: "Oran" },
      extraStop({ commune: "Bir El Djir", wilaya: "Oran", customerName: "Client Bir El Djir" }),
      extraStop({
        deliveryNote: "DN-TEST-3",
        customerName: "Client Oran 2",
        sequence: 3,
        commune: "Oran",
        wilaya: "Oran",
      }),
    ];
    try {
      renderDetails();
      const options = screen.getAllByRole("option");
      expect(options.map((option) => option.textContent)).toEqual([
        expect.stringContaining("Client Test"),
        expect.stringContaining("Client Oran 2"),
        expect.stringContaining("Client Bir El Djir"),
      ]);
      expect(options[0]).toHaveTextContent("1");
      expect(options[1]).toHaveTextContent("3");
      expect(options[2]).toHaveTextContent("2");
      expect(screen.getByText("Bir El Djir")).toBeInTheDocument();
    } finally {
      route.stops = originalStops;
    }
  });

  it("enregistre l’ordre une seule fois après un réordonnancement", async () => {
    const originalStops = route.stops;
    route.stops = [...route.stops, extraStop()];
    mocks.reorderRouteStops.mockResolvedValue({ ...route, revision: 3 });
    try {
      const user = userEvent.setup();
      renderDetails();
      await user.click(screen.getByRole("button", { name: "Simuler le réordonnancement" }));
      await waitFor(() => {
        expect(mocks.reorderRouteStops).toHaveBeenCalledTimes(1);
      });
      expect(mocks.reorderRouteStops).toHaveBeenCalledWith("LIV-TEST-1", ["DN-TEST-2", "DN-TEST-1"], 2);
    } finally {
      route.stops = originalStops;
    }
  });

  it("laisse réordonner une tournée publiée tant que le livreur n’a pas accepté", async () => {
    const original = { lifecycle: route.lifecycle, publishedRevision: route.publishedRevision, stops: route.stops };
    route.lifecycle = "Publiée";
    route.publishedRevision = 2;
    route.stops = [...route.stops, extraStop()];
    mocks.reorderRouteStops.mockResolvedValue({ ...route, revision: 3, publishedRevision: 3 });
    try {
      const user = userEvent.setup();
      renderDetails();
      expect(screen.getByText(/le livreur devra accepter la nouvelle révision/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /déplacer client test/i })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Simuler le réordonnancement" }));
      await waitFor(() => {
        expect(mocks.reorderRouteStops).toHaveBeenCalledWith("LIV-TEST-1", ["DN-TEST-2", "DN-TEST-1"], 2);
      });
    } finally {
      route.lifecycle = original.lifecycle;
      route.publishedRevision = original.publishedRevision;
      route.stops = original.stops;
    }
  });

  it("verrouille l’ordre dès que le livreur a accepté la révision", () => {
    const original = {
      lifecycle: route.lifecycle,
      acknowledged: route.acknowledged,
      publishedRevision: route.publishedRevision,
      acknowledgedRevision: route.acknowledgedRevision,
      stops: route.stops,
    };
    route.lifecycle = "Publiée";
    route.acknowledged = true;
    route.publishedRevision = 2;
    route.acknowledgedRevision = 2;
    route.stops = [...route.stops, extraStop()];
    try {
      renderDetails();
      expect(screen.queryByRole("button", { name: "Simuler le réordonnancement" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /déplacer /i })).not.toBeInTheDocument();
      expect(screen.getByText(/sélectionnez un arrêt pour vérifier/i)).toBeInTheDocument();
    } finally {
      route.lifecycle = original.lifecycle;
      route.acknowledged = original.acknowledged;
      route.publishedRevision = original.publishedRevision;
      route.acknowledgedRevision = original.acknowledgedRevision;
      route.stops = original.stops;
    }
  });
});
