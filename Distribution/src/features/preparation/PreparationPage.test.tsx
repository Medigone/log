import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PreparationPage } from "@/features/preparation/PreparationPage";
import { SalesOrderDetailPage } from "@/features/preparation/SalesOrderDetailPage";
import { chooseOption } from "@/test/chooseOption";

const mocks = vi.hoisted(() => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  const location = {
    name: "PLI-1",
    pick_list: "PL-1",
    item_code: "ART-1",
    item_name: "Article test",
    warehouse: "DEPOT",
    qty: 2,
    stock_qty: 2,
    picked_qty: 0,
    sales_order: "SO-1",
  };
  const draftSession = {
    name: "SESSION-PL-1",
    sales_orders: ["SO-1"],
    pick_lists: [{ name: "PL-1", docstatus: 0, sales_orders: ["SO-1"], locations: [location], grouped: [] as never[], delivery_notes: [] as Array<{ name: string; customer_name: string }> }],
    grouped: [{ item_code: "ART-1", item_name: "Article test", warehouse: "DEPOT", stock_qty: 2, picked_qty: 0, locations: [location] }],
    delivery_notes: [] as Array<{ name: string; customer_name: string }>,
    order_changed_notice: null as string | null | undefined,
    modification_pending: false as boolean | undefined,
    pending_sales_orders: undefined as string[] | undefined,
  };
  return {
    createPickList: vi.fn().mockResolvedValue({ name: "SESSION-PL-1", pick_lists: [{ name: "PL-1" }] }),
    submitPickList: vi.fn().mockResolvedValue({ delivery_notes: [{ name: "DN-1", customer_name: "Client Test 1" }] }),
    acknowledgeModification: vi.fn().mockResolvedValue({ name: "SO-1" }),
    updateQuantities: vi.fn().mockResolvedValue({ name: "PL-1" }),
    scanPickItem: vi.fn().mockResolvedValue({
      item_code: "ART-1",
      item_name: "Article test",
      increment: 1,
      barcode: "123456",
    }),
    queueData: { message: [] as Array<{
      name: string
      customer_name: string
      delivery_date: string
      total_qty: number
      custom_wilaya: string
      custom_commune: string
      custom_commune_nom: string
      status?: string
      can_create_pick_list?: boolean
      draft_pick_list?: string
      draft_pick_lists?: string[]
      existing_pick_list?: string
      pick_lists?: Array<{ name: string; docstatus: number }>
      picked_qty?: number
      requested_qty?: number
      per_picked?: number
      has_available_stock?: boolean
      pick_incomplete?: boolean
      ready_to_complete?: boolean
      uncovered_qty?: number
      custom_preparation_status?: string | null
      stock_shortages?: Array<{ item_code: string; item_name: string; warehouse: string; required: number; available: number }>
      items?: Array<{ item_code: string; item_name: string; warehouse: string; required: number; available: number; uom?: string }>
    }> },
    location,
    draftSession,
    pickListData: { message: structuredClone(draftSession) },
    returnRoutes: [] as Array<{ name: string; stock: { remainingQuantity: number; status: string; lines: unknown[] } }>,
    returnHistory: [] as Array<{
      name: string
      date?: string
      revision?: number
      customers?: Array<{ name: string; customerName: string }>
      status: string
      remainingQuantity: number
      returnedQuantity?: number
      loadedQuantity?: number
      deliveredQuantity?: number
      lines: unknown[]
    }>,
    recentPickLists: [] as Array<{
      name: string
      docstatus: number
      status?: string
      modified: string
      sales_order_count: number
      sales_orders?: string[]
      customer_names?: string[]
      wilayas?: string[]
      communes?: string[]
      commune_noms?: string[]
      custom_commune?: string | null
      custom_commune_nom?: string | null
      delivery_date?: string | null
      transaction_date?: string | null
      requested_qty?: number
      picked_qty?: number
      warehouses?: string[]
      delivery_notes: string[]
      custom_order_changed?: number
      items?: Array<{ item_code: string; item_name: string; warehouse?: string; sales_order?: string; requested_qty: number; picked_qty: number; uom?: string }>
    }>,
    baseQueue: [
      { name: "SO-1", customer_name: "Client Test 1", delivery_date: tomorrowIso, total_qty: 2, custom_wilaya: "Alger", custom_commune: "COM-0001", custom_commune_nom: "Alger Centre", status: "To Deliver", items: [{ item_code: "ART-1", item_name: "Article test", warehouse: "DEPOT", required: 2, available: 10, uom: "Unité" }] },
      { name: "SO-2", customer_name: "Client Test 2", delivery_date: tomorrowIso, total_qty: 3, custom_wilaya: "Alger", custom_commune: "COM-0002", custom_commune_nom: "Bab Ezzouar", status: "To Deliver and Bill", items: [{ item_code: "ART-2", item_name: "Article deux", warehouse: "DEPOT", required: 3, available: 3, uom: "Unité" }] },
      { name: "SO-3", customer_name: "Client Test 3", delivery_date: "2099-01-01", total_qty: 1, custom_wilaya: "Oran", custom_commune: "COM-0003", custom_commune_nom: "Oran", status: "To Deliver" },
    ],
    baseLists: [
      {
        name: "PL-1",
        docstatus: 0,
        status: "Draft",
        modified: "2026-09-01 10:00:00",
        sales_order_count: 1,
        sales_orders: ["SO-1"],
        customer_names: ["Client Test 1"],
        wilayas: ["Alger"],
        communes: ["COM-0001"],
        commune_noms: ["Alger Centre"],
        custom_commune: "COM-0001",
        custom_commune_nom: "Alger Centre",
        delivery_date: tomorrowIso,
        transaction_date: tomorrowIso,
        requested_qty: 2,
        picked_qty: 0,
        warehouses: ["DEPOT"],
        delivery_notes: [],
        items: [{ item_code: "ART-1", item_name: "Article test", warehouse: "DEPOT", sales_order: "SO-1", requested_qty: 2, picked_qty: 0, uom: "Unité" }],
      },
      {
        name: "PL-2",
        docstatus: 0,
        status: "Draft",
        modified: "2026-09-01 11:00:00",
        sales_order_count: 1,
        sales_orders: ["SO-2"],
        customer_names: ["Client Test 2"],
        wilayas: ["Alger"],
        communes: ["COM-0002"],
        commune_noms: ["Bab Ezzouar"],
        custom_commune: "COM-0002",
        custom_commune_nom: "Bab Ezzouar",
        delivery_date: tomorrowIso,
        transaction_date: tomorrowIso,
        requested_qty: 3,
        picked_qty: 0,
        warehouses: ["DEPOT"],
        delivery_notes: [],
      },
      {
        name: "PL-3",
        docstatus: 1,
        status: "Completed",
        modified: "2026-09-01 12:00:00",
        sales_order_count: 1,
        sales_orders: ["SO-3"],
        customer_names: ["Client Test 3"],
        wilayas: ["Oran"],
        communes: ["COM-0003"],
        commune_noms: ["Oran"],
        custom_commune: "COM-0003",
        custom_commune_nom: "Oran",
        delivery_date: "2099-01-01",
        transaction_date: "2099-01-01",
        requested_qty: 1,
        picked_qty: 1,
        warehouses: ["DEPOT"],
        delivery_notes: [],
      },
    ],
    salesOrderDetail: {
      name: "SO-1",
      customer: "C-1",
      customer_name: "Client Test 1",
      delivery_date: tomorrowIso,
      total_qty: 2,
      custom_wilaya: "Alger",
      custom_commune: "COM-0001",
      custom_commune_nom: "Alger Centre",
      can_create_pick_list: true,
      existing_pick_list: undefined as string | undefined,
      stock_shortages: [] as Array<{ item_code: string; item_name: string; warehouse: string; required: number; available: number }>,
      items: [
        { item_code: "ART-1", item_name: "Article test", warehouse: "DEPOT", required: 2, available: 10, uom: "Unité" },
      ],
    },
  };
});

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
    usePreparationQueue: () => ({ data: mocks.queueData, mutate: vi.fn(), error: undefined, isLoading: false }),
    usePickSession: () => ({ data: mocks.pickListData, mutate: vi.fn(), error: undefined, isLoading: false }),
    useRecentPickLists: () => ({ data: { message: mocks.recentPickLists }, error: undefined, isLoading: false, mutate: vi.fn() }),
    usePickListQueueStats: () => ({ data: undefined, error: undefined, isLoading: false }),
    useSalesOrderPickDetail: () => ({ data: { message: mocks.salesOrderDetail }, error: undefined, isLoading: false, mutate: vi.fn() }),
    usePreparationMutations: () => ({
      createPickList: mocks.createPickList,
      updateQuantities: mocks.updateQuantities,
      submitPickList: mocks.submitPickList,
      scanPickItem: mocks.scanPickItem,
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
  useReturnRoutes: () => ({ data: { message: mocks.returnRoutes }, error: undefined, isLoading: false, mutate: vi.fn() }),
  useReturnHistory: () => ({ data: { message: mocks.returnHistory }, error: undefined, isLoading: false, mutate: vi.fn() }),
  useReturnMetrics: () => ({ data: undefined, error: undefined, isLoading: false }),
  useDistributionMutations: () => ({ confirmRouteReturn: vi.fn(), fulfillment: false }),
}));

