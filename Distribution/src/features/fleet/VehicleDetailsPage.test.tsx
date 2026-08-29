import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { VehicleDetailsPage } from "@/features/fleet/VehicleDetailsPage";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn().mockResolvedValue(undefined),
  assignVehicleDriver: vi.fn().mockResolvedValue({}),
  uploadDocument: vi.fn().mockResolvedValue({}),
  updateVehicle: vi.fn().mockResolvedValue({}),
  createEntretien: vi.fn().mockResolvedValue({}),
}));

const vehicle = {
  name: "ol81mivd4g",
  nom: "Camion A",
  label: "Camion A · 16-001",
  registration: "16-001",
  status: "Disponible",
  active: true,
  driver: "DRV-1" as string | null,
  driverName: "Karim" as string | null,
  warehouse: "DEPOT",
  company: "IntraPro",
  fuelType: "Diesel",
  km: 12500 as number,
  capacity: 80 as number | null,
  lastMaintenance: "2026-07-01",
  nextMaintenance: "2026-09-15",
  maintenanceAlert: "upcoming" as const,
  documents: [{ key: "assurance", label: "Assurance", url: "/files/a.pdf", expiresOn: "2027-01-01", alert: "valid" as const }],
  imageUrl: undefined as string | undefined,
  recentRoutes: [{ name: "LIV-1", date: "2026-08-29", driverName: "Karim", lifecycle: "En cours" }],
  activeRoutes: [{ name: "LIV-1", date: "2026-08-29", lifecycle: "En cours" }],
  entretiens: [{ name: "ENT-1", status: "Programmé", date: "2026-09-15", type: "Préventif", km: 12000 }],
  assignmentHistory: [
    {
      name: "HIST-AFF-00002",
      action: "Désaffectation",
      at: "2026-08-28 09:00:00",
      user: "admin@test",
      userLabel: "Admin",
      driver: "DRV-2",
      driverLabel: "Nadir",
      vehicle: "ol81mivd4g",
      vehicleLabel: "Camion A · 16-001",
      reason: "Panne",
    },
  ],
};

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useFleetVehicle: () => ({ data: { message: vehicle }, error: undefined, isLoading: false, mutate: mocks.mutate }),
  useFleetOptions: () => ({
    data: { message: { users: [], vehicles: [], drivers: [{ name: "DRV-1", label: "Karim" }], companies: [{ name: "IntraPro", label: "IntraPro" }] } },
    mutate: vi.fn(),
  }),
  useFleetMutations: () => ({
    assignVehicleDriver: mocks.assignVehicleDriver,
    uploadDocument: mocks.uploadDocument,
    updateVehicle: mocks.updateVehicle,
    createEntretien: mocks.createEntretien,
    saving: false,
  }),
}));

