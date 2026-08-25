import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VehicleStockPage } from "@/features/stock/VehicleStockPage";

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
];

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useVehicleStocks: () => ({ data: { message: vehicles }, error: undefined, isLoading: false, mutate }),
}));

describe("VehicleStockPage", () => {
  it("affiche le stock physique du véhicule sélectionné", async () => {
    const user = userEvent.setup();
    render(<VehicleStockPage />);

    expect(await screen.findByRole("heading", { name: /stock des véhicules/i })).toBeInTheDocument();
    expect(screen.getByText("Huile 5L")).toBeInTheDocument();
    expect(screen.getByText("ART-1")).toBeInTheDocument();
    expect(screen.getAllByText("LIV-9").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /camion b/i }));
    expect(screen.getByText(/entrepôt camion n’est pas encore créé/i)).toBeInTheDocument();
  });
});
