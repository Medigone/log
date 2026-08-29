import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DriverDetailsPage } from "@/features/fleet/DriverDetailsPage";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn().mockResolvedValue(undefined),
  assignDriverVehicle: vi.fn().mockResolvedValue({}),
  uploadDocument: vi.fn().mockResolvedValue({}),
  updateDriver: vi.fn().mockResolvedValue({}),
}));

const driver = {
  name: "DRV-1",
  label: "Karim",
  user: "karim@test",
  userEmail: "karim@test",
  status: "Actif",
  active: true,
  vehicle: "VEH-1",
  vehicleLabel: "Camion A · 16-001",
  vehicleStatus: "En maintenance",
  vehicleActive: true,
  license: { key: "permis", label: "Permis de conduire", url: "/files/permis.pdf", expiresOn: "2027-01-01", alert: "valid" },
  cashBalance: 1500,
  dashboard: {
    kpis: { plannedRoutes: 2, deliveredStops: 8, failedStops: 1, amountCollected: 42000, plannedStops: 10, completedStops: 9, remainingStops: 1, amountToCollect: 800 },
  },
  recentRoutes: [{ name: "LIV-1", date: "2026-08-29", lifecycle: "En cours", vehicleLabel: "Camion A · 16-001" }],
  assignmentHistory: [
    {
      name: "HIST-AFF-00001",
      action: "Affectation",
      at: "2026-08-29 10:00:00",
      user: "admin@test",
      userLabel: "Admin",
      driver: "DRV-1",
      driverLabel: "Karim",
      vehicle: "VEH-1",
      vehicleLabel: "Camion A · 16-001",
      reason: "Rotation",
    },
  ],
};

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useFleetDriver: () => ({ data: { message: driver }, error: undefined, isLoading: false, mutate: mocks.mutate }),
  useFleetOptions: () => ({ data: { message: { users: [], vehicles: [{ name: "VEH-1", label: "Camion A" }], drivers: [], companies: [] } }, mutate: vi.fn() }),
  useFleetMutations: () => ({
    assignDriverVehicle: mocks.assignDriverVehicle,
    uploadDocument: mocks.uploadDocument,
    updateDriver: mocks.updateDriver,
    saving: false,
  }),
}));

function renderPage(canWrite = false) {
  return render(
    <MemoryRouter initialEntries={["/livreurs/DRV-1"]}>
      <Routes>
        <Route path="/livreurs/:driverId" element={<DriverDetailsPage canWrite={canWrite} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("DriverDetailsPage", () => {
  it("montre les KPI et le véhicule du livreur", () => {
    renderPage(true);
    expect(screen.getByRole("heading", { name: "Karim" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Camion A · 16-001" })[0]).toHaveAttribute("href", "/vehicules/VEH-1");
    expect(screen.getByText("En maintenance")).toBeInTheDocument();
    expect(screen.getByText("LIV-1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Historique d’affectation" })).toBeInTheDocument();
    expect(screen.getByText("Affectation")).toBeInTheDocument();
    expect(screen.getByText("Rotation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /changer/i })).toBeInTheDocument();
  });

  it("affiche un état vide sans historique d’affectation", () => {
    const previous = driver.assignmentHistory;
    driver.assignmentHistory = [];
    renderPage();
    expect(screen.getByText("Aucun historique d’affectation.")).toBeInTheDocument();
    driver.assignmentHistory = previous;
  });

  it("masque les actions d'écriture au planificateur", () => {
    renderPage(false);
    expect(screen.queryByRole("button", { name: /changer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /désactiver/i })).not.toBeInTheDocument();
  });
});
