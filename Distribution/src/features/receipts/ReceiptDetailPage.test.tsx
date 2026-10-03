import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ReceiptDetailPage } from "@/features/receipts/ReceiptDetailPage";
import { chooseOption } from "@/test/chooseOption";

const mocks = vi.hoisted(() => {
  const detail = {
    name: "PR-1",
    supplier: "SUP-1",
    supplier_name: "Labo Atlas",
    company: "Modern Pharma",
    posting_date: "2026-10-03",
    warehouse: "Magasins - MP",
    supplier_delivery_note: "BL-77",
    currency: "DZD",
    docstatus: 0,
    status: "en_cours" as const,
    ready: false,
    linked_to_purchase_order: false,
    total_qty: 0,
    net_total: 0,
    grand_total: 0,
    lines: [] as Array<Record<string, unknown>>,
  };
  return {
    detail,
    data: { message: detail },
    options: {
      message: {
        company: "Modern Pharma",
        currency: "DZD",
        warehouses: ["Magasins - MP"],
        default_warehouse: "Magasins - MP",
        buying_price_list: "Achat standard",
        selling_price_list: "Vente standard",
        item_groups: ["Laits infantiles", "Hygiène & toilette"],
        brands: ["BIOMIL"],
        uoms: ["N°"],
        default_uom: "N°",
        supplier_groups: [],
        default_supplier_group: null,
        can_validate: true,
      },
    },
    scanReceiptItem: vi.fn(),
    saveLines: vi.fn(),
    markReady: vi.fn(),
    submitReceipt: vi.fn(),
    deleteReceipt: vi.fn(),
    createItem: vi.fn(),
  };
});

