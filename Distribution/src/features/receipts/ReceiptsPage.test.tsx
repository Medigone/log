import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ReceiptsPage } from "@/features/receipts/ReceiptsPage";

const mocks = vi.hoisted(() => ({
  list: {
    message: {
      receipts: [
        {
          name: "PR-1",
          supplier: "SUP-1",
          supplier_name: "Labo Atlas",
          posting_date: "2026-10-03",
          warehouse: "Magasins - MP",
          supplier_delivery_note: "BL-77",
          total_qty: 24,
          grand_total: 22800,
          lines: 3,
          status: "a_valider",
        },
        {
          name: "PR-2",
          supplier: "SUP-2",
          supplier_name: "Nutri Distribution",
          posting_date: "2026-10-02",
          warehouse: "Magasins - MP",
          total_qty: 10,
          grand_total: 5000,
          lines: 1,
          status: "en_cours",
        },
      ],
      counts: { en_cours: 1, a_valider: 1, valide_30j: 7 },
    },
  },
  options: {
    message: {
      company: "Modern Pharma",
      warehouses: ["Magasins - MP", "Produits finis - MP"],
      default_warehouse: "Magasins - MP",
      can_validate: true,
    },
  },
  createReceipt: vi.fn(),
  searchSuppliers: vi.fn(),
  createSupplier: vi.fn(),
  useReceipts: vi.fn(),
}));

vi.mock("@/shared/api/receipts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api/receipts")>();
  return {
    ...actual,
    useReceipts: (status: string) => {
      mocks.useReceipts(status);
      return { data: mocks.list, error: undefined, isLoading: false, mutate: vi.fn() };
    },
    useReceiptOptions: () => ({ data: mocks.options }),
    useReceiptMutations: () => ({
      createReceipt: mocks.createReceipt,
      searchSuppliers: mocks.searchSuppliers,
      createSupplier: mocks.createSupplier,
    }),
  };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/receptions"]}>
      <Routes>
        <Route path="/receptions" element={<ReceiptsPage />} />
        <Route path="/receptions/:receiptId" element={<p>Fiche réception</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ReceiptsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchSuppliers.mockResolvedValue([{ name: "SUP-1", supplier_name: "Labo Atlas" }]);
    mocks.createReceipt.mockResolvedValue({ name: "PR-9" });
    mocks.createSupplier.mockResolvedValue({ name: "Nouveau Labo", supplier_name: "Nouveau Labo" });
  });

  it("liste les réceptions avec leur statut et filtre par indicateur", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText("Labo Atlas")).toBeInTheDocument();
    expect(screen.getAllByText("À valider").length).toBeGreaterThan(0);
    expect(mocks.useReceipts).toHaveBeenLastCalledWith("all");

    await user.click(screen.getByRole("button", { name: /Validées \(30 j\)/ }));
    expect(mocks.useReceipts).toHaveBeenLastCalledWith("valide");

    await user.type(screen.getByLabelText("Rechercher une réception"), "nutri");
    expect(screen.queryByText("Labo Atlas")).not.toBeInTheDocument();
    expect(screen.getByText("Nutri Distribution")).toBeInTheDocument();
  });

  it("crée une réception pour un fournisseur puis ouvre la saisie", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getAllByRole("button", { name: /Nouvelle réception/ })[0]);
    const dialog = await screen.findByRole("dialog");
    await user.click(await within(dialog).findByRole("option", { name: /Labo Atlas/ }));
    await user.type(within(dialog).getByLabelText("N° BL fournisseur"), "BL-88");
    await user.click(within(dialog).getByRole("button", { name: "Commencer la réception" }));

    await waitFor(() =>
      expect(mocks.createReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ supplier: "SUP-1", warehouse: "Magasins - MP", supplier_delivery_note: "BL-88" }),
      ),
    );
    expect(await screen.findByText("Fiche réception")).toBeInTheDocument();
  });

  it("propose de créer un fournisseur absent", async () => {
    const user = userEvent.setup();
    mocks.searchSuppliers.mockResolvedValue([]);
    renderPage();

    await user.click(screen.getAllByRole("button", { name: /Nouvelle réception/ })[0]);
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Rechercher un fournisseur"), "Nouveau Labo");
    await user.click(await within(dialog).findByRole("button", { name: /Créer le fournisseur « Nouveau Labo »/ }));

    await waitFor(() => expect(mocks.createSupplier).toHaveBeenCalledWith("Nouveau Labo"));
    expect(await within(dialog).findByText("Nouveau Labo")).toBeInTheDocument();
  });
});
