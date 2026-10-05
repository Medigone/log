import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { OrderEntryPage } from "@/features/orders/OrderEntryPage";
import { chooseOption } from "@/test/chooseOption";
import type { OrderPayload } from "@/shared/api/orders";

const mocks = vi.hoisted(() => {
  const customer = {
    name: "PHARMACIE ATLAS",
    customer_name: "PHARMACIE ATLAS",
    customer_group: "Pharmacie",
    commune_name: "Bir El Djir",
    wilaya: "Oran",
    phone: "0550123456",
    has_gps: true,
  };
  const lait = {
    item_code: "ART-1",
    item_name: "Lait 1er âge",
    uom: "N°",
    price: 100,
    available: 50,
    is_stock_item: true,
    barcode: "3017620422003",
  };
  return {
    customer,
    lait,
    options: {
      message: {
        company: "Modern Pharma",
        currency: "DZD",
        warehouses: ["Magasins - MP"],
        default_warehouse: "Magasins - MP",
        price_lists: ["Vente standard"],
        default_price_list: "Vente standard",
        payment_terms_templates: ["30 jours", "50 % comptant / 50 % 30 jours"],
        modes_of_payment: ["Espèces", "Chèque"],
        customer_groups: ["Pharmacie", "Parapharm"],
        legal_forms: ["EURL", "Non Précisé"],
        order_types: ["BL", "Facture"],
        editable_rate: false,
        default_delivery_date: "2026-10-04",
        can_validate: false,
      },
    },
    order: null as null | Record<string, unknown>,
    previewOrderUpdate: vi.fn(),
    updateSubmittedOrder: vi.fn(),
    cancelOrder: vi.fn(),
    amendOrder: vi.fn(),
    previewOrder: vi.fn(),
    saveOrder: vi.fn(),
    submitOrder: vi.fn(),
    deleteOrder: vi.fn(),
    scanOrderItem: vi.fn(),
    createCustomer: vi.fn(),
  };
});

function detailFor(payload: OrderPayload, extra: Record<string, unknown> = {}) {
  const lines = payload.lines.map((line) => {
    const rate = 100 * (1 - (line.discount_percentage || 0) / 100);
    return {
      item_code: line.item_code,
      item_name: line.item_code === "ART-1" ? "Lait 1er âge" : line.item_code,
      uom: "N°",
      qty: line.qty,
      price_list_rate: 100,
      discount_percentage: line.discount_percentage || 0,
      rate,
      amount: rate * line.qty,
      tax_rate: line.item_code === "ART-1" ? 19 : 0,
      tax_amount: line.item_code === "ART-1" ? rate * line.qty * 0.19 : 0,
      tax_missing: line.item_code !== "ART-1",
      available: 50,
    };
  });
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  return {
    name: payload.name || null,
    docstatus: 0,
    status: "Draft",
    origin: "Interne",
    editable: true,
    customer: mocks.customer,
    transaction_date: "2026-10-03",
    delivery_date: payload.delivery_date,
    order_type: payload.order_type,
    warehouse: payload.warehouse,
    price_list: "Vente standard",
    payment_terms_template: payload.payment_terms_template,
    schedule_mode: "template",
    additional_discount_percentage: payload.additional_discount_percentage || 0,
    discount_amount: 0,
    lines,
    taxes: [],
    payment_schedule: [
      { payment_term: "Comptant", due_date: "2026-10-03", invoice_portion: 50, payment_amount: total / 2 },
      { payment_term: "30 jours", due_date: "2026-11-02", invoice_portion: 50, payment_amount: total / 2 },
    ],
    schedule_gap: 0,
    totals: { qty: 0, total, discount_amount: 0, net_total: total, taxes: 0, grand_total: total, rounding_adjustment: 0, rounded_total: total },
    ...extra,
  };
}

