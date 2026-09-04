import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { DeliveriesPage } from "@/features/deliveries/DeliveriesPage";
import { chooseOption } from "@/test/chooseOption";

const sampleRoutes = [
  {
    name: "LIV-1",
    lifecycle: "En cours",
    driver: "DRV-1",
    driverName: "Karim",
    vehicle: "VEH-1",
    vehicleLabel: "Camion A",
    alerts: [],
    stops: [
      { deliveryNote: "DN-1", status: "Livré", sequence: 1, customerName: "Client A", commune: "Oran", latitude: 35.7, longitude: -0.6 },
      { deliveryNote: "DN-2", status: "Préparé", sequence: 2, customerName: "Client B", commune: "Mostaganem" },
    ],
    routing: { geometry: { coordinates: [[-0.6, 35.7], [-0.1, 35.9]] } },
  },
  {
    name: "LIV-2",
    lifecycle: "Terminée",
    driver: "DRV-1",
    driverName: "Karim",
    vehicleLabel: "Camion B",
    alerts: [],
    stops: [
      { deliveryNote: "DN-3", status: "Non Livré", sequence: 1, customerName: "Client C", commune: "Oran" },
    ],
    routing: { status: "not_calculated" },
  },
];

const mocks = vi.hoisted(() => ({
  filters: {} as Record<string, unknown>,
  board: {
    drivers: [{ name: "DRV-1", label: "Karim", active: true }],
    vehicles: [{ name: "VEH-1", label: "Camion A", active: true }],
    unassigned: [],
    exceptions: [],
    routes: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  usePlanningBoard: (_from: string, _to?: string, filters: Record<string, unknown> = {}) => {
    mocks.filters = filters;
    return { data: { message: mocks.board }, error: undefined, isLoading: false };
  },
}));

vi.mock("@/features/today/FleetMap", () => ({
  FleetMap: ({ routes }: { routes: Array<{ name: string }> }) => (
    <div>Carte flotte {routes.map((route) => route.name).join(" ")}</div>
  ),
}));

function renderPage(entry = "/deliveries") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <DeliveriesPage />
    </MemoryRouter>,
  );
}

describe("DeliveriesPage", () => {
  beforeEach(() => {
    mocks.board.routes = structuredClone(sampleRoutes);
    mocks.filters = {};
  });

  it("affiche les KPI, la carte et sélectionne une tournée", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: /livraisons/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tournées du jour/i })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /en cours/i })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /arrêts livrés/i })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /échecs/i })).toHaveTextContent("1");
    expect(screen.getAllByText(/camion a/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Carte flotte LIV-1 LIV-2")).toBeInTheDocument();
    expect(screen.getByText("Client A")).toBeInTheDocument();
    expect(screen.getByText("DN-1")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /ouvrir la tournée/i }).length).toBeGreaterThan(0);
  });

  it("filtre par cycle de vie et par KPI échecs", async () => {
    const user = userEvent.setup();
    renderPage();

    await chooseOption(user, screen.getByLabelText("Cycle de vie"), "Terminée");
    expect(screen.getByText("Carte flotte LIV-2")).toBeInTheDocument();
    expect(screen.queryAllByText(/camion a/i)).toHaveLength(0);
    expect(screen.getAllByText(/camion b/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /échecs/i }));
    expect(screen.getByText("Carte flotte LIV-2")).toBeInTheDocument();
    expect(screen.getByText("Client C")).toBeInTheDocument();
  });

  it("filtre les échecs depuis l’URL", () => {
    renderPage("/deliveries?kpi=failed");
    expect(screen.getByText("Carte flotte LIV-2")).toBeInTheDocument();
    expect(screen.queryByText("Carte flotte LIV-1 LIV-2")).not.toBeInTheDocument();
  });

  it("sélectionne une tournée au clic dans le tableau", async () => {
    const user = userEvent.setup();
    renderPage();

    const table = screen.getByRole("table", { name: "Tournées du jour" });
    await user.click(within(table).getByText("LIV-2"));
    expect(screen.getByText("Client C")).toBeInTheDocument();
    expect(screen.getByText("Arrêts · LIV-2")).toBeInTheDocument();
  });

  it("distingue l’état vide des filtres", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Recherche"), "introuvable");
    expect(screen.getAllByText("Aucune tournée pour ces filtres").length).toBeGreaterThan(0);
    expect(screen.queryByText("Aucune tournée ce jour")).not.toBeInTheDocument();
  });

  it("affiche l’état vide du jour", () => {
    mocks.board.routes = [];
    renderPage();

    expect(screen.getAllByText("Aucune tournée ce jour").length).toBeGreaterThan(0);
    expect(screen.queryByText("Aucune tournée pour ces filtres")).not.toBeInTheDocument();
  });

  it("affiche toutes les tournées quand la date est effacée", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.clear(screen.getByLabelText("Date"));

    expect(screen.queryByText(/invalid date/i)).not.toBeInTheDocument();
    expect(screen.getByText("Avancement de toutes les tournées.")).toBeInTheDocument();
    expect(mocks.filters).toEqual({ allDates: true });
    expect(screen.getByText("Carte flotte LIV-1 LIV-2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^tournées /i })).toHaveTextContent("2");
  });

  it("réinitialise les filtres et réaffiche toutes les tournées", async () => {
    const user = userEvent.setup();
    renderPage();

    await chooseOption(user, screen.getByLabelText("Cycle de vie"), "Terminée");
    expect(screen.getByText("Carte flotte LIV-2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /réinitialiser/i }));
    expect(screen.getByText("Avancement de toutes les tournées.")).toBeInTheDocument();
    expect(mocks.filters).toEqual({ allDates: true });
    expect(screen.getByText("Carte flotte LIV-1 LIV-2")).toBeInTheDocument();
    expect(screen.getByLabelText("Cycle de vie")).not.toHaveTextContent("Terminée");
    expect(screen.queryByRole("button", { name: /réinitialiser/i })).not.toBeInTheDocument();
  });
});