function renderPage(canWrite = false) {
  return render(
    <MemoryRouter initialEntries={["/vehicules/ol81mivd4g"]}>
      <Routes>
        <Route path="/vehicules/:vehicleId" element={<VehicleDetailsPage canWrite={canWrite} />} />
        <Route path="/stock" element={<p>Stock</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("VehicleDetailsPage", () => {
  it("ouvre la vue d’ensemble compacte", () => {
    renderPage(true);
    expect(screen.getByRole("heading", { name: "Camion A" })).toBeInTheDocument();
    expect(screen.getByText("16-001")).toBeInTheDocument();
    expect(screen.getByText("Diesel · IntraPro")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour à la liste" })).toHaveAttribute("href", "/vehicules");
    expect(screen.getByRole("button", { name: "Voir le stock" })).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Vue d’ensemble", "Chauffeur", "Documents", "Entretiens", "Tournées", "Historique"]);
    expect(screen.getByRole("tab", { name: "Vue d’ensemble" })).toHaveAttribute("data-active");
    expect(screen.getByText("Situation actuelle")).toBeInTheDocument();
    expect(screen.getByText("Kilométrage")).toBeInTheDocument();
    expect(screen.getByText("Prochain entretien")).toBeInTheDocument();
    expect(screen.getAllByText("Karim").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Ouvrir la fiche livreur" })[0]).toHaveAttribute("href", "/livreurs/DRV-1");
    expect(screen.queryByText("DEPOT")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Modifier le chauffeur" }).length).toBeGreaterThan(0);
    expect(within(screen.getByRole("group", { name: "Actions du véhicule" })).getByRole("button", { name: "Modifier" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Statut du véhicule" })).toHaveTextContent("Disponible");
    expect(screen.getAllByText("LIV-1").length).toBeGreaterThan(0);
  });

  it("ouvre le dialogue pour enregistrer un entretien", async () => {
    const user = userEvent.setup();
    renderPage(true);
    await user.click(screen.getByRole("button", { name: /enregistrer l.entretien/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/enregistrer un entretien/i);
    expect(screen.getByLabelText("Kilométrage")).toHaveValue(12500);
  });

  it("demande confirmation avant de désactiver", async () => {
    const user = userEvent.setup();
    renderPage(true);
    await user.click(screen.getByRole("button", { name: "Autres actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Désactiver" }));
    expect(await screen.findByRole("dialog", { name: /désactiver ce véhicule/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Désactiver" }));
    expect(mocks.updateVehicle).toHaveBeenCalledWith({ name: "ol81mivd4g", active: false });
  });

  it("change le statut depuis le groupe d’actions", async () => {
    const user = userEvent.setup();
    renderPage(true);
    await user.click(screen.getByRole("button", { name: "Statut du véhicule" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "En maintenance" }));
    expect(mocks.updateVehicle).toHaveBeenCalledWith({ name: "ol81mivd4g", status: "En maintenance" });
  });

  it("montre l’historique d’entretien dans l’onglet dédié", async () => {
    const user = userEvent.setup();
    renderPage(true);
    await user.click(screen.getByRole("tab", { name: "Entretiens" }));
    expect(screen.getByRole("heading", { name: "Historique d’entretien" })).toBeInTheDocument();
    expect(screen.getByText("Préventif")).toBeInTheDocument();
    expect(screen.getByText("Programmé")).toBeInTheDocument();
  });

  it("montre l’historique d’affectation dans l’onglet dédié", async () => {
    const user = userEvent.setup();
    renderPage(true);
    await user.click(screen.getByRole("tab", { name: "Historique" }));
    expect(screen.getByText("Désaffectation")).toBeInTheDocument();
    expect(screen.getByText("Nadir")).toBeInTheDocument();
    expect(screen.getByText("Panne")).toBeInTheDocument();
  });

  it("affiche un état vide sans chauffeur", () => {
    vehicle.driver = null;
    vehicle.driverName = null;
    renderPage(true);
    expect(screen.getByText("Aucun chauffeur affecté")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /affecter un chauffeur/i })).toBeInTheDocument();
    vehicle.driver = "DRV-1";
    vehicle.driverName = "Karim";
  });

  it("masque les actions d'écriture au planificateur", () => {
    renderPage(false);
    expect(screen.queryByRole("button", { name: /planifier/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enregistrer l.entretien/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Autres actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier le chauffeur" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Statut du véhicule" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Photo du véhicule")).not.toBeInTheDocument();
  });

  it("affiche la photo du véhicule", () => {
    vehicle.imageUrl = "/files/van.png";
    renderPage();
    expect(screen.getByRole("img", { name: "Camion A" })).toHaveAttribute("src", "/files/van.png");
    vehicle.imageUrl = undefined;
  });

  it("permet de modifier la fiche véhicule", async () => {
    const user = userEvent.setup();
    renderPage(true);
    await user.click(within(screen.getByRole("group", { name: "Actions du véhicule" })).getByRole("button", { name: "Modifier" }));
    const dialog = await screen.findByRole("dialog", { name: /modifier le véhicule/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText("Nom du véhicule")).toHaveValue("Camion A");
    expect(screen.getByLabelText("Immatriculation")).toHaveValue("16-001");
    await user.clear(screen.getByLabelText("Nom du véhicule"));
    await user.type(screen.getByLabelText("Nom du véhicule"), "Véhicule 1");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(mocks.updateVehicle).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "ol81mivd4g",
        label: "Véhicule 1",
        registration: "16-001",
        company: "IntraPro",
        fuelType: "Diesel",
        capacity: 80,
        km: 12500,
        status: "Disponible",
      }),
    );
  });

  it("permet de téléverser la photo du véhicule", async () => {
    const user = userEvent.setup();
    renderPage(true);
    const file = new File(["van"], "van.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Photo du véhicule"), file);
    expect(mocks.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        doctype: "Vehicule",
        name: "ol81mivd4g",
        field: "image",
        filename: "van.png",
      }),
    );
  });
});