vi.mock("@/shared/api/orders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api/orders")>();
  return {
    ...actual,
    useOrderOptions: () => ({ data: mocks.options }),
    useOrder: (name?: string) => ({
      data: name && mocks.order ? { message: mocks.order } : undefined,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    }),
    useCustomerSearch: (txt: string, enabled: boolean) => ({
      data: enabled ? { message: txt.toLowerCase().includes("atl") || !txt ? [mocks.customer] : [] } : undefined,
      isLoading: false,
    }),
    useCommuneSearch: (_txt: string, enabled: boolean) => ({
      data: enabled ? { message: [{ name: "COM-1", nom: "Bir El Djir", wilaya: "Oran" }] } : undefined,
      isLoading: false,
    }),
    useItemSearch: (txt: string, _context: unknown, enabled: boolean) => ({
      data: enabled ? { message: txt.toLowerCase().includes("lait") ? [mocks.lait] : [] } : undefined,
      isLoading: false,
    }),
    useCustomerRecentItems: () => ({ data: { message: [] } }),
    useOrderMutations: () => ({
      previewOrder: mocks.previewOrder,
      saveOrder: mocks.saveOrder,
      submitOrder: mocks.submitOrder,
      deleteOrder: mocks.deleteOrder,
      scanOrderItem: mocks.scanOrderItem,
      createCustomer: mocks.createCustomer,
      previewOrderUpdate: mocks.previewOrderUpdate,
      updateSubmittedOrder: mocks.updateSubmittedOrder,
      cancelOrder: mocks.cancelOrder,
      amendOrder: mocks.amendOrder,
      saving: false,
      submitting: false,
      deleting: false,
      scanning: false,
      creatingCustomer: false,
    }),
  };
});

