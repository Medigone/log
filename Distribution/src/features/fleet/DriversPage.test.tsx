import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { DriversPage } from "@/features/fleet/DriversPage";

const mocks = vi.hoisted(() => ({
  createDriver: vi.fn().mockResolvedValue({ name: "DRV-3", label: "Samir" }),
  assignDriverVehicle: vi.fn().mockResolvedValue({}),
  mutate: vi.fn().mockResolvedValue(undefined),
  refreshOptions: vi.fn().mockResolvedValue(undefined),
  toastSuccess: vi.fn(),
}));

const board = {
  kpis: { total: 2, active: 1, onLeave: 0, unavailable: 0, withoutVehicle: 1, licenseAlerts: 1, cashToHandover: 1 },
  drivers: [
    {
      name: "DRV-1",
      label: "Karim",
      user: "karim@test",
      status: "Actif",
      active: true,
      vehicle: "VEH-1",
      vehicleLabel: "Camion A · 16-001",
      vehicleStatus: "Disponible",
      vehicleActive: true,
      license: { key: "permis", label: "Permis de conduire", url: "/files/permis.pdf", expiresOn: "2027-01-01", alert: "valid" },
      cashBalance: 1500,
    },
    {
      name: "DRV-2",
      label: "Nadir",
      user: "nadir@test",
      status: "Actif",
      active: true,
      vehicle: null,
      vehicleLabel: null,
      license: { key: "permis", label: "Permis de conduire", url: null, expiresOn: "2026-08-01", alert: "expired" },
      cashBalance: 0,
    },
  ],
};

vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: vi.fn() } }));

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useFleetDrivers: () => ({ data: { message: board }, error: undefined, isLoading: false, mutate: mocks.mutate }),
  useFleetOptions: () => ({
    data: {
      message: {
        users: [{ name: "samir@test", label: "Samir" }],
        vehicles: [{ name: "VEH-1", label: "Camion A", driverName: "Karim" }],
        drivers: [],
        companies: [],
      },
    },
    mutate: mocks.refreshOptions,
  }),
  useFleetMutations: () => ({
    createDriver: mocks.createDriver,
    assignDriverVehicle: mocks.assignDriverVehicle,
    saving: false,
  }),
}));

function renderPage(canWrite = false) {
  return render(
    <MemoryRouter>
      <DriversPage canWrite={canWrite} />
    </MemoryRouter>,
  );
}

describe("DriversPage", () => {
  it("affiche les KPI et filtre les permis à surveiller", async () => {
    const user = userEvent.setup();
    renderPage(true);

    expect(screen.getByRole("heading", { name: "Livreurs" })).toBeInTheDocument();
    expect(screen.getByText("Karim")).toBeInTheDocument();
    expect(screen.getByText("Camion A · 16-001")).toBeInTheDocument();
    expect(screen.getByText("Disponible")).toBeInTheDocument();
    expect(screen.getByText("Nadir")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /permis à surveiller/i }));
    expect(screen.queryByText("Karim")).not.toBeInTheDocument();
    expect(screen.getByText("Nadir")).toBeInTheDocument();
  });

  it("exige l'identité et un mot de passe pour créer un livreur", async () => {
    const user = userEvent.setup();
    renderPage(true);

    await user.click(screen.getByRole("button", { name: /nouveau livreur/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Prénom")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer" })).toBeDisabled();
    expect(mocks.createDriver).not.toHaveBeenCalled();
  });

  it("crée le compte et la fiche depuis le formulaire", async () => {
    const user = userEvent.setup();
    renderPage(true);

    await user.click(screen.getByRole("button", { name: /nouveau livreur/i }));
    await user.type(screen.getByLabelText("Prénom"), "Samir");
    await user.type(screen.getByLabelText("E-mail"), "samir@example.com");
    await user.type(screen.getByLabelText("Mot de passe"), "Secret123");
    await user.type(screen.getByLabelText("Confirmation du mot de passe"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() =>
      expect(mocks.createDriver).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "samir@example.com",
          firstName: "Samir",
          password: "Secret123",
        }),
      ),
    );
  });

  it("ouvre l'assignation depuis le menu d'actions", async () => {
    const user = userEvent.setup();
    renderPage(true);

    await user.click(screen.getByRole("button", { name: "Actions de Karim" }));
    await user.click(await screen.findByRole("menuitem", { name: "Assigner" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Véhicule de Karim");
    expect(dialog).toHaveTextContent("Affectation actuelle");
    expect(dialog).toHaveTextContent("Camion A · Karim");
  });
});