vi.mock("@/shared/api/receipts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api/receipts")>();
  return {
    ...actual,
    useReceipt: () => ({ data: mocks.data, error: undefined, isLoading: false, mutate: vi.fn() }),
    useReceiptOptions: () => ({ data: mocks.options }),
    useReceiptMutations: () => ({
      scanReceiptItem: mocks.scanReceiptItem,
      saveLines: mocks.saveLines,
      markReady: mocks.markReady,
      submitReceipt: mocks.submitReceipt,
      deleteReceipt: mocks.deleteReceipt,
      createItem: mocks.createItem,
      scanning: false,
      saving: false,
      markingReady: false,
      submitting: false,
      deleting: false,
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

const lait = {
  found: true,
  item_code: "ART-1",
  item_name: "Lait 1er âge",
  uom: "N°",
  increment: 1,
  rate: 950,
  has_batch_no: true,
  has_expiry_date: true,
  barcode: "3017620422003",
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/receptions/PR-1"]}>
      <Routes>
        <Route path="/receptions/:receiptId" element={<ReceiptDetailPage />} />
        <Route path="/receptions" element={<p>Liste des réceptions</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function scan(user: ReturnType<typeof userEvent.setup>, code: string) {
  const input = screen.getByLabelText("Code-barres article");
  await user.type(input, `${code}{Enter}`);
}

describe("ReceiptDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.options.message.can_validate = true;
    mocks.scanReceiptItem.mockResolvedValue(lait);
    mocks.saveLines.mockImplementation(async () => mocks.detail);
    mocks.submitReceipt.mockResolvedValue({ ...mocks.detail, docstatus: 1, status: "valide" });
    mocks.markReady.mockResolvedValue({ ...mocks.detail, ready: true, status: "a_valider" });
  });

  it("ajoute l'article scanné, incrémente puis enregistre automatiquement", async () => {
    const user = userEvent.setup();
    renderPage();

    await scan(user, "3017620422003");
    await scan(user, "3017620422003");

    const line = await screen.findByTestId("receipt-line-ART-1");
    expect(within(line).getByLabelText("Quantité reçue ART-1")).toHaveValue("2");
    expect(screen.getByText(/Lait 1er âge : 2 N° · saisissez le lot/)).toBeInTheDocument();
    await waitFor(() => expect(mocks.saveLines).toHaveBeenCalled(), { timeout: 2500 });
    expect(mocks.saveLines).toHaveBeenLastCalledWith("PR-1", [
      expect.objectContaining({ item_code: "ART-1", qty: 2, rate: 950, batch_no: null }),
    ]);
  });

  it("ouvre la création d'article pour un code inconnu puis ajoute l'article créé", async () => {
    const user = userEvent.setup();
    mocks.scanReceiptItem.mockResolvedValueOnce({ found: false, barcode: "999" });
    mocks.createItem.mockResolvedValue({ ...lait, item_code: "999", item_name: "Gel douche", barcode: "999", has_batch_no: false, has_expiry_date: false, rate: 300 });
    renderPage();

    await scan(user, "999");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Code-barres")).toHaveValue("999");
    await user.type(within(dialog).getByLabelText("Désignation"), "Gel douche");
    await chooseOption(user, within(dialog).getByRole("combobox", { name: "Groupe d’articles" }), "Hygiène & toilette");
    await user.type(within(dialog).getByLabelText("Prix d’achat"), "300");
    await user.click(within(dialog).getByRole("button", { name: "Créer et ajouter" }));

    await waitFor(() =>
      expect(mocks.createItem).toHaveBeenCalledWith(
        expect.objectContaining({
          barcode: "999",
          item_name: "Gel douche",
          item_group: "Hygiène & toilette",
          stock_uom: "N°",
          buying_rate: 300,
          has_batch_no: false,
          receipt: "PR-1",
          warehouse: "Magasins - MP",
        }),
      ),
    );
    expect(await screen.findByTestId("receipt-line-999")).toHaveTextContent("Gel douche");
  });

  it("bloque la validation tant que le lot manque, puis valide", async () => {
    const user = userEvent.setup();
    renderPage();
    await scan(user, "3017620422003");

    await user.click(screen.getByRole("button", { name: /Valider la réception/ }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Lait 1er âge : numéro de lot manquant.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Valider et mettre en stock" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Retour" }));

    await user.type(screen.getByLabelText("Lot ART-1"), "L2026{Enter}");
    await user.type(screen.getByLabelText("Péremption ART-1"), "2028-01-31");

    await user.click(screen.getByRole("button", { name: /Valider la réception/ }));
    dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Valider et mettre en stock" }));

    await waitFor(() => expect(mocks.submitReceipt).toHaveBeenCalledWith("PR-1"));
    expect(mocks.saveLines).toHaveBeenLastCalledWith("PR-1", [
      expect.objectContaining({ item_code: "ART-1", batch_no: "L2026", expiry_date: "2028-01-31" }),
    ]);
  });

  it("propose au magasinier de terminer la saisie au lieu de valider", async () => {
    const user = userEvent.setup();
    mocks.options.message.can_validate = false;
    mocks.scanReceiptItem.mockResolvedValue({ ...lait, has_batch_no: false, has_expiry_date: false });
    renderPage();
    await scan(user, "3017620422003");

    expect(screen.queryByRole("button", { name: /Valider la réception/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Terminer la saisie/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Terminer la saisie" }));

    await waitFor(() => expect(mocks.markReady).toHaveBeenCalledWith("PR-1", true));
    expect(mocks.saveLines).toHaveBeenCalled();
  });

  it("demande la quantité, le lot et la péremption après un scan caméra", async () => {
    const user = userEvent.setup();
    camera.onScan = null;
    renderPage();

    await user.click(screen.getByRole("button", { name: /Caméra/ }));
    await waitFor(() => expect(camera.onScan).not.toBeNull());
    act(() => camera.onScan?.("3017620422003"));

    const prompt = await screen.findByRole("form", { name: "Quantité de l’article scanné" });
    expect(within(prompt).getByText("Lait 1er âge")).toBeInTheDocument();
    const qty = within(prompt).getByLabelText("Quantité");
    expect(qty).toHaveValue("1");
    await user.clear(qty);
    await user.type(qty, "24");
    await user.type(within(prompt).getByLabelText("Numéro de lot"), "L2026");
    await user.type(within(prompt).getByLabelText("Date de péremption"), "2028-01-31");
    await user.click(within(prompt).getByRole("button", { name: "Ajouter" }));

    expect(screen.queryByRole("form", { name: "Quantité de l’article scanné" })).not.toBeInTheDocument();
    await waitFor(
      () =>
        expect(mocks.saveLines).toHaveBeenLastCalledWith("PR-1", [
          expect.objectContaining({ item_code: "ART-1", qty: 24, batch_no: "L2026", expiry_date: "2028-01-31" }),
        ]),
      { timeout: 2500 },
    );
  });
});
