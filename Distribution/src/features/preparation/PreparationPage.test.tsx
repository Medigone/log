import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PreparationPage } from "@/features/preparation/PreparationPage";

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
  return {
    createPickList: vi.fn().mockResolvedValue({ name: "SESSION-PL-1", pick_lists: [{ name: "PL-1" }] }),
    submitPickList: vi.fn().mockResolvedValue({ delivery_notes: [{ name: "DN-1", customer_name: "Client Test 1" }] }),
    scanPickItem: vi.fn().mockResolvedValue({
      item_code: "ART-1",
      item_name: "Article test",
      increment: 1,
      barcode: "123456",
    }),
    queueData: { message: [
      { name: "SO-1", customer_name: "Client Test 1", delivery_date: tomorrowIso, total_qty: 2, custom_wilaya: "Alger", custom_commune: "COM-0001", custom_commune_nom: "Alger Centre" },
      { name: "SO-2", customer_name: "Client Test 2", delivery_date: tomorrowIso, total_qty: 3, custom_wilaya: "Alger", custom_commune: "COM-0002", custom_commune_nom: "Bab Ezzouar" },
      { name: "SO-3", customer_name: "Client Test 3", delivery_date: "2099-01-01", total_qty: 1, custom_wilaya: "Oran", custom_commune: "COM-0003", custom_commune_nom: "Oran" },
    ] },
    pickListData: { message: { name: "SESSION-PL-1", sales_orders: ["SO-1"], pick_lists: [{ name: "PL-1", docstatus: 0, sales_orders: ["SO-1"], locations: [location], grouped: [] }], grouped: [{ item_code: "ART-1", item_name: "Article test", warehouse: "DEPOT", stock_qty: 2, locations: [location] }] } },
  };
});

vi.mock("@/shared/api/preparation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api/preparation")>();
  return {
    ...actual,
    usePreparationQueue: () => ({ data: mocks.queueData, mutate: vi.fn(), error: undefined, isLoading: false }),
    useRecentPickLists: () => ({ data: { message: [] }, error: undefined, isLoading: false }),
    usePickSession: () => ({ data: mocks.pickListData, mutate: vi.fn(), error: undefined, isLoading: false }),
    usePreparationMutations: () => ({
      createPickList: mocks.createPickList,
      updateQuantities: vi.fn(),
      submitPickList: mocks.submitPickList,
      scanPickItem: mocks.scanPickItem,
      creating: false,
      saving: false,
      submitting: false,
      scanning: false,
    }),
  };
});
vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useReturnRoutes: () => ({ data: { message: [] }, error: undefined, isLoading: false, mutate: vi.fn() }),
  useDistributionMutations: () => ({ confirmRouteReturn: vi.fn(), fulfillment: false }),
}));

function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={["/preparation?pick_lists=PL-1"]}>
      <PreparationPage />
    </MemoryRouter>,
  );
}

describe("PreparationPage", () => {
  beforeEach(() => {
    mocks.createPickList.mockReset().mockResolvedValue({ name: "SESSION-PL-1", pick_lists: [{ name: "PL-1" }] });
    mocks.submitPickList.mockReset().mockResolvedValue({ delivery_notes: [{ name: "DN-1", customer_name: "Client Test 1" }] });
    mocks.scanPickItem.mockReset().mockResolvedValue({
      item_code: "ART-1",
      item_name: "Article test",
      increment: 1,
      barcode: "123456",
    });
    mocks.queueData.message.forEach((order) => {
      delete order.stock_shortages;
    });
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("passe de la file de commandes au contrôle des écarts", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    expect(screen.getByRole("dialog", { name: /confirmer la création/i })).toBeInTheDocument();
    expect(screen.getByText(/une par commande sélectionnée/i)).toBeInTheDocument();
    expect(mocks.createPickList).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /confirmer la création/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /session de préparation/i })).toBeInTheDocument());
    expect(screen.getByText(/liste de prélèvement créée avec succès/i)).toBeInTheDocument();
    const quantity = screen.getByRole("spinbutton");
    await user.clear(quantity);
    await user.type(quantity, "1");
    await user.click(screen.getByRole("button", { name: /contrôle final/i }));
    expect(screen.getByText("-1")).toBeInTheDocument();
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
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    await user.click(screen.getByRole("button", { name: /annuler/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.createPickList).not.toHaveBeenCalled();
  });

  it("prévient et bloque la création si le stock est insuffisant", async () => {
    mocks.queueData.message[0] = {
      ...mocks.queueData.message[0],
      stock_shortages: [{ item_code: "ART-1", item_name: "Article 1", warehouse: "Magasins - MP", required: 12, available: 0 }],
    };
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);
    expect(screen.getByText("Stock insuffisant")).toBeInTheDocument();
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    expect(screen.getByRole("dialog", { name: /stock insuffisant/i })).toBeInTheDocument();
    expect(screen.getByText(/12 demandé, 0 disponible/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirmer la création/i })).toBeDisabled();
    expect(mocks.createPickList).not.toHaveBeenCalled();
  });

  it("filtre les commandes de demain par wilaya puis sélectionne tout le résultat", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: /demain/i }));
    await user.selectOptions(screen.getByLabelText("Wilaya"), "Alger");
    expect(screen.getByText("Commandes à prélever (2)")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Alger Centre" })).toHaveValue("COM-0001");
    expect(screen.queryByRole("option", { name: "COM-0001" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /tout sélectionner/i }));
    expect(screen.getByText("2 sélectionnées")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox").every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);

    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    expect(screen.getByText(/2 listes de prélèvement seront créées/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /confirmer la création/i }));
    expect(mocks.createPickList).toHaveBeenCalledWith(["SO-1", "SO-2"]);
  });

  it("affiche une erreur exploitable si le serveur ne retourne aucune liste de prélèvement", async () => {
    mocks.createPickList.mockResolvedValueOnce({ name: "SESSION-VIDE" });
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    await user.click(screen.getByRole("button", { name: /confirmer la création/i }));
    expect(await screen.findByText(/n’a retourné aucune liste de prélèvement/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^préparation$/i })).toBeInTheDocument();
  });

  it("initialise les quantités prélevées à 0", async () => {
    renderWorkspace();
    expect(await screen.findByRole("heading", { name: /session de préparation/i })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toHaveValue(0);
  });

  it("incrémente la quantité au scan d’un code-barres de la session", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const scan = await screen.findByLabelText(/code-barres article/i);
    await user.type(scan, "123456{Enter}");
    await waitFor(() => expect(screen.getByRole("spinbutton")).toHaveValue(1));
    expect(mocks.scanPickItem).toHaveBeenCalledWith("123456", ["PL-1"]);
    expect(screen.getByText(/article test · \+1/i)).toBeInTheDocument();
  });

  it("refuse un scan au-delà de la quantité demandée", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const scan = await screen.findByLabelText(/code-barres article/i);
    await user.type(scan, "123456{Enter}");
    await waitFor(() => expect(screen.getByRole("spinbutton")).toHaveValue(1));
    await user.type(scan, "123456{Enter}");
    await waitFor(() => expect(screen.getByRole("spinbutton")).toHaveValue(2));
    await user.type(scan, "123456{Enter}");
    expect(await screen.findByText(/quantité demandée déjà atteinte/i)).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toHaveValue(2);
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
    expect(screen.getByRole("spinbutton")).toHaveValue(0);
  });
});