const camera = vi.hoisted(() => ({ onScan: null as null | ((text: string) => void) }));

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    static getCameras = vi.fn().mockResolvedValue([]);
    start = vi.fn(async (_target: unknown, _config: unknown, onSuccess: (text: string) => void) => {
      camera.onScan = onSuccess;
    });
    stop = vi.fn().mockResolvedValue(undefined);
    clear = vi.fn();
  },
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/commandes/nouvelle"]}>
      <Routes>
        <Route path="/commandes/nouvelle" element={<OrderEntryPage />} />
        <Route path="/commandes/:orderId" element={<p>Commande enregistrée</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function pickCustomer(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Rechercher un client"), "atl");
  await user.click(await screen.findByRole("option", { name: /PHARMACIE ATLAS/ }));
}

async function scan(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.type(screen.getByLabelText("Scanner ou rechercher un article"), `${code}{Enter}`);
}

describe("OrderEntryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.options.message.can_validate = false;
    mocks.previewOrder.mockImplementation(async (payload: OrderPayload) => detailFor(payload));
    mocks.saveOrder.mockImplementation(async (payload: OrderPayload) => detailFor(payload, { name: "SAL-ORD-9" }));
    mocks.submitOrder.mockImplementation(async () => detailFor({ lines: [], payment_terms_template: "", order_type: "BL", delivery_date: "2026-10-04", customer: "X" }, { name: "SAL-ORD-9", docstatus: 1, status: "To Deliver and Bill" }));
    mocks.scanOrderItem.mockResolvedValue({ ...mocks.lait, found: true, increment: 1 });
  });

  it("ajoute un article scanné avec quantité et calcule la commande", async () => {
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await scan(user, "2*3017620422003");

    expect(mocks.scanOrderItem).toHaveBeenCalledWith("3017620422003", expect.objectContaining({ customer: "PHARMACIE ATLAS" }));
    const line = await screen.findByTestId("order-line-ART-1");
    expect(within(line).getByLabelText("Quantité ART-1")).toHaveValue("2");
    await waitFor(() => expect(mocks.previewOrder).toHaveBeenCalled(), { timeout: 2000 });
    expect(mocks.previewOrder).toHaveBeenLastCalledWith(
      expect.objectContaining({
        customer: "PHARMACIE ATLAS",
        lines: [expect.objectContaining({ item_code: "ART-1", qty: 2 })],
      }),
    );
    expect(mocks.previewOrder.mock.lastCall?.[0]).not.toHaveProperty("tax_template");
    expect(await screen.findByText("Total TTC")).toBeInTheDocument();
    // Taux de TVA de la fiche article, sur la ligne.
    expect(within(screen.getByTestId("order-line-vat-ART-1")).getByText("19 %")).toBeInTheDocument();
  });

  it("trouve un article par son nom quand le code est inconnu", async () => {
    const user = userEvent.setup();
    mocks.scanOrderItem.mockResolvedValue({ found: false, barcode: "lait" });
    renderPage();
    await pickCustomer(user);

    await user.type(screen.getByLabelText("Scanner ou rechercher un article"), "lait");
    await user.click(await screen.findByRole("option", { name: /Lait 1er âge/ }));
    expect(await screen.findByTestId("order-line-ART-1")).toBeInTheDocument();

    await scan(user, "999");
    expect(await screen.findByText(/Code 999 inconnu/)).toBeInTheDocument();
  });

  it("crée un client à la volée", async () => {
    const user = userEvent.setup();
    mocks.createCustomer.mockResolvedValue({ ...mocks.customer, name: "NOUVELLE PHARMACIE", customer_name: "NOUVELLE PHARMACIE", has_gps: false });
    renderPage();

    await user.click(screen.getByRole("button", { name: /Nouveau client/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nom commercial"), "Nouvelle pharmacie");
    await chooseOption(user, within(dialog).getByRole("combobox", { name: "Catégorie client" }), "Pharmacie");
    await user.type(within(dialog).getByLabelText("Rechercher une commune"), "bir");
    await user.click(await within(dialog).findByRole("option", { name: /Bir El Djir/ }));
    await user.type(within(dialog).getByLabelText("Téléphone"), "0550 11 22 33");
    await user.click(within(dialog).getByRole("button", { name: "Créer le client" }));

    await waitFor(() =>
      expect(mocks.createCustomer).toHaveBeenCalledWith({
        customer_name: "Nouvelle pharmacie",
        customer_group: "Pharmacie",
        commune: "COM-1",
        legal_form: "Non Précisé",
        phone: "0550 11 22 33",
        nif: undefined,
        rc: undefined,
      }),
    );
    expect(await screen.findByText("NOUVELLE PHARMACIE", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Sans GPS")).toBeInTheDocument();
  });

  it("enregistre le brouillon du commercial avec la remise globale", async () => {
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await scan(user, "3017620422003");
    await user.type(screen.getByLabelText("Remise globale"), "5{Enter}");
    await waitFor(() => expect(mocks.previewOrder).toHaveBeenCalled(), { timeout: 2000 });

    expect(screen.queryByRole("button", { name: /Valider la commande/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Enregistrer$/ }));

    await waitFor(() =>
      expect(mocks.saveOrder).toHaveBeenCalledWith(
        expect.objectContaining({ customer: "PHARMACIE ATLAS", additional_discount_percentage: 5, discount_amount: 0 }),
      ),
    );
    expect(await screen.findByText("Commande enregistrée")).toBeInTheDocument();
  });

  it("permet au responsable de valider directement", async () => {
    const user = userEvent.setup();
    mocks.options.message.can_validate = true;
    renderPage();
    await pickCustomer(user);
    await scan(user, "3017620422003");
    await waitFor(() => expect(mocks.previewOrder).toHaveBeenCalled(), { timeout: 2000 });

    await user.click(screen.getByRole("button", { name: /Valider la commande/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Valider la commande/ }));

    await waitFor(() => expect(mocks.submitOrder).toHaveBeenCalledWith("SAL-ORD-9"));
    expect(mocks.saveOrder).toHaveBeenCalledTimes(1);
  });

  it("signale un échéancier personnalisé qui ne couvre pas le total", async () => {
    const user = userEvent.setup();
    renderPage();
    await pickCustomer(user);
    await scan(user, "3017620422003");
    await user.click(screen.getByRole("tab", { name: /Échéances/ }));
    await chooseOption(user, screen.getByRole("combobox", { name: "Conditions de paiement" }), "50 % comptant / 50 % 30 jours");
    await waitFor(() => expect(mocks.previewOrder).toHaveBeenLastCalledWith(expect.objectContaining({ payment_terms_template: "50 % comptant / 50 % 30 jours" })), { timeout: 2000 });

    await user.click(await screen.findByRole("button", { name: "Personnaliser l’échéancier" }));
    const amount = screen.getByLabelText("Montant échéance 2");
    await user.clear(amount);
    await user.type(amount, "10{Enter}");

    expect(await screen.findByText(/Reste à répartir/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Enregistrer$/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Répartir sur la dernière/ }));
    expect(await screen.findByText("L’échéancier couvre le total.")).toBeInTheDocument();
  });

  it("demande la quantité après un scan caméra puis ajoute l'article", async () => {
    const user = userEvent.setup();
    camera.onScan = null;
    renderPage();
    await pickCustomer(user);

    await user.click(screen.getByRole("button", { name: /Caméra/ }));
    await waitFor(() => expect(camera.onScan).not.toBeNull());
    act(() => camera.onScan?.("3017620422003"));

    const prompt = await screen.findByRole("form", { name: "Quantité de l’article scanné" });
    expect(within(prompt).getByText("Lait 1er âge")).toBeInTheDocument();
    expect(within(prompt).getByText("50 disponible(s)")).toBeInTheDocument();
    await user.click(within(prompt).getByRole("button", { name: "Augmenter la quantité" }));
    await user.click(within(prompt).getByRole("button", { name: "Ajouter" }));

    await user.click(screen.getByRole("button", { name: /Fermer/ }));
    const line = await screen.findByTestId("order-line-ART-1");
    expect(within(line).getByLabelText("Quantité ART-1")).toHaveValue("2");
  });
});

function submittedOrder(extra: Record<string, unknown> = {}) {
  const lines = [
    { item_code: "ART-1", item_name: "Lait 1er âge", uom: "N°", qty: 5, price_list_rate: 100, discount_percentage: 0, rate: 100, amount: 500, available: 50, row_name: "SOI-1", reserved_qty: 5, delivered_qty: 2, picked_qty: 2, remaining_qty: 3 },
    { item_code: "ART-2", item_name: "Gaze stérile", uom: "N°", qty: 3, price_list_rate: 50, discount_percentage: 0, rate: 50, amount: 150, available: 9, row_name: "SOI-2", reserved_qty: 3, delivered_qty: 0, picked_qty: 0, remaining_qty: 3 },
  ];
  return {
    ...detailFor(
      { lines: [], payment_terms_template: "", order_type: "BL", delivery_date: "2026-10-04", customer: "PHARMACIE ATLAS" },
      { name: "SAL-ORD-5", docstatus: 1, status: "To Deliver and Bill", editable: false },
    ),
    lines,
    totals: { qty: 8, total: 650, discount_amount: 0, net_total: 650, taxes: 0, grand_total: 650, rounding_adjustment: 0, rounded_total: 650 },
    per_delivered: 25,
    per_picked: 25,
    delivery_state: "partielle",
    can_edit_items: true,
    can_cancel: true,
    can_delete: true,
    pick_lists: [{ name: "PL-1", docstatus: 0, status: "Draft" }],
    delivery_notes: [{ name: "DN-1", docstatus: 1, status: "Livré", route: "LIV-1" }],
    blockers: [],
    ...extra,
  };
}

function renderSubmitted() {
  return render(
    <MemoryRouter initialEntries={["/commandes/SAL-ORD-5"]}>
      <Routes>
        <Route path="/commandes" element={<p>Liste des commandes</p>} />
        <Route path="/commandes/:orderId" element={<OrderEntryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OrderEntryPage : commande validée", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.order = submittedOrder();
    mocks.previewOrderUpdate.mockImplementation(async () => mocks.order);
    mocks.updateSubmittedOrder.mockImplementation(async () => mocks.order);
    mocks.cancelOrder.mockImplementation(async () => ({ ...submittedOrder(), docstatus: 2, status: "Cancelled", can_cancel: false }));
    mocks.deleteOrder.mockResolvedValue({ deleted: "SAL-ORD-5" });
    mocks.amendOrder.mockResolvedValue({ name: "SAL-ORD-5-1", amended_from: "SAL-ORD-5" });
  });

  it("affiche le suivi de livraison sans renvoyer vers ERPNext", async () => {
    renderSubmitted();
    expect(await screen.findByText("Partiellement livrée · 25 %")).toBeInTheDocument();
    expect(screen.getByTestId("order-line-delivery-ART-1")).toHaveTextContent("Livré 2 · Reste 3");
    expect(screen.getByText("PL-1")).toBeInTheDocument();
    expect(screen.getByText("DN-1")).toBeInTheDocument();
    expect(screen.queryByText(/ERPNext/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Quantité ART-1")).not.toBeInTheDocument();
  });

  it("modifie la commande sans descendre sous le livré", async () => {
    const user = userEvent.setup();
    renderSubmitted();
    await user.click(await screen.findByRole("button", { name: /^Modifier$/ }));

    expect(screen.getByRole("button", { name: "Retirer la ligne ART-1" })).toBeDisabled();
    const qty1 = screen.getByLabelText("Quantité ART-1");
    await user.clear(qty1);
    await user.type(qty1, "1{Enter}");
    expect(screen.getByLabelText("Quantité ART-1")).toHaveValue("5");

    await user.click(screen.getByRole("button", { name: "Ajouter une unité ART-2" }));
    const reserved = screen.getByLabelText("Réservé ART-2");
    await user.clear(reserved);
    await user.type(reserved, "2{Enter}");
    await waitFor(() => expect(mocks.previewOrderUpdate).toHaveBeenCalled(), { timeout: 2000 });

    await user.click(screen.getByRole("button", { name: /Enregistrer les modifications/ }));
    await waitFor(() =>
      expect(mocks.updateSubmittedOrder).toHaveBeenCalledWith({
        name: "SAL-ORD-5",
        delivery_date: "2026-10-04",
        lines: [
          expect.objectContaining({ item_code: "ART-1", qty: 5, row_name: "SOI-1", reserved_qty: 5 }),
          expect.objectContaining({ item_code: "ART-2", qty: 4, row_name: "SOI-2", reserved_qty: 2 }),
        ],
      }),
    );
  });

  it("annule la commande après confirmation", async () => {
    const user = userEvent.setup();
    renderSubmitted();
    await user.click(await screen.findByRole("button", { name: "Autres actions" }));
    await user.click(await screen.findByRole("menuitem", { name: /^Annuler$/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/1 liste de préparation et 1 BL brouillon/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Annuler la commande" }));
    await waitFor(() => expect(mocks.cancelOrder).toHaveBeenCalledWith("SAL-ORD-5"));
  });

  it("supprime la commande puis revient à la liste", async () => {
    const user = userEvent.setup();
    renderSubmitted();
    await user.click(await screen.findByRole("button", { name: "Autres actions" }));
    await user.click(await screen.findByRole("menuitem", { name: /^Supprimer$/ }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(mocks.deleteOrder).toHaveBeenCalledWith("SAL-ORD-5"));
    expect(await screen.findByText("Liste des commandes")).toBeInTheDocument();
  });

  it("ouvre le brouillon créé par « Modifier entièrement »", async () => {
    const user = userEvent.setup();
    renderSubmitted();
    await user.click(await screen.findByRole("button", { name: "Autres actions" }));
    await user.click(await screen.findByRole("menuitem", { name: /Modifier entièrement/ }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Annuler et modifier" }));
    await waitFor(() => expect(mocks.amendOrder).toHaveBeenCalledWith("SAL-ORD-5"));
  });

  it("bloque annulation et suppression quand la marchandise est partie", async () => {
    const user = userEvent.setup();
    mocks.order = submittedOrder({ blockers: ["Le BL DN-1 a déjà quitté la préparation."] });
    renderSubmitted();
    expect(await screen.findByText("Le BL DN-1 a déjà quitté la préparation.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Modifier$/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Autres actions" }));
    expect(await screen.findByRole("menuitem", { name: /^Annuler$/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: /^Supprimer$/ })).toHaveAttribute("aria-disabled", "true");
  });
});

