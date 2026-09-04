import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PreparationPage } from "@/features/preparation/PreparationPage";
import { SalesOrderDetailPage } from "@/features/preparation/SalesOrderDetailPage";

const mocks = vi.hoisted(() => ({
  createPickList: vi.fn().mockResolvedValue({ name: "SESSION-PL-1", pick_lists: [{ name: "PL-1" }] }),
  acknowledgeModification: vi.fn().mockResolvedValue({ name: "SO-1" }),
  detail: {
    name: "SO-1",
    customer: "C-1",
    customer_name: "Client Test 1",
    delivery_date: "2099-01-01",
    total_qty: 14,
    custom_wilaya: "Alger",
    custom_commune: "COM-0001",
    custom_commune_nom: "Alger Centre",
    can_create_pick_list: true,
    status: "To Deliver",
    picked_qty: 0,
    requested_qty: 14,
    existing_pick_list: undefined as string | undefined,
    draft_pick_list: undefined as string | undefined,
    has_available_stock: true,
    stock_shortages: [] as Array<{ item_code: string; item_name: string; warehouse: string; required: number; available: number }>,
    custom_preparation_status: undefined as string | undefined,
    items: [
      { item_code: "ART-1", item_name: "Article 1", warehouse: "Magasins - MP", required: 12, available: 0, uom: "Unité" },
      { item_code: "ART-2", item_name: "Article 2", warehouse: "Magasins - MP", required: 2, available: 10, uom: "Unité" },
    ] as Array<{ item_code: string; item_name: string; warehouse: string; required: number; available: number; uom: string; pick_list?: string | null }>,
  },
  pickListData: {
    message: {
      name: "SESSION-PL-1",
      sales_orders: ["SO-1"],
      pick_lists: [{
        name: "PL-1",
        docstatus: 0,
        sales_orders: ["SO-1"],
        locations: [{
          name: "PLI-1",
          pick_list: "PL-1",
          item_code: "ART-1",
          item_name: "Article test",
          warehouse: "DEPOT",
          qty: 2,
          stock_qty: 2,
          picked_qty: 0,
          sales_order: "SO-1",
        }],
        grouped: [],
        delivery_notes: [],
      }],
      grouped: [{
        item_code: "ART-1",
        item_name: "Article test",
        warehouse: "DEPOT",
        stock_qty: 2,
        picked_qty: 0,
        locations: [{
          name: "PLI-1",
          pick_list: "PL-1",
          item_code: "ART-1",
          item_name: "Article test",
          warehouse: "DEPOT",
          qty: 2,
          stock_qty: 2,
          picked_qty: 0,
          sales_order: "SO-1",
        }],
      }],
      delivery_notes: [],
    },
  },
}));

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    start = vi.fn().mockResolvedValue(null);
    stop = vi.fn().mockResolvedValue(undefined);
    clear = vi.fn();
    static getCameras = vi.fn().mockResolvedValue([]);
  },
}));

