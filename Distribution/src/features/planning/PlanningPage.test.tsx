import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { PlanningPage } from "@/features/planning/PlanningPage";
import { reorderStops } from "@/features/planning/routeOrder";
import { LIST_PAGE_SIZE } from "@/components/ui/list-pagination";
import { chooseOption } from "@/test/chooseOption";
import type { DeliveryNoteAssignment, DistributionRoute, PlanningBoard, RouteStop } from "@/shared/types/distribution";

const mocks = vi.hoisted(() => ({
  scheduleDeliveryNote: vi.fn().mockResolvedValue({}),
  scheduleDeliveryNotes: vi.fn().mockResolvedValue({ route: { name: "LIV-NEW" }, count: 2 }),
  reassignDeliveryNote: vi.fn().mockResolvedValue({}),
  unassignDeliveryNote: vi.fn().mockResolvedValue({}),
  mutate: vi.fn(),
  boardArgs: { dateFrom: "", dateTo: "", filters: {} as Record<string, unknown> },
  currentBoard: undefined as PlanningBoard | undefined,
}));

const publishedRoute = {
  name: "LIV-26-08-00002",
  date: "2026-08-26",
  lifecycle: "Publiée",
  plannedStart: "2026-08-26 12:00:00",
  plannedEnd: "2026-08-26 14:00:00",
  revision: 2,
  publishedRevision: 2,
  acknowledgedRevision: 0,
  acknowledged: false,
  needsReview: false,
  driver: "DRV-1",
  driverName: "Livreur Test",
  vehicle: "VEH-1",
  vehicleLabel: "Camion Test",
  totalQuantity: 12,
  totalCollected: 0,
  totalAmount: 0,
  alerts: [],
  routing: { status: "not_calculated", provider: "openrouteservice", profile: "driving-car", optimizationEnabled: false, stopDurationMinutes: 15, stopDurationSeconds: 900 },
  stock: { status: "À charger", loadedQuantity: 0, deliveredQuantity: 0, remainingQuantity: 0, returnedQuantity: 0, lines: [] },
  cash: { routeId: "LIV-26-08-00002", routeLifecycle: "Publiée", status: "Sans encaissement", declaredCash: 0, declaredCheques: 0, declaredTotal: 0, countedTotal: 0, validatedTotal: 0, payments: [] },
  stops: [],
} as DistributionRoute;

function assignment(partial: Partial<DeliveryNoteAssignment> & Pick<DeliveryNoteAssignment, "deliveryNote">): DeliveryNoteAssignment {
  return {
    customer: "C-1",
    customerName: "Client Test",
    customerGpsStatus: "known",
    requiresCustomerGeolocation: false,
    totalQuantity: 1,
    amountCollected: 0,
    amountToCollect: 1000,
    payments: [],
    invoiceStatus: "Non créée",
    status: "Préparé",
    planningStatus: "Non planifié",
    sequence: 1,
    routeRevision: 0,
    ...partial,
  };
}

const board: PlanningBoard = {
  dateFrom: "2026-08-24",
  dateTo: "2026-08-30",
  unassigned: [assignment({ deliveryNote: "DN-1", customerGpsStatus: "missing", requiresCustomerGeolocation: true, totalQuantity: 2 })],
  assignments: [
    assignment({ deliveryNote: "DN-1", customerGpsStatus: "missing", requiresCustomerGeolocation: true, totalQuantity: 2 }),
    assignment({
      deliveryNote: "MAT-DN-2026-00003",
      customer: "C-2",
      customerName: "CLIENT 2",
      totalQuantity: 12,
      planningStatus: "En retard",
      route: "LIV-26-08-00002",
      driver: "DRV-1",
      vehicle: "VEH-1",
      plannedDate: "2026-08-26",
      requestedDate: "2026-08-26",
      plannedStart: "2026-08-26T12:00:00",
      plannedEnd: "2026-08-26T14:00:00",
      routeRevision: 2,
    }),
  ],
  routes: [publishedRoute],
  drivers: [
    { name: "DRV-1", label: "Livreur Test", active: true },
    { name: "DRV-2", label: "Livreur 2", active: true, vehicle: "VEH-2" },
  ],
  vehicles: [
    { name: "VEH-1", label: "Camion Test", active: true, capacity: 10 },
    { name: "VEH-2", label: "Camion B", active: true, capacity: 10 },
  ],
  exceptions: [],
};

