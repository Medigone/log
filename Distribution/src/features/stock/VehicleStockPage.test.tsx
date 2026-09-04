import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { VehicleStockPage } from "@/features/stock/VehicleStockPage";
import { chooseOption } from "@/test/chooseOption";

const mutate = vi.fn().mockResolvedValue(undefined);

const vehicles = [
  {
    name: "VEH-1",
    label: "Camion A · 12345",
    registration: "12345",
    status: "Disponible",
    active: true,
    warehouse: "12345 - VEH",
    missingWarehouse: false,
    totalQuantity: 8,
    itemCount: 1,
    lines: [{ itemCode: "ART-1", itemName: "Huile 5L", quantity: 8, uom: "Nos" }],
    activeRoutes: [{ routeId: "LIV-9", lifecycle: "En cours", driver: "DRV-1", driverName: "Karim" }],
  },
  {
    name: "VEH-2",
    label: "Camion B · 67890",
    registration: "67890",
    status: "Disponible",
    active: true,
    warehouse: undefined,
    missingWarehouse: true,
    totalQuantity: 0,
    itemCount: 0,
    lines: [],
    activeRoutes: [],
  },
  {
    name: "VEH-3",
    label: "Camion C · 11111",
    registration: "11111",
    status: "Disponible",
    active: false,
    warehouse: "11111 - VEH",
    missingWarehouse: false,
    totalQuantity: 0,
    itemCount: 0,
    lines: [],
    activeRoutes: [],
  },
];

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useVehicleStocks: () => ({ data: { message: vehicles }, error: undefined, isLoading: false, mutate }),
}));

function renderPage(canLinkRoutes = false, entry = "/stock") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <VehicleStockPage canLinkRoutes={canLinkRoutes} />
    </MemoryRouter>,
  );
}

describe("VehicleStockPage", () => {
  it("affiche le stock physique du véhicule sélectionné", async () => {
    const user = userEvent.setup();
    renderPage(true);

    expect(await screen.findByRole("heading", { name: /stock des véhicules/i })).toBeInTheDocument();
    expect(screen.getByText("Huile 5L")).toBeInTheDocument();
    expect(screen.getByText("ART-1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "LIV-9" })).toHaveAttribute("href", "/planning/routes/LIV-9");

    await user.click(screen.getByRole("button", { name: /camion b/i }));
    expect(screen.getByText(/entrepôt camion n’est pas encore créé/i)).toBeInTheDocument();
  });

  it("filtre par KPI, recherche tournée et masque les inactifs", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("heading", { name: /stock des véhicules/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /camion c/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /camions sur le terrain/i }));
    expect(screen.getByRole("heading", { name: /camion a/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /camion b/i })).not.toBeInTheDocument();

    await chooseOption(user, screen.getByRole("combobox", { name: "État" }), "Entrepôt manquant");
    expect(screen.getByRole("heading", { name: /camion b/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /camion a/i })).not.toBeInTheDocument();

    await chooseOption(user, screen.getByRole("combobox", { name: "État" }), "Tous (actifs)");
    await user.type(screen.getByRole("textbox", { name: /rechercher un véhicule/i }), "Karim");
    expect(screen.getByRole("heading", { name: /camion a/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /camion b/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "LIV-9" })).not.toBeInTheDocument();
    expect(screen.getAllByText("LIV-9").length).toBeGreaterThan(0);
  });

  it("filtre les entrepôts manquants depuis l’URL", () => {
    renderPage(false, "/stock?focus=missing");
    expect(screen.getByRole("heading", { name: /camion b/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /camion a/i })).not.toBeInTheDocument();
  });
});