vi.mock("@/shared/api/preparation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api/preparation")>();
  return {
    ...actual,
    usePreparationQueue: () => ({ data: { message: [] }, mutate: vi.fn(), error: undefined, isLoading: false }),
    usePickSession: () => ({ data: mocks.pickListData, mutate: vi.fn(), error: undefined, isLoading: false }),
    useRecentPickLists: () => ({ data: { message: [] }, error: undefined, isLoading: false, mutate: vi.fn() }),
    useSalesOrderPickDetail: () => ({ data: { message: mocks.detail }, error: undefined, isLoading: false, mutate: vi.fn() }),
    usePreparationMutations: () => ({
      createPickList: mocks.createPickList,
      updateQuantities: vi.fn(),
      submitPickList: vi.fn(),
      scanPickItem: vi.fn(),
      acknowledgeModification: mocks.acknowledgeModification,
      creating: false,
      saving: false,
      submitting: false,
      scanning: false,
      acknowledging: false,
    }),
  };
});

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useReturnRoutes: () => ({ data: { message: [] }, error: undefined, isLoading: false, mutate: vi.fn() }),
  useDistributionMutations: () => ({ confirmRouteReturn: vi.fn(), fulfillment: false }),
}));

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/preparation/commandes/SO-1"]}>
      <Routes>
        <Route path="/preparation" element={<PreparationPage />} />
        <Route path="/preparation/commandes/:orderId" element={<SalesOrderDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SalesOrderDetailPage", () => {
  beforeEach(() => {
    mocks.createPickList.mockReset().mockResolvedValue({ name: "SESSION-PL-1", pick_lists: [{ name: "PL-1" }] });
    mocks.acknowledgeModification.mockReset().mockResolvedValue({ name: "SO-1", custom_preparation_status: null });
    mocks.detail.can_create_pick_list = true;
    mocks.detail.existing_pick_list = undefined;
    mocks.detail.draft_pick_list = undefined;
    mocks.detail.has_available_stock = true;
    mocks.detail.stock_shortages = [
      { item_code: "ART-1", item_name: "Article 1", warehouse: "Magasins - MP", required: 12, available: 0 },
    ];
    mocks.detail.custom_preparation_status = undefined;
    mocks.detail.items = [
      { item_code: "ART-1", item_name: "Article 1", warehouse: "Magasins - MP", required: 12, available: 0, uom: "Unité" },
      { item_code: "ART-2", item_name: "Article 2", warehouse: "Magasins - MP", required: 2, available: 10, uom: "Unité" },
    ];
  });

  it("affiche les lignes articles avec l’état stock", () => {
    renderDetail();
    expect(screen.getByRole("heading", { name: "SO-1" })).toBeInTheDocument();
    expect(screen.getByText("Article 1")).toBeInTheDocument();
    expect(screen.getByText("Article 2")).toBeInTheDocument();
    expect(screen.getByText("Rupture")).toBeInTheDocument();
    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.getAllByText("Client Test 1").length).toBeGreaterThan(0);
    expect(screen.getByText("Alger Centre · Alger")).toBeInTheDocument();
    expect(screen.getAllByText("Sans liste")).toHaveLength(2);
  });

  it("crée la liste de prélèvement depuis la fiche puis ouvre la session", async () => {
    mocks.detail.stock_shortages = [];
    mocks.detail.items = [
      { item_code: "ART-1", item_name: "Article test", warehouse: "DEPOT", required: 2, available: 10, uom: "Unité" },
    ];
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    expect(screen.getByRole("dialog", { name: /confirmer la création/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /confirmer la création/i }));
    await waitFor(() => expect(mocks.createPickList).toHaveBeenCalledWith(["SO-1"]));
    expect(await screen.findByRole("heading", { name: "PL-1" })).toBeInTheDocument();
  });

  it("crée la liste du disponible depuis la fiche si une ligne est en rupture", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    expect(screen.getByRole("dialog", { name: /prélever le disponible/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /créer la liste du disponible/i }));
    await waitFor(() => expect(mocks.createPickList).toHaveBeenCalledWith(["SO-1"]));
    expect(await screen.findByRole("heading", { name: "PL-1" })).toBeInTheDocument();
  });

  it("bloque la confirmation si aucun article n’a de stock", async () => {
    mocks.detail.has_available_stock = false;
    mocks.detail.items = [
      { item_code: "ART-1", item_name: "Article 1", warehouse: "Magasins - MP", required: 12, available: 0, uom: "Unité" },
    ];
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    expect(screen.getByRole("dialog", { name: /stock insuffisant/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirmer la création/i })).toBeDisabled();
    expect(mocks.createPickList).not.toHaveBeenCalled();
  });

  it("ouvre la liste depuis la ligne et affiche Sans liste pour le reste", async () => {
    mocks.detail.can_create_pick_list = false;
    mocks.detail.draft_pick_list = "PL-1";
    mocks.detail.items = [
      { item_code: "ART-1", item_name: "Article 1", warehouse: "Magasins - MP", required: 1, available: 0, uom: "Unité", pick_list: null },
      { item_code: "ART-2", item_name: "Article 2", warehouse: "Magasins - MP", required: 1, available: 10, uom: "Unité", pick_list: "PL-1" },
    ];
    const user = userEvent.setup();
    renderDetail();

    expect(screen.queryByRole("button", { name: /créer la liste de prélèvement/i })).not.toBeInTheDocument();
    expect(screen.getByText("Sans liste")).toBeInTheDocument();
    const openLine = screen.getByRole("button", { name: "Ouvrir PL-1" });
    expect(openLine).toBeInTheDocument();
    expect(openLine).toHaveTextContent("PL-1");

    await user.click(openLine);
    expect(await screen.findByRole("heading", { name: "PL-1" })).toBeInTheDocument();
  });

  it("affiche un bandeau Commande modifiée", () => {
    mocks.detail.custom_preparation_status = "Modifiée";
    renderDetail();
    expect(screen.getByText("Commande modifiée.")).toBeInTheDocument();
    expect(screen.getAllByText("Modifiée").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /prendre connaissance des modifications/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /créer la liste de prélèvement/i })).not.toBeInTheDocument();
  });

  it("bloque l’ouverture de liste tant que la modification n’est pas acceptée", () => {
    mocks.detail.custom_preparation_status = "Modifiée";
    mocks.detail.can_create_pick_list = false;
    mocks.detail.draft_pick_list = "PL-1";
    mocks.detail.items = [
      { item_code: "ART-2", item_name: "Article 2", warehouse: "Magasins - MP", required: 1, available: 10, uom: "Unité", pick_list: "PL-1" },
    ];
    renderDetail();
    expect(screen.getByRole("button", { name: "Ouvrir PL-1" })).toBeDisabled();
  });

  it("enregistre l’acceptation de la commande modifiée", async () => {
    mocks.detail.custom_preparation_status = "Modifiée";
    mocks.detail.stock_shortages = [];
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole("button", { name: /prendre connaissance des modifications/i }));
    await waitFor(() => expect(mocks.acknowledgeModification).toHaveBeenCalledWith("SO-1"));
  });
});