mocks.currentBoard = board;

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  usePlanningBoard: (dateFrom: string, dateTo: string, filters: Record<string, unknown> = {}) => {
    mocks.boardArgs = { dateFrom, dateTo, filters };
    return { data: { message: mocks.currentBoard }, error: undefined, isLoading: false, mutate: mocks.mutate };
  },
  useDistributionMutations: () => ({
    scheduleDeliveryNote: mocks.scheduleDeliveryNote,
    scheduleDeliveryNotes: mocks.scheduleDeliveryNotes,
    reassignDeliveryNote: mocks.reassignDeliveryNote,
    unassignDeliveryNote: mocks.unassignDeliveryNote,
    publishRoute: vi.fn(),
    getRepreparationImpact: vi.fn(),
    reprepareChangedOrder: vi.fn(),
    saving: false,
  }),
}));
vi.mock("@/features/planning/RouteMap", () => ({ RouteMap: () => <div>Carte OSM</div> }));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <Routes>
        <Route path="/" element={<PlanningPage />} />
        <Route path="/planning" element={<PlanningPage />} />
        <Route path="/planning/routes/:routeId" element={<div>Détail tournée</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PlanningPage", () => {
  beforeEach(() => {
    mocks.currentBoard = board;
    mocks.scheduleDeliveryNote.mockClear();
    mocks.scheduleDeliveryNotes.mockClear();
    mocks.reassignDeliveryNote.mockClear();
    mocks.unassignDeliveryNote.mockClear();
    mocks.mutate.mockClear();
  });

  it("ouvre la page sans date ni autre filtre", async () => {
    const user = userEvent.setup();
    renderPage("/?view=table");
    expect(screen.queryByLabelText(/^du$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^au$/i)).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /bl/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /tournées/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Recherche")).toHaveValue("");
    expect(screen.getByLabelText("Échéance")).toBeInTheDocument();
    expect(screen.getByLabelText("Statut")).toBeInTheDocument();
    expect(screen.getByLabelText("Wilaya")).toBeInTheDocument();
    expect(screen.getByLabelText("Livreur")).toBeInTheDocument();
    expect(screen.getByLabelText("Véhicule")).toBeInTheDocument();
    expect(screen.getByLabelText("Période")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Statut"));
    expect(screen.getByRole("option", { name: "En retard" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /alertes seules/i })).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /réinitialiser/i })).not.toBeInTheDocument();
    expect(mocks.boardArgs).toEqual({ dateFrom: "", dateTo: "", filters: { allDates: true } });
  });

  it("affiche le bouton réinitialiser dès qu’un filtre BL est actif", async () => {
    const user = userEvent.setup();
    renderPage("/?view=table");
    await user.type(screen.getByLabelText("Recherche"), "DN-1");
    expect(screen.getByRole("button", { name: /réinitialiser/i })).toBeInTheDocument();
  });

  it("réordonne les arrêts et recalcule les séquences", () => {
    const stops = [{ deliveryNote: "DN-1", sequence: 1 }, { deliveryNote: "DN-2", sequence: 2 }] as RouteStop[];
    expect(reorderStops(stops, 1, 0).map((stop) => [stop.deliveryNote, stop.sequence])).toEqual([["DN-2", 1], ["DN-1", 2]]);
  });

  it("ouvre le panneau et affecte un BL à une nouvelle tournée", async () => {
    const user = userEvent.setup();
    renderPage("/?view=table");
    const table = screen.getByRole("table", { name: /bons de livraison/i });
    expect(within(table).getByRole("columnheader", { name: /n° bl/i })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: /statut/i })).toBeInTheDocument();
    expect(screen.getByText("GPS client à collecter")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /planifier/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/planifier la livraison/i)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Position")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Tournée compatible")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Motif")).not.toBeInTheDocument();
    await chooseOption(user, within(dialog).getByLabelText("Livreur"), "Livreur Test");
    await chooseOption(user, within(dialog).getByLabelText("Véhicule"), "Camion Test");
    await user.click(screen.getByRole("button", { name: /enregistrer la planification/i }));
    expect(mocks.scheduleDeliveryNote).toHaveBeenCalledWith(expect.objectContaining({ deliveryNote: "DN-1", driver: "DRV-1", vehicle: "VEH-1", position: 1 }));
    expect(mocks.reassignDeliveryNote).not.toHaveBeenCalled();
  });

  it("reprogramme un BL déjà planifié sans imposer une autre tournée", async () => {
    const user = userEvent.setup();
    renderPage("/?view=table");
    await user.click(screen.getByRole("button", { name: /reprogrammer/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/reprogrammer la livraison/i)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Position")).not.toBeInTheDocument();
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(within(dialog).getByLabelText("Date planifiée")).toHaveValue(iso);
    await chooseOption(user, within(dialog).getByLabelText("Livreur"), "Livreur 2");
    await user.type(within(dialog).getByLabelText("Motif"), "Client reporté");
    await user.click(screen.getByRole("button", { name: /enregistrer la reprogrammation/i }));
    expect(mocks.reassignDeliveryNote).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryNote: "MAT-DN-2026-00003",
        plannedDate: iso,
        driver: "DRV-2",
        vehicle: "VEH-2",
        reason: "Client reporté",
      }),
    );
    expect(mocks.reassignDeliveryNote.mock.calls[0][0].targetRouteId).toBeUndefined();
  });

  it("affiche les tournées en tableau avec actions par ligne", async () => {
    const user = userEvent.setup();
    renderPage("/?view=table");
    await user.click(screen.getByRole("tab", { name: /tournées/i }));
    expect(screen.getByTestId("location")).toHaveTextContent("tab=tournees");
    const table = screen.getByRole("table", { name: /tournées à planifier/i });
    expect(within(table).getByRole("columnheader", { name: /tournée/i })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: /statut/i })).toBeInTheDocument();
    expect(within(table).getByText("LIV-26-08-00002")).toBeInTheDocument();
    expect(within(table).getByText("Publiée")).toBeInTheDocument();
    expect(within(table).getByText(/acceptation requise/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /ouvrir/i }));
    expect(screen.getByText("Détail tournée")).toBeInTheDocument();
  });

  it("affiche le kanban par défaut avec la date du jour", () => {
    renderPage();
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(screen.getByRole("button", { name: /kanban/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Date du planning")).toHaveValue(iso);
    expect(screen.getByText("À planifier")).toBeInTheDocument();
    expect(screen.getByText("Livreur Test")).toBeInTheDocument();
    expect(screen.getByText("Livreur 2")).toBeInTheDocument();
    expect(screen.getAllByText(/nouvelle tournée/i).length).toBeGreaterThan(0);
    expect(mocks.boardArgs).toEqual({
      dateFrom: iso,
      dateTo: iso,
      filters: { includeBacklog: true },
    });
  });

  it("affiche tous les BL non programmés dans le backlog, quelle que soit la date demandée", () => {
    mocks.currentBoard = {
      ...board,
      unassigned: [assignment({ deliveryNote: "DN-FUTURE", requestedDate: "2026-12-15" })],
      assignments: [assignment({ deliveryNote: "DN-FUTURE", requestedDate: "2026-12-15" })],
      routes: [],
    };
    renderPage("/?date=2026-09-03");
    expect(screen.getByText("DN-FUTURE")).toBeInTheDocument();
    expect(screen.getByText("2026-12-15")).toBeInTheDocument();
  });

  it("bascule vers le tableau puis conserve les filtres BL", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /tableau/i }));
    expect(screen.getByTestId("location")).toHaveTextContent("view=table");
    expect(screen.getByRole("table", { name: /bons de livraison/i })).toBeInTheDocument();
    expect(mocks.boardArgs.filters).toEqual({ allDates: true });
  });

  it("ouvre Reprogrammer depuis une tournée publiée verrouillée", async () => {
    const user = userEvent.setup();
    renderPage("/?date=2026-08-26");
    expect(screen.getByText("Livreur Test")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /reprogrammer/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent(/reprogrammer la livraison/i);
  });

  it("affiche le nombre de BL et d'articles dans chaque colonne livreur", () => {
    renderPage("/?date=2026-08-26");
    expect(screen.getByLabelText("Livreur Test, 1 BL, 12 articles")).toBeInTheDocument();
    expect(screen.getByLabelText("Livreur 2, 0 BL, 0 articles")).toBeInTheDocument();
  });

  it("affiche la tournée avec ses BL à l'intérieur et une zone nouvelle tournée", () => {
    renderPage("/?date=2026-08-26");
    expect(screen.getByText("LIV-26-08-00002")).toBeInTheDocument();
    expect(screen.getByText("MAT-DN-2026-00003")).toBeInTheDocument();
    expect(screen.getByLabelText("LIV-26-08-00002, 1 BL, 12 articles")).toBeInTheDocument();
    expect(screen.getAllByText("Nouvelle tournée").length).toBeGreaterThan(0);
  });

  it("sélectionne plusieurs BL du backlog et ouvre l'affectation groupée", async () => {
    const user = userEvent.setup();
    mocks.currentBoard = {
      ...board,
      assignments: [
        assignment({ deliveryNote: "DN-1" }),
        assignment({ deliveryNote: "DN-2" }),
      ],
      routes: [],
    };
    renderPage();
    await user.click(screen.getAllByRole("button", { name: /^sélectionner$/i })[0]);
    expect(screen.getByText(/1 BL sélectionné/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /affecter à une tournée/i }));
    expect(screen.getByText(/affecter 1 BL/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^affecter$/i })).toBeInTheDocument();
  });

  it("pagine les BL au-delà de 20 lignes", async () => {
    const user = userEvent.setup();
    const extra = Array.from({ length: LIST_PAGE_SIZE + 1 }, (_, index) =>
      assignment({ deliveryNote: `DN-PAGE-${String(index + 1).padStart(2, "0")}` }),
    );
    mocks.currentBoard = { ...board, assignments: extra };
    renderPage("/?view=table");
    const table = screen.getByRole("table", { name: /bons de livraison/i });
    expect(within(table).getByText("DN-PAGE-01")).toBeInTheDocument();
    expect(within(table).queryByText("DN-PAGE-21")).not.toBeInTheDocument();
    expect(screen.getByText("1–20 sur 21")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Page 2" }));
    expect(within(table).queryByText("DN-PAGE-01")).not.toBeInTheDocument();
    expect(within(table).getByText("DN-PAGE-21")).toBeInTheDocument();
  });
});
