import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { VehiclesPage } from "@/features/fleet/VehiclesPage";

const mocks = vi.hoisted(() => ({
  createVehicle: vi.fn().mockResolvedValue({ name: "VEH-3" }),
  updateVehicle: vi.fn().mockResolvedValue({}),
  assignVehicleDriver: vi.fn().mockResolvedValue({}),
  mutate: vi.fn().mockResolvedValue(undefined),
  refreshOptions: vi.fn().mockResolvedValue(undefined),
  toastSuccess: vi.fn(),
}));

const board = {
  kpis: { total: 2, available: 1, maintenance: 1, outOfService: 0, withoutDriver: 1, documentAlerts: 1, maintenanceDue: 1 },
  vehicles: [
    {
      name: "VEH-1",
      label: "Camion A · 16-001",
      registration: "16-001",
      status: "Disponible",
      active: true,
      driver: "DRV-1",
      driverName: "Karim",
      documents: [{ key: "assurance", label: "Assurance", alert: "valid" }],
      nextMaintenance: "2026-12-01",
      maintenanceAlert: null,
    },
    {
      name: "VEH-2",
      label: "Camion B · 16-002",
      registration: "16-002",
      status: "En maintenance",
      active: true,
      driver: null,
      driverName: null,
      documents: [{ key: "assurance", label: "Assurance", alert: "expired", expiresOn: "2026-01-01" }],
      nextMaintenance: "2026-08-20",
      maintenanceAlert: "due",
    },
  ],
};

vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: vi.fn() } }));

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useFleetVehicles: () => ({ data: { message: board }, error: undefined, isLoading: false, mutate: mocks.mutate }),
  useFleetOptions: () => ({
    data: {
      message: {
        users: [],
        vehicles: [],
        drivers: [{ name: "DRV-1", label: "Karim", vehicleLabel: "Camion A · 16-001" }],
        companies: [{ name: "C1", label: "IntraPro" }],
      },
    },
    mutate: mocks.refreshOptions,
  }),
  useFleetMutations: () => ({
    createVehicle: mocks.createVehicle,
    updateVehicle: mocks.updateVehicle,
    assignVehicleDriver: mocks.assignVehicleDriver,
    saving: false,
  }),
}));

function renderPage(canWrite = false) {
  return render(
    <MemoryRouter>
      <VehiclesPage canWrite={canWrite} />
    </MemoryRouter>,
  );
}

describe("VehiclesPage", () => {
  it("affiche le parc et filtre les documents à surveiller", async () => {
    const user = userEvent.setup();
    renderPage(true);

    expect(screen.getByRole("heading", { name: "Véhicules" })).toBeInTheDocument();
    expect(screen.getByText("Camion A · 16-001")).toBeInTheDocument();
    expect(screen.getByText("Camion B · 16-002")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /docs à surveiller/i }));
    expect(screen.queryByText("Camion A · 16-001")).not.toBeInTheDocument();
    expect(screen.getByText("Camion B · 16-002")).toBeInTheDocument();
  });

  it("ouvre le formulaire de création pour un responsable", async () => {
    const user = userEvent.setup();
    renderPage(true);
    await user.click(screen.getByRole("button", { name: /nouveau véhicule/i }));
    expect(await screen.findByRole("dialog")).toHaveTextContent(/nouveau véhicule/i);
    expect(screen.getByLabelText("Société")).toBeInTheDocument();
  });

  it("ouvre l'assignation depuis le menu d'actions", async () => {
    const user = userEvent.setup();
    renderPage(true);

    await user.click(screen.getByRole("button", { name: "Actions de Camion A · 16-001" }));
    await user.click(await screen.findByRole("menuitem", { name: "Assigner" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Chauffeur de Camion A · 16-001");
    expect(dialog).toHaveTextContent("Affectation actuelle");
    expect(dialog).toHaveTextContent("Karim");
  });

  it("ouvre la modification depuis le menu d'actions", async () => {
    const user = userEvent.setup();
    renderPage(true);
    await user.click(screen.getByRole("button", { name: "Actions de Camion A · 16-001" }));
    await user.click(await screen.findByRole("menuitem", { name: "Modifier" }));
    expect(await screen.findByRole("dialog", { name: /modifier le véhicule/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Immatriculation")).toHaveValue("16-001");
  });
});
