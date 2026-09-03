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
  };
  return {
    createPickList: vi.fn().mockResolvedValue({ name: "SESSION-PL-1", pick_lists: [{ name: "PL-1" }] }),
    submitPickList: vi.fn().mockResolvedValue({ delivery_notes: [{ name: "DN-1", customer_name: "Client Test 1" }] }),
    acknowledgeModification: vi.fn().mockResolvedValue({ name: "SO-1" }),
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
      stock_shortages?: Array<{ item_code: string; item_name: string; warehouse: string; required: number; available: number }>
    }> },
    location,
    draftSession,
    pickListData: { message: structuredClone(draftSession) },
    returnRoutes: [] as Array<{ name: string; stock: { remainingQuantity: number; status: string; lines: unknown[] } }>,
    recentPickLists: [] as Array<{
      name: string
      docstatus: number
      status?: string
      modified: string
      sales_order_count: number
      sales_orders?: string[]
      customer_names?: string[]
      wilayas?: string[]
      requested_qty?: number
      picked_qty?: number
      warehouses?: string[]
      delivery_notes: string[]
    }>,
    baseQueue: [
      { name: "SO-1", customer_name: "Client Test 1", delivery_date: tomorrowIso, total_qty: 2, custom_wilaya: "Alger", custom_commune: "COM-0001", custom_commune_nom: "Alger Centre", status: "To Deliver" },
      { name: "SO-2", customer_name: "Client Test 2", delivery_date: tomorrowIso, total_qty: 3, custom_wilaya: "Alger", custom_commune: "COM-0002", custom_commune_nom: "Bab Ezzouar", status: "To Deliver and Bill" },
      { name: "SO-3", customer_name: "Client Test 3", delivery_date: "2099-01-01", total_qty: 1, custom_wilaya: "Oran", custom_commune: "COM-0003", custom_commune_nom: "Oran", status: "To Deliver" },
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
    useSalesOrderPickDetail: () => ({ data: { message: mocks.salesOrderDetail }, error: undefined, isLoading: false, mutate: vi.fn() }),
    usePreparationMutations: () => ({
      createPickList: mocks.createPickList,
      updateQuantities: vi.fn(),
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

function orderCheckbox(name: string) {
  return screen.getAllByRole("checkbox", { name: `Sélectionner ${name}` })[0];
}

function qtyInput() {
  return screen.getAllByRole("spinbutton", { name: /quantité prélevée/i })[0];
}

describe("PreparationPage", () => {
  beforeEach(() => {
    mocks.createPickList.mockReset().mockResolvedValue({ name: "SESSION-PL-1", pick_lists: [{ name: "PL-1" }] });
    mocks.submitPickList.mockReset().mockResolvedValue({ delivery_notes: [{ name: "DN-1", customer_name: "Client Test 1" }] });
    mocks.acknowledgeModification.mockReset().mockResolvedValue({ name: "SO-1" });
    mocks.scanPickItem.mockReset().mockResolvedValue({
      item_code: "ART-1",
      item_name: "Article test",
      increment: 1,
      barcode: "123456",
    });
    mocks.pickListData.message = structuredClone(mocks.draftSession);
    mocks.queueData.message = mocks.baseQueue.map((order) => ({ ...order }));
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
    mocks.recentPickLists = [];
    Element.prototype.scrollIntoView = vi.fn();
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1024 });
  });

  it("place les retours dans un onglet dédié avec le nombre à traiter", async () => {
    mocks.returnRoutes = [{
      name: "LIV-RET-1",
      stock: { remainingQuantity: 5, status: "Retour déclaré", lines: [] },
    }];
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);

    expect(screen.getByRole("tab", { name: /commandes/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /listes/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /retours/i })).toHaveTextContent("1");
    expect(screen.queryByText("LIV-RET-1")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /retours/i }));
    expect(screen.getByText("LIV-RET-1")).toBeInTheDocument();
    expect(screen.getByText("5 à retourner")).toBeInTheDocument();
    expect(screen.queryByText("Commandes (3)")).not.toBeInTheDocument();
  });

  it("passe de la file de commandes au contrôle des écarts", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);
    await user.click(orderCheckbox("SO-1"));
    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    expect(screen.getByRole("dialog", { name: /confirmer la création/i })).toBeInTheDocument();
    expect(screen.getByText(/une par commande sélectionnée/i)).toBeInTheDocument();
    expect(mocks.createPickList).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /confirmer la création/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "PL-1" })).toBeInTheDocument());
    expect(screen.getByText(/liste de prélèvement créée avec succès/i)).toBeInTheDocument();
    const quantity = qtyInput();
    await user.clear(quantity);
    await user.type(quantity, "1");
    await user.click(screen.getByRole("button", { name: /contrôle final/i }));
    expect(screen.getAllByText("-1").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /confirmer et créer les BL/i })).toBeInTheDocument();
  });

  it("demande confirmation avant de créer les BL puis affiche le succès", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /contrôle final/i }));
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

  it("permet d’annuler avant tout appel serveur", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);
    await user.click(orderCheckbox("SO-1"));
    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    await user.click(screen.getByRole("button", { name: /annuler/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.createPickList).not.toHaveBeenCalled();
  });

  it("propose de prélever le disponible si une ligne est en rupture", async () => {
    mocks.queueData.message[0] = {
      ...mocks.queueData.message[0],
      has_available_stock: true,
      stock_shortages: [{ item_code: "ART-1", item_name: "Article 1", warehouse: "Magasins - MP", required: 12, available: 0 }],
    };
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);
    expect(screen.getAllByText("Stock insuffisant").length).toBeGreaterThan(0);
    await user.click(orderCheckbox("SO-1"));
    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    expect(screen.getByRole("dialog", { name: /prélever le disponible/i })).toBeInTheDocument();
    expect(screen.getByText(/12 demandé, 0 disponible/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /créer la liste du disponible/i }));
    await waitFor(() => expect(mocks.createPickList).toHaveBeenCalledWith(["SO-1"]));
  });

  it("bloque la création si aucun article n’a de stock", async () => {
    mocks.queueData.message[0] = {
      ...mocks.queueData.message[0],
      has_available_stock: false,
      stock_shortages: [{ item_code: "ART-1", item_name: "Article 1", warehouse: "Magasins - MP", required: 12, available: 0 }],
    };
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);
    await user.click(orderCheckbox("SO-1"));
    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    expect(screen.getByRole("dialog", { name: /stock insuffisant/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirmer la création/i })).toBeDisabled();
    expect(mocks.createPickList).not.toHaveBeenCalled();
  });

  it("filtre les commandes de demain par wilaya puis sélectionne tout le résultat", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);

    await chooseOption(user, screen.getByRole("combobox", { name: "Échéance" }), /demain/i);
    await chooseOption(user, screen.getByRole("combobox", { name: "Wilaya" }), "Alger");
    expect(screen.getByText("Commandes (2)")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Commune" }));
    expect(await screen.findByRole("option", { name: "Alger Centre" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "COM-0001" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: /tout sélectionner/i }));
    expect(screen.getByText("2 sélectionnées")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("checkbox", { name: /sélectionner so-/i })
        .every((checkbox) => checkbox.getAttribute("aria-checked") === "true"),
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    expect(screen.getByText(/2 listes de prélèvement seront créées/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /confirmer la création/i }));
    expect(mocks.createPickList).toHaveBeenCalledWith(["SO-1", "SO-2"]);
  });

  it("ouvre la fiche commande au clic sur la ligne sans sélectionner", async () => {
    const user = userEvent.setup();
    renderPrep();
    const row = screen.getByRole("row", { name: /SO-1/ });
    await user.click(within(row).getByText("SO-1"));
    expect(screen.getByRole("heading", { name: "SO-1" })).toBeInTheDocument();
    expect(screen.queryByText(/1 sélectionnée/)).not.toBeInTheDocument();
    expect(screen.getByText("Article test")).toBeInTheDocument();
  });

  it("crée plusieurs listes depuis les cases à cocher de la barre", async () => {
    const user = userEvent.setup();
    renderPrep();
    await user.click(orderCheckbox("SO-1"));
    await user.click(orderCheckbox("SO-2"));
    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    expect(screen.getByText(/2 listes de prélèvement seront créées/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /confirmer la création/i }));
    expect(mocks.createPickList).toHaveBeenCalledWith(["SO-1", "SO-2"]);
  });

  it("ouvre le dialogue pour une seule commande depuis le bouton Créer de la ligne", async () => {
    const user = userEvent.setup();
    renderPrep();
    await user.click(screen.getAllByRole("button", { name: "Créer la liste de SO-1" })[0]);
    expect(screen.getByRole("dialog", { name: /confirmer la création/i })).toBeInTheDocument();
    expect(screen.getByText(/1 liste de prélèvement sera créée/i)).toBeInTheDocument();
    expect(screen.getByText("SO-1", { selector: "strong" })).toBeInTheDocument();
    expect(screen.queryByText("SO-2", { selector: "strong" })).not.toBeInTheDocument();
    expect(screen.queryByText(/1 sélectionnée/)).not.toBeInTheDocument();
  });

  it("filtre les commandes par client", async () => {
    const user = userEvent.setup();
    renderPrep();
    await chooseOption(user, screen.getByRole("combobox", { name: "Client" }), "Client Test 1");
    expect(screen.getByText("Commandes (1)")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /SO-1/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /SO-2/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /SO-3/ })).not.toBeInTheDocument();
  });

  it("affiche une erreur exploitable si le serveur ne retourne aucune liste de prélèvement", async () => {
    mocks.createPickList.mockResolvedValueOnce({ name: "SESSION-VIDE" });
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);
    await user.click(orderCheckbox("SO-1"));
    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    await user.click(screen.getByRole("button", { name: /confirmer la création/i }));
    expect(await screen.findByText(/n’a retourné aucune liste de prélèvement/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^préparation$/i })).toBeInTheDocument();
  });

  it("initialise les quantités prélevées à 0", async () => {
    renderWorkspace();
    expect(await screen.findByRole("heading", { name: "PL-1" })).toBeInTheDocument();
    expect(qtyInput()).toHaveValue(0);
    expect(screen.getByRole("button", { name: /quantité à prélever/i })).toBeInTheDocument();
    expect(screen.getAllByText("Restant").length).toBeGreaterThan(0);
  });

  it("incrémente la quantité au scan d’un code-barres de la session", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const scan = await screen.findByLabelText(/code-barres article/i);
    await user.type(scan, "123456{Enter}");
    await waitFor(() => expect(qtyInput()).toHaveValue(1));
    expect(mocks.scanPickItem).toHaveBeenCalledWith("123456", ["PL-1"]);
    expect(screen.getByText(/article test · \+1/i)).toBeInTheDocument();
  });

  it("refuse un scan au-delà de la quantité demandée", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const scan = await screen.findByLabelText(/code-barres article/i);
    await user.type(scan, "123456{Enter}");
    await waitFor(() => expect(qtyInput()).toHaveValue(1));
    await user.type(scan, "123456{Enter}");
    await waitFor(() => expect(qtyInput()).toHaveValue(2));
    await user.type(scan, "123456{Enter}");
    expect(await screen.findByText(/quantité demandée déjà atteinte/i)).toBeInTheDocument();
    expect(qtyInput()).toHaveValue(2);
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
    expect(qtyInput()).toHaveValue(0);
  });

  it("filtre les lignes restantes via le KPI", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    expect(await screen.findByRole("heading", { name: "PL-1" })).toBeInTheDocument();
    await chooseOption(user, screen.getByRole("combobox", { name: "État" }), "Complet");
    expect(screen.getByText(/aucun article ne correspond à la recherche/i)).toBeInTheDocument();
    expect(screen.queryByText(/article test/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /encore à scanner/i }));
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
    };
    renderWorkspace();
    expect(await screen.findByRole("heading", { name: "PL-1" })).toBeInTheDocument();
    expect(screen.getByText(/liste soumise/i)).toBeInTheDocument();
    expect(screen.getAllByText("Complet").length).toBeGreaterThan(0);
    expect(screen.getByText("DN-1")).toBeInTheDocument();
    expect(screen.queryByLabelText(/code-barres article/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ouvrir la caméra" })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /contrôle final/i })).not.toBeInTheDocument();
  });

  it("ouvre la caméra pour scanner un code-barres", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    expect(await screen.findByRole("button", { name: "Ouvrir la caméra" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ouvrir la caméra" }));
    expect(screen.getByRole("dialog", { name: /scanner un code-barres/i })).toBeInTheDocument();
    expect(screen.getByText(/cadrez le code dans le cadre/i)).toBeInTheDocument();
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
  });

  it("garde une commande déjà couverte visible avec son statut et ouvre la liste", async () => {
    mocks.queueData.message[0] = {
      ...mocks.queueData.message[0],
      can_create_pick_list: false,
      existing_pick_list: "PL-COVER",
      pick_lists: [{ name: "PL-COVER", docstatus: 0 }],
      picked_qty: 1,
      requested_qty: 2,
    };
    mocks.recentPickLists = [{
      name: "PL-COVER",
      docstatus: 0,
      status: "Draft",
      modified: "2026-09-01 10:00:00",
      sales_order_count: 1,
      sales_orders: ["SO-1"],
      customer_names: ["Client Test 1"],
      requested_qty: 2,
      picked_qty: 1,
      warehouses: ["DEPOT"],
      delivery_notes: [],
    }];
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);

    expect(screen.getByText("Commandes (3)")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /SO-1/ })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Sélectionner SO-1" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Liste brouillon").length).toBeGreaterThan(0);
    expect(screen.getAllByText("À livrer").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("progressbar", { name: /prélèvement 1 sur 2/i })[0]).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getAllByRole("button", { name: "Ouvrir la liste PL-COVER" }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /tout sélectionner/i }));
    expect(screen.getByText("2 sélectionnées")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    expect(screen.getByText(/2 listes de prélèvement seront créées/i)).toBeInTheDocument();
    expect(screen.queryByText("SO-1", { selector: "strong" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /confirmer la création/i }));
    expect(mocks.createPickList).toHaveBeenCalledWith(["SO-2", "SO-3"]);
  });

  it("affiche une liste soumise, le statut Desk Terminée et la barre à 100 %", () => {
    mocks.queueData.message[0] = {
      ...mocks.queueData.message[0],
      status: "Completed",
      can_create_pick_list: false,
      pick_lists: [{ name: "PL-DONE", docstatus: 1 }],
      picked_qty: 2,
      requested_qty: 2,
    };
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);

    expect(screen.getAllByText("Terminée").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Liste soumise").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("progressbar", { name: /prélèvement 2 sur 2/i })[0]).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getAllByRole("button", { name: "Ouvrir la liste PL-DONE" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("checkbox", { name: "Sélectionner SO-1" })).not.toBeInTheDocument();
  });

  it("affiche une barre à 0 % sans liste de prélèvement", () => {
    renderPrep();
    expect(screen.getAllByText("Aucune liste").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("progressbar", { name: /prélèvement 0 sur 2/i })[0]).toHaveAttribute("aria-valuenow", "0");
  });

  it("filtre les commandes selon la présence d’une liste", async () => {
    mocks.queueData.message[0] = {
      ...mocks.queueData.message[0],
      can_create_pick_list: false,
      pick_lists: [{ name: "PL-1", docstatus: 0 }],
    };
    const user = userEvent.setup();
    renderPrep();
    await chooseOption(user, screen.getByRole("combobox", { name: "Liste" }), "Brouillon");
    expect(screen.getByText("Commandes (1)")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /SO-1/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /SO-2/ })).not.toBeInTheDocument();
  });

  it("garde une commande avec brouillon partiel et ouvre la liste existante", async () => {
    mocks.queueData.message[0] = {
      ...mocks.queueData.message[0],
      can_create_pick_list: false,
      draft_pick_list: "PL-PARTIAL",
      existing_pick_list: undefined,
      has_available_stock: true,
      stock_shortages: [{ item_code: "ART-2", item_name: "Rupture", warehouse: "DEPOT", required: 1, available: 0 }],
    };
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);

    expect(screen.getAllByText("SO-1").length).toBeGreaterThan(0);
    expect(screen.getByText("Commandes (3)")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Sélectionner SO-1" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Ouvrir la liste PL-PARTIAL" }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /tout sélectionner/i }));
    expect(screen.getByText("2 sélectionnées")).toBeInTheDocument();
  });

  it("ouvre toutes les listes en brouillon d’une commande", async () => {
    mocks.queueData.message[0] = {
      ...mocks.queueData.message[0],
      can_create_pick_list: false,
      draft_pick_lists: ["PL-A", "PL-B"],
      existing_pick_list: undefined,
    };
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);

    const openButtons = screen.getAllByRole("button", { name: "Ouvrir les 2 listes de prélèvement" });
    expect(openButtons.length).toBeGreaterThan(0);
    expect(openButtons[0]).toHaveTextContent("Ouvrir les listes");
    await user.click(openButtons[0]);
    expect(await screen.findByRole("heading", { name: "PL-1" })).toBeInTheDocument();
  });

  it("ouvre une liste depuis l’onglet Listes", async () => {
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
    }];
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation?tab=listes"]}><PreparationPage /></MemoryRouter>);

    expect(screen.getByRole("tab", { name: /listes/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Listes de prélèvement (1)")).toBeInTheDocument();
    expect(screen.getByText("Client Test 1")).toBeInTheDocument();
    await user.click(screen.getByText("PL-1"));
    expect(await screen.findByRole("heading", { name: "PL-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /contrôle final/i })).toBeInTheDocument();
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
    await chooseOption(user, screen.getByRole("combobox", { name: "Client" }), "Client Test 1");
    expect(screen.getByText("Listes de prélèvement (1)")).toBeInTheDocument();
    expect(screen.getByText("PL-1")).toBeInTheDocument();
    expect(screen.queryByText("PL-2")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /réinitialiser/i }));
    expect(screen.getByText("Listes de prélèvement (2)")).toBeInTheDocument();

    await chooseOption(user, screen.getByRole("combobox", { name: "Wilaya" }), "Oran");
    expect(screen.getByText("Listes de prélèvement (1)")).toBeInTheDocument();
    expect(screen.getByText("PL-2")).toBeInTheDocument();
    expect(screen.queryByText("PL-1")).not.toBeInTheDocument();
  });

  it("affiche le badge Modifiée dans la file Commandes", () => {
    mocks.queueData.message[0] = {
      ...mocks.queueData.message[0],
      custom_preparation_status: "Modifiée",
    };
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);
    expect(screen.getAllByText("Modifiée").length).toBeGreaterThan(0);
  });

  it("affiche Commande modifiée dans l’onglet Listes", () => {
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
      custom_order_changed: 1,
    }];
    render(<MemoryRouter initialEntries={["/preparation?tab=listes"]}><PreparationPage /></MemoryRouter>);
    expect(screen.getByText("Commande modifiée")).toBeInTheDocument();
  });

  it("affiche une alerte si la session signale une commande modifiée", async () => {
    mocks.pickListData.message = {
      ...structuredClone(mocks.draftSession),
      order_changed_notice: "Commande SO-1 modifiée : items",
    };
    render(<MemoryRouter initialEntries={["/preparation?pick_lists=PL-1"]}><PreparationPage /></MemoryRouter>);
    expect(await screen.findByText("Commande modifiée, la liste a été actualisée.")).toBeInTheDocument();
  });

  it("désactive la création d’une commande modifiée dans la file", () => {
    mocks.queueData.message[0] = {
      ...mocks.queueData.message[0],
      custom_preparation_status: "Modifiée",
    };
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);
    const createSo1 = screen.getAllByRole("button", { name: "Créer la liste de SO-1" });
    expect(createSo1.length).toBeGreaterThan(0);
    createSo1.forEach((button) => expect(button).toBeDisabled());
    screen.getAllByRole("button", { name: "Créer la liste de SO-2" }).forEach((button) => expect(button).toBeEnabled());
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
});