function renderPrep(entry = "/preparation") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/preparation" element={<PreparationPage />} />
        <Route path="/preparation/commandes/:orderId" element={<SalesOrderDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderWorkspace() {
  return renderPrep("/preparation?pick_lists=PL-1");
}

function pickedQty(code = "ART-1") {
  return screen.getByLabelText(`Quantité prélevée ${code}`);
}

describe("PreparationPage", () => {
  beforeEach(() => {
    mocks.createPickList.mockReset().mockResolvedValue({ name: "SESSION-PL-1", pick_lists: [{ name: "PL-1" }] });
    mocks.submitPickList.mockReset().mockResolvedValue({ delivery_notes: [{ name: "DN-1", customer_name: "Client Test 1" }] });
    mocks.acknowledgeModification.mockReset().mockResolvedValue({ name: "SO-1" });
    mocks.updateQuantities.mockReset().mockResolvedValue({ name: "PL-1" });
    mocks.scanPickItem.mockReset().mockResolvedValue({
      item_code: "ART-1",
      item_name: "Article test",
      increment: 1,
      barcode: "123456",
    });
    mocks.pickListData.message = structuredClone(mocks.draftSession);
    mocks.queueData.message = mocks.baseQueue.map((order) => ({ ...order }));
    mocks.recentPickLists = mocks.baseLists.map((list) => ({ ...list }));
    mocks.salesOrderDetail = {
      ...mocks.salesOrderDetail,
      name: "SO-1",
      customer_name: "Client Test 1",
      can_create_pick_list: true,
      existing_pick_list: undefined,
      stock_shortages: [],
      items: [
        { item_code: "ART-1", item_name: "Article test", warehouse: "DEPOT", required: 2, available: 10, uom: "Unité" },
      ],
    };
    mocks.returnRoutes = [];
    mocks.returnHistory = [];
    Element.prototype.scrollIntoView = vi.fn();
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1024 });
  });

  it("place les retours dans un onglet dédié avec le nombre à traiter", async () => {
    mocks.returnRoutes = [{
      name: "LIV-RET-1",
      stock: { remainingQuantity: 5, status: "Retour déclaré", lines: [] },
    }];
    mocks.returnHistory = [{
      name: "LIV-RET-1",
      date: "2026-09-05",
      revision: 1,
      customers: [],
      status: "Retour déclaré",
      remainingQuantity: 5,
      returnedQuantity: 0,
      loadedQuantity: 5,
      deliveredQuantity: 0,
      lines: [],
    }];
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);

    expect(screen.getByRole("tab", { name: /listes/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: /commandes/i })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /retours/i })).toHaveTextContent("1");
    expect(screen.queryByText("LIV-RET-1")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /retours/i }));
    expect(screen.getByText("LIV-RET-1")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /LIV-RET-1/ })).getByText(/5 à retourner/)).toBeInTheDocument();
    expect(screen.queryByText("Listes de prélèvement (3)")).not.toBeInTheDocument();
  });

  it("ouvre les listes quand l’URL pointe encore vers l’onglet Commandes", () => {
    renderPrep("/preparation?tab=commandes");
    expect(screen.getByRole("tab", { name: /listes/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: /commandes/i })).not.toBeInTheDocument();
    expect(screen.getByText("Listes de prélèvement (3)")).toBeInTheDocument();
  });

  it("passe de la file de listes au contrôle des écarts", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);
    await user.click(screen.getByRole("checkbox", { name: "Sélectionner PL-1" }));
    await user.click(screen.getByRole("button", { name: "Ouvrir la liste" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "PL-1" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /^tout$/i }));
    await user.click(screen.getByRole("button", { name: /contrôle final/i }));
    expect(screen.getByRole("button", { name: /confirmer et créer les BL/i })).toBeInTheDocument();
  });

  it("demande confirmation avant de créer les BL puis affiche le succès", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /tout prélever/i }));
    await user.click(screen.getByRole("button", { name: /contrôle final/i }));
    await user.click(screen.getByRole("button", { name: /confirmer et créer les BL/i }));
    expect(screen.getByRole("dialog", { name: /confirmer la création des BL/i })).toBeInTheDocument();
    expect(screen.getByText(/un bon de livraison sera créé/i)).toBeInTheDocument();
    expect(mocks.submitPickList).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^annuler$/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.submitPickList).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /confirmer et créer les BL/i }));
    await user.click(screen.getByRole("button", { name: /^créer les BL$/i }));
    await waitFor(() => expect(mocks.submitPickList).toHaveBeenCalledWith("PL-1"));
    expect(await screen.findByText(/bons de livraison créés avec succès/i)).toBeInTheDocument();
    expect(screen.getAllByText("DN-1").length).toBeGreaterThan(0);
  });

  it("permet de sélectionner des listes pour les ouvrir", async () => {
    const user = userEvent.setup();
    renderPrep();
    expect(screen.getByRole("checkbox", { name: /sélectionner pl-1/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /tout sélectionner/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^ouvrir la liste$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /sélectionner pl-1/i }));
    expect(screen.getByRole("button", { name: /^ouvrir la liste$/i })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /^ouvrir la liste$/i }));
    expect(await screen.findByRole("heading", { name: "PL-1" })).toBeInTheDocument();
  });

  it("affiche le filtre de dates de livraison dans la barre", async () => {
    const user = userEvent.setup();
    renderPrep();
    expect(screen.getByRole("combobox", { name: "Échéance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Période" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /plus de filtres/i }));
    expect(screen.getByRole("combobox", { name: "Client" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Échéance" })).toBeInTheDocument();
  });

  it("filtre les listes de demain par wilaya et commune", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);

    await chooseOption(user, screen.getByRole("combobox", { name: "Échéance" }), /demain/i);
    await user.click(screen.getByRole("button", { name: /plus de filtres/i }));
    await chooseOption(user, screen.getByRole("combobox", { name: "Wilaya" }), "Alger");
    expect(screen.getByText("Listes de prélèvement (2)")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Commune" }));
    expect(await screen.findByRole("option", { name: "Alger Centre" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "COM-0001" })).not.toBeInTheDocument();
  });

  it("filtre les listes en retard depuis l’URL", () => {
    mocks.recentPickLists[0] = { ...mocks.recentPickLists[0], name: "PL-LATE", sales_orders: ["SO-LATE"], delivery_date: "2020-01-01" };
    renderPrep("/preparation?dateScope=overdue");
    expect(screen.getByRole("row", { name: /PL-LATE/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /SO-2/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /SO-3/ })).not.toBeInTheDocument();
  });

  it("filtre les listes en retard depuis l’alerte", async () => {
    mocks.recentPickLists[0] = { ...mocks.recentPickLists[0], name: "PL-LATE", sales_orders: ["SO-LATE"], delivery_date: "2020-01-01" };
    const user = userEvent.setup();
    renderPrep();
    expect(screen.getByRole("row", { name: /SO-2/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /anomalie/i }));
    await user.click(screen.getByRole("button", { name: /filtrer sur les retards/i }));
    expect(screen.queryByRole("button", { name: /filtrer sur les retards/i })).not.toBeInTheDocument();
    expect(screen.getByRole("row", { name: /PL-LATE/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /SO-2/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /SO-3/ })).not.toBeInTheDocument();
  });

  it("ouvre la pick list au clic sur la ligne", async () => {
    const user = userEvent.setup();
    renderPrep();
    const row = screen.getByRole("row", { name: /PL-1/ });
    await user.click(within(row).getByText("PL-1"));
    expect(await screen.findByRole("heading", { name: "PL-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /contrôle final/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "SO-1" })).not.toBeInTheDocument();
  });

  it("déplie les articles et quantités d’une liste dans le sous-tableau", async () => {
    const user = userEvent.setup();
    renderPrep();
    expect(screen.queryByText("Demandé restant")).not.toBeInTheDocument();
    const row = screen.getByRole("row", { name: /SO-1/ });
    await user.click(within(row).getByRole("button", { name: "Afficher les articles" }));
    expect(screen.getByRole("region", { name: "Articles de la liste de prélèvement" })).toBeInTheDocument();
    expect(screen.getByText("Article test")).toBeInTheDocument();
    expect(screen.getByText("ART-1")).toBeInTheDocument();
    expect(screen.getByText("2 Unité")).toBeInTheDocument();
    expect(screen.getByText("DEPOT")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /SO-2/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /SO-3/ })).toBeInTheDocument();
  });

  it("affiche le lieu et permet de masquer la colonne", async () => {
    const user = userEvent.setup();
    renderPrep();
    expect(screen.getByText("Alger Centre")).toBeInTheDocument();
    expect(screen.getAllByText("Alger").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Colonnes" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Lieu" }));
    expect(screen.queryByText("Alger Centre")).not.toBeInTheDocument();
  });

  it("pagine les listes et affiche la page suivante", async () => {
    mocks.recentPickLists = Array.from({ length: 12 }, (_, index) => ({
      ...mocks.baseLists[0],
      name: `PL-${index + 1}`,
      sales_orders: [`SO-${index + 1}`],
      customer_names: [`Client Test ${index + 1}`],
    }));
    const user = userEvent.setup();
    renderPrep();
    expect(screen.getByText("Listes de prélèvement (12)")).toBeInTheDocument();
    expect(screen.getByText("1 – 10 sur 12")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /SO-1\b/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /SO-12\b/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Page suivante" }));
    expect(screen.getByText("11 – 12 sur 12")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /SO-12\b/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /SO-1\b/ })).not.toBeInTheDocument();
  });

  it("filtre les listes par client", async () => {
    const user = userEvent.setup();
    renderPrep();
    await user.click(screen.getByRole("button", { name: /plus de filtres/i }));
    await chooseOption(user, screen.getByRole("combobox", { name: "Client" }), "Client Test 1");
    expect(screen.getByText("Listes de prélèvement (1)")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /SO-1/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /SO-2/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /SO-3/ })).not.toBeInTheDocument();
  });

  it("initialise les quantités prélevées à 0", async () => {
    renderWorkspace();
    expect(await screen.findByRole("heading", { name: "PL-1" })).toBeInTheDocument();
    expect(pickedQty()).toHaveTextContent("0 / 2");
    expect(screen.getByText(/0 \/ 2 unités prélevées/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /restants/i })).toBeInTheDocument();
  });

  it("incrémente la quantité au scan d’un code-barres de la session", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const scan = await screen.findByLabelText(/code-barres article/i);
    await user.type(scan, "123456{Enter}");
    await waitFor(() => expect(pickedQty()).toHaveTextContent("1 / 2"));
    expect(mocks.scanPickItem).toHaveBeenCalledWith("123456", ["PL-1"]);
    expect(screen.getByText(/ART-1 · 1 \/ 2/i)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /ART-1 · Article test/i })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.updateQuantities).toHaveBeenCalledWith("PL-1", [{ name: "PLI-1", picked_qty: 1 }]),
    );
  });

  it("réhydrate une quantité déjà enregistrée sans l’écraser", async () => {
    const location = { ...mocks.location, picked_qty: 1 };
    mocks.pickListData.message = {
      ...structuredClone(mocks.draftSession),
      pick_lists: [{ name: "PL-1", docstatus: 0, sales_orders: ["SO-1"], locations: [location], grouped: [], delivery_notes: [] }],
      grouped: [{ item_code: "ART-1", item_name: "Article test", warehouse: "DEPOT", stock_qty: 2, picked_qty: 1, locations: [location] }],
    };
    renderWorkspace();
    expect(await screen.findByRole("heading", { name: "PL-1" })).toBeInTheDocument();
    await waitFor(() => expect(pickedQty()).toHaveTextContent("1 / 2"));
    expect(screen.getByRole("button", { name: /^tout$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remettre à 0/i })).toBeInTheDocument();
  });

  it("remet une ligne partielle à zéro et enregistre picked_qty 0", async () => {
    const location = { ...mocks.location, picked_qty: 1 };
    mocks.pickListData.message = {
      ...structuredClone(mocks.draftSession),
      pick_lists: [{ name: "PL-1", docstatus: 0, sales_orders: ["SO-1"], locations: [location], grouped: [], delivery_notes: [] }],
      grouped: [{ item_code: "ART-1", item_name: "Article test", warehouse: "DEPOT", stock_qty: 2, picked_qty: 1, locations: [location] }],
    };
    const user = userEvent.setup();
    renderWorkspace();
    expect(await screen.findByRole("heading", { name: "PL-1" })).toBeInTheDocument();
    expect(pickedQty()).toHaveTextContent("1 / 2");
    expect(screen.getByRole("button", { name: /^tout$/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /remettre à 0/i }));
    const dialog = await screen.findByRole("dialog", { name: /remettre à 0/i });
    expect(pickedQty()).toHaveTextContent("1 / 2");
    expect(within(dialog).getByText(/ART-1 · Article test/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /^annuler$/i }));
    expect(screen.queryByRole("dialog", { name: /remettre à 0/i })).not.toBeInTheDocument();
    expect(pickedQty()).toHaveTextContent("1 / 2");
    expect(mocks.updateQuantities).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /remettre à 0/i }));
    const confirmDialog = await screen.findByRole("dialog", { name: /remettre à 0/i });
    await user.click(within(confirmDialog).getByRole("button", { name: /^remettre à 0$/i }));
    expect(pickedQty()).toHaveTextContent("0 / 2");
    expect(screen.queryByRole("dialog", { name: /remettre à 0/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remettre à 0/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^tout$/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.updateQuantities).toHaveBeenCalledWith("PL-1", [{ name: "PLI-1", picked_qty: 0 }]),
    );
  });

  it("en mode quantité, ouvre un dialogue puis applique la saisie", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /^quantité$/i }));
    await user.type(screen.getByLabelText(/code-barres article/i), "123456{Enter}");
    const dialog = await screen.findByRole("dialog", { name: /ART-1 · Article test/i });
    expect(pickedQty()).toHaveTextContent("0 / 2");
    const qty = within(dialog).getByRole("spinbutton", { name: /quantité à prélever/i });
    await user.clear(qty);
    await user.type(qty, "2");
    await user.click(within(dialog).getByRole("button", { name: /^confirmer$/i }));
    await waitFor(() => expect(pickedQty()).toHaveTextContent("2 / 2"));
    expect(screen.queryByRole("dialog", { name: /ART-1 · Article test/i })).not.toBeInTheDocument();
  });

  it("en mode quantité, annuler laisse la quantité inchangée", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /^quantité$/i }));
    await user.type(screen.getByLabelText(/code-barres article/i), "123456{Enter}");
    const dialog = await screen.findByRole("dialog", { name: /ART-1 · Article test/i });
    await user.click(within(dialog).getByRole("button", { name: /^annuler$/i }));
    expect(pickedQty()).toHaveTextContent("0 / 2");
    expect(screen.queryByRole("dialog", { name: /ART-1 · Article test/i })).not.toBeInTheDocument();
  });

  it("en mode quantité, plafonne la saisie au restant", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /^quantité$/i }));
    await user.type(screen.getByLabelText(/code-barres article/i), "123456{Enter}");
    const dialog = await screen.findByRole("dialog", { name: /ART-1 · Article test/i });
    const qty = within(dialog).getByRole("spinbutton", { name: /quantité à prélever/i });
    await user.clear(qty);
    await user.type(qty, "99");
    expect(screen.getByText(/limitée à 2/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /^confirmer$/i }));
    await waitFor(() => expect(pickedQty()).toHaveTextContent("2 / 2"));
  });

  it("refuse un scan au-delà de la quantité demandée", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const scan = await screen.findByLabelText(/code-barres article/i);
    await user.type(scan, "123456{Enter}");
    await waitFor(() => expect(pickedQty()).toHaveTextContent("1 / 2"));
    await user.type(scan, "123456{Enter}");
    await waitFor(() => expect(pickedQty()).toHaveTextContent("2 / 2"));
    await user.type(scan, "123456{Enter}");
    expect((await screen.findAllByText(/quantité déjà atteinte/i)).length).toBeGreaterThan(0);
    expect(pickedQty()).toHaveTextContent("2 / 2");
  });

  it("signale un article hors session de préparation", async () => {
    mocks.scanPickItem.mockResolvedValueOnce({
      item_code: "ART-OTHER",
      item_name: "Autre article",
      increment: 1,
      barcode: "999",
    });
    const user = userEvent.setup();
    renderWorkspace();
    const scan = await screen.findByLabelText(/code-barres article/i);
    await user.type(scan, "999{Enter}");
    expect(await screen.findByText(/n'est pas dans la session de préparation/i)).toBeInTheDocument();
    expect(pickedQty()).toHaveTextContent("0 / 2");
  });

  it("filtre les lignes restantes", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    expect(await screen.findByRole("heading", { name: "PL-1" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /restants/i }));
    expect(screen.getAllByText(/article test/i).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /^tout$/i }));
    expect(screen.getByText(/plus rien à prélever/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /réinitialiser les filtres/i }));
    expect(screen.getAllByText(/article test/i).length).toBeGreaterThan(0);
  });

  it("affiche le recap BL d'une liste déjà soumise sans saisie", async () => {
    const location = { ...mocks.location, picked_qty: 2 };
    mocks.pickListData.message = {
      name: "SESSION-PL-1",
      sales_orders: ["SO-1"],
      pick_lists: [{ name: "PL-1", docstatus: 1, sales_orders: ["SO-1"], locations: [location], grouped: [], delivery_notes: [{ name: "DN-1", customer_name: "Client Test 1" }] }],
      grouped: [{ item_code: "ART-1", item_name: "Article test", warehouse: "DEPOT", stock_qty: 2, picked_qty: 2, locations: [location] }],
      delivery_notes: [{ name: "DN-1", customer_name: "Client Test 1" }],
      order_changed_notice: null,
      modification_pending: false,
      pending_sales_orders: undefined,
    };
    renderWorkspace();
    expect(await screen.findByRole("heading", { name: "PL-1" })).toBeInTheDocument();
    expect(screen.getByText(/liste soumise/i)).toBeInTheDocument();
    expect(screen.getAllByText(/complet/i).length).toBeGreaterThan(0);
    expect(screen.getByText("DN-1")).toBeInTheDocument();
    expect(screen.queryByLabelText(/code-barres article/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ouvrir la caméra" })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /contrôle final/i })).not.toBeInTheDocument();
  });

  it("ne propose pas la caméra sur le poste fixe", async () => {
    renderWorkspace();
    expect(await screen.findByLabelText(/code-barres article/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ouvrir la caméra" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^scanner$/i })).not.toBeInTheDocument();
  });

  it("sur mobile, priorise le bouton Scanner et met à jour le compteur en direct", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 390 });
    const user = userEvent.setup();
    renderWorkspace();
    expect(await screen.findByRole("button", { name: /^scanner$/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "État" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ouvrir la caméra" })).not.toBeInTheDocument();
    expect(screen.getByText(/scannez un article/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^scanner$/i }));
    expect(screen.getByRole("dialog", { name: /scanner un code-barres/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /fermer/i }));

    await user.click(screen.getByRole("button", { name: /saisir un code/i }));
    await user.type(screen.getByLabelText(/code-barres article/i), "123456{Enter}");
    expect(await screen.findByText(/reste 1/i)).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(mocks.scanPickItem).toHaveBeenCalledWith("123456", ["PL-1"]);
    expect(screen.getByRole("button", { name: /remettre à 0/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /remettre à 0/i }));
    const resetDialog = await screen.findByRole("dialog", { name: /remettre à 0/i });
    expect(screen.getByText("1/2")).toBeInTheDocument();
    await user.click(within(resetDialog).getByRole("button", { name: /^remettre à 0$/i }));
    expect(screen.getByText("0/2")).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.updateQuantities).toHaveBeenCalledWith("PL-1", [{ name: "PLI-1", picked_qty: 0 }]),
    );
  });

  it("garde une liste déjà couverte visible avec son statut et l’ouvre", async () => {
    mocks.recentPickLists = [{
      ...mocks.baseLists[0],
      name: "PL-COVER",
      requested_qty: 2,
      picked_qty: 1,
    }];
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);

    expect(screen.getByText("Listes de prélèvement (1)")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /SO-1/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Sélectionner PL-COVER" })).toBeInTheDocument();
    expect(screen.getAllByText("Liste brouillon").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("progressbar", { name: /prélèvement 1 sur 2/i })[0]).toHaveAttribute("aria-valuenow", "50");
    await user.click(screen.getByRole("checkbox", { name: "Sélectionner PL-COVER" }));
    expect(screen.getByRole("button", { name: "Ouvrir la liste" })).toBeEnabled();
  });

  it("affiche une liste soumise et la barre à 100 %", async () => {
    mocks.recentPickLists = [{
      ...mocks.baseLists[0],
      name: "PL-DONE",
      docstatus: 1,
      status: "Completed",
      requested_qty: 2,
      picked_qty: 2,
    }];
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);

    expect(screen.getAllByText("Liste soumise").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("progressbar", { name: /prélèvement 2 sur 2/i })[0]).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByRole("checkbox", { name: "Sélectionner PL-DONE" })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Sélectionner PL-DONE" }));
    expect(screen.getByRole("button", { name: "Ouvrir la liste" })).toBeEnabled();
  });

  it("filtre les listes brouillon depuis le chip", async () => {
    const user = userEvent.setup();
    renderPrep();
    await user.click(screen.getByRole("button", { name: /^brouillon$/i }));
    expect(screen.getByText("Listes de prélèvement (2)")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /SO-1/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /SO-2/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /SO-3/ })).not.toBeInTheDocument();
  });

  it("ouvre plusieurs listes sélectionnées", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);

    await user.click(screen.getByRole("checkbox", { name: "Sélectionner PL-1" }));
    await user.click(screen.getByRole("checkbox", { name: "Sélectionner PL-2" }));
    await user.click(screen.getByRole("button", { name: "Ouvrir les listes" }));
    expect(await screen.findByRole("heading", { name: "PL-1" })).toBeInTheDocument();
  });

  it("ouvre une liste depuis l’onglet Listes", async () => {
    mocks.recentPickLists = [{
      ...mocks.baseLists[0],
      items: [{ item_code: "ART-1", item_name: "Article test", warehouse: "DEPOT", sales_order: "SO-1", requested_qty: 2, picked_qty: 0, uom: "Unité" }],
    }];
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);

    expect(screen.getByRole("tab", { name: /listes/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Listes de prélèvement (1)")).toBeInTheDocument();
    expect(screen.getByText(/Client Test 1/)).toBeInTheDocument();
    await user.click(screen.getByText("PL-1"));
    expect(await screen.findByRole("heading", { name: "PL-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^listes$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /contrôle final/i })).toBeInTheDocument();
  });

  it("déplie les articles d’une liste de prélèvement", async () => {
    mocks.recentPickLists = [{
      name: "PL-1",
      docstatus: 0,
      status: "Draft",
      modified: "2026-09-01 10:00:00",
      sales_order_count: 1,
      sales_orders: ["SO-1"],
      customer_names: ["Client Test 1"],
      requested_qty: 2,
      picked_qty: 0,
      warehouses: ["DEPOT"],
      delivery_notes: [],
      items: [{ item_code: "ART-1", item_name: "Article test", warehouse: "DEPOT", sales_order: "SO-1", requested_qty: 2, picked_qty: 0, uom: "Unité" }],
    }];
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation?tab=listes"]}><PreparationPage /></MemoryRouter>);
    const row = screen.getByRole("row", { name: /PL-1/ });
    await user.click(within(row).getByRole("button", { name: "Afficher les articles" }));
    expect(screen.getByRole("region", { name: "Articles de la liste de prélèvement" })).toBeInTheDocument();
    expect(screen.getByText("Article test")).toBeInTheDocument();
    expect(screen.getByText("ART-1")).toBeInTheDocument();
    expect(screen.getByText("2 Unité")).toBeInTheDocument();
  });

  it("filtre les listes par client et par wilaya", async () => {
    mocks.recentPickLists = [
      {
        name: "PL-1",
        docstatus: 0,
        status: "Draft",
        modified: "2026-09-01 10:00:00",
        sales_order_count: 1,
        sales_orders: ["SO-1"],
        customer_names: ["Client Test 1"],
        wilayas: ["Alger"],
        requested_qty: 2,
        picked_qty: 0,
        warehouses: ["DEPOT"],
        delivery_notes: [],
      },
      {
        name: "PL-2",
        docstatus: 1,
        status: "Completed",
        modified: "2026-09-01 11:00:00",
        sales_order_count: 1,
        sales_orders: ["SO-2"],
        customer_names: ["Client Test 2"],
        wilayas: ["Oran"],
        requested_qty: 3,
        picked_qty: 3,
        warehouses: ["DEPOT"],
        delivery_notes: ["DN-2"],
      },
    ];
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation?tab=listes"]}><PreparationPage /></MemoryRouter>);

    expect(screen.getByText("Listes de prélèvement (2)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /plus de filtres/i }));
    await chooseOption(user, screen.getByRole("combobox", { name: "Client" }), "Client Test 1");
    expect(screen.getByText("Listes de prélèvement (1)")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /SO-1/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /SO-2/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /réinitialiser/i }));
    expect(screen.getByText("Listes de prélèvement (2)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /plus de filtres/i }));
    await chooseOption(user, screen.getByRole("combobox", { name: "Wilaya" }), "Oran");
    expect(screen.getByText("Listes de prélèvement (1)")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /SO-2/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /SO-1/ })).not.toBeInTheDocument();
  });

  it("affiche Commande modifiée dans l’onglet Listes", () => {
    mocks.recentPickLists = [{
      ...mocks.baseLists[0],
      custom_order_changed: 1,
    }];
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);
    expect(screen.getByLabelText("Commande modifiée")).toBeInTheDocument();
  });

  it("explique que les listes se créent à la soumission quand la file est vide", () => {
    mocks.recentPickLists = [];
    renderPrep();
    expect(
      screen.getByText("Les listes apparaissent automatiquement à la soumission d’une commande."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/créez une liste depuis l’onglet commandes/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /voir les commandes/i })).not.toBeInTheDocument();
  });

  it("filtre les listes par chip Brouillon et ouvre la sélection", async () => {
    mocks.recentPickLists = [
      {
        name: "PL-1",
        docstatus: 0,
        status: "Draft",
        modified: "2026-09-01 10:00:00",
        sales_order_count: 1,
        sales_orders: ["SO-1"],
        customer_names: ["Client Test 1"],
        requested_qty: 2,
        picked_qty: 0,
        warehouses: ["DEPOT"],
        delivery_notes: [],
      },
      {
        name: "PL-2",
        docstatus: 1,
        status: "Completed",
        modified: "2026-09-01 11:00:00",
        sales_order_count: 1,
        sales_orders: ["SO-2"],
        customer_names: ["Client Test 2"],
        requested_qty: 3,
        picked_qty: 3,
        warehouses: ["DEPOT"],
        delivery_notes: ["DN-2"],
      },
    ];
    const user = userEvent.setup();
    renderPrep();
    await user.click(screen.getByRole("button", { name: /^brouillon$/i }));
    expect(screen.getByText("Listes de prélèvement (1)")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /SO-1/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /SO-2/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /sélectionner pl-1/i }));
    await user.click(screen.getByRole("button", { name: /^ouvrir la liste$/i }));
    expect(await screen.findByRole("heading", { name: "PL-1" })).toBeInTheDocument();
  });

  it("affiche une alerte si la session signale une commande modifiée", async () => {
    mocks.pickListData.message = {
      ...structuredClone(mocks.draftSession),
      order_changed_notice: "Commande SO-1 modifiée : items",
    };
    render(<MemoryRouter initialEntries={["/preparation?pick_lists=PL-1"]}><PreparationPage /></MemoryRouter>);
    expect(await screen.findByText("Commande modifiée, la liste a été actualisée.")).toBeInTheDocument();
  });

  it("signale une commande modifiée dans la file sans proposer de création", () => {
    mocks.recentPickLists = [{ ...mocks.baseLists[0], custom_order_changed: 1 }];
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);
    expect(screen.getByLabelText("Commande modifiée")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /créer la liste/i })).not.toBeInTheDocument();
  });

  it("bloque le prélèvement tant que la modification de session n’est pas acceptée", async () => {
    mocks.pickListData.message = {
      ...structuredClone(mocks.draftSession),
      order_changed_notice: "Commande SO-1 modifiée : items",
      modification_pending: true,
      pending_sales_orders: ["SO-1"],
    };
    render(<MemoryRouter initialEntries={["/preparation?pick_lists=PL-1"]}><PreparationPage /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: /prendre connaissance des modifications/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tout prélever/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /contrôle final/i })).toBeDisabled();
    expect(screen.queryByRole("spinbutton", { name: /quantité prélevée/i })).not.toBeInTheDocument();
  });

  it("accepte les modifications depuis la session de prélèvement", async () => {
    mocks.pickListData.message = {
      ...structuredClone(mocks.draftSession),
      modification_pending: true,
      pending_sales_orders: ["SO-1"],
    };
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation?pick_lists=PL-1"]}><PreparationPage /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: /prendre connaissance des modifications/i }));
    await waitFor(() => expect(mocks.acknowledgeModification).toHaveBeenCalledWith("SO-1"));
  });

  it("filtre les listes à compléter après un reliquat", async () => {
    mocks.recentPickLists = [
      { ...mocks.baseLists[0], requested_qty: 2, picked_qty: 0 },
      { ...mocks.baseLists[1], requested_qty: 3, picked_qty: 3, docstatus: 1 },
      { ...mocks.baseLists[2], requested_qty: 1, picked_qty: 1 },
    ];
    const user = userEvent.setup();
    renderPrep("/preparation?complete=1");
    expect(screen.getByText("Listes de prélèvement (1)")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /SO-1/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /SO-2/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("À compléter").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("checkbox", { name: "Sélectionner PL-1" }));
    expect(screen.getByRole("button", { name: "Ouvrir la liste" })).toBeEnabled();
  });

  it("filtre les listes en reliquat depuis shortage=1", () => {
    mocks.recentPickLists = [
      { ...mocks.baseLists[0], requested_qty: 2, picked_qty: 0 },
      { ...mocks.baseLists[1], requested_qty: 3, picked_qty: 3, docstatus: 1 },
    ];
    renderPrep("/preparation?shortage=1");
    expect(screen.getByText("Listes de prélèvement (1)")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /SO-1/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /SO-2/ })).not.toBeInTheDocument();
  });
});
