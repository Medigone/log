import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderLinesTable } from "@/features/orders/OrderLinesTable";
import type { OrderLine } from "@/features/orders/orderDraft";
import type { OrderLineData } from "@/shared/api/orders";

function line(itemCode: string, patch: Partial<OrderLine> = {}): OrderLine {
  return {
    key: `k-${itemCode}`,
    itemCode,
    itemName: `Article ${itemCode}`,
    uom: "N°",
    qty: 2,
    discount: null,
    rate: null,
    available: 10,
    isStockItem: true,
    listPrice: 100,
    reservedQty: null,
    delivered: 0,
    ...patch,
  };
}

function renderTable(lines: OrderLine[]) {
  const handlers = { onChange: vi.fn(), onChangeMany: vi.fn(), onRemove: vi.fn() };
  render(<OrderLinesTable lines={lines} lastKey={null} {...handlers} />);
  return handlers;
}

describe("OrderLinesTable", () => {
  it("affiche le taux de TVA de la fiche article et signale un taux manquant", () => {
    const computed = (item_code: string, patch: Partial<OrderLineData>) =>
      ({ item_code, price_list_rate: 100, discount_percentage: 0, rate: 100, amount: 200, tax_rate: 0, tax_missing: false, ...patch }) as OrderLineData;
    const handlers = { onChange: vi.fn(), onChangeMany: vi.fn(), onRemove: vi.fn() };
    render(
      <OrderLinesTable
        lines={[line("A"), line("B"), line("C")]}
        preview={[computed("A", { tax_rate: 19 }), computed("B", {}), computed("C", { tax_missing: true })]}
        lastKey={null}
        {...handlers}
      />,
    );
    expect(screen.getByTestId("order-line-vat-A")).toHaveTextContent("19 %");
    expect(screen.getByTestId("order-line-vat-B")).toHaveTextContent("Exo.");
    expect(within(screen.getByTestId("order-line-vat-B")).queryByRole("img")).toBeNull();
    expect(screen.getByTestId("order-line-vat-C")).toHaveTextContent("Exo.");
    // L'alerte « taux absent » est affichée une seule fois, en bandeau, avec un lien vers la fiche.
    const banner = screen.getByTestId("vat-missing");
    expect(banner).toHaveTextContent("Article C");
    expect(within(banner).getByRole("link", { name: "Compléter la fiche" })).toHaveAttribute("href", "#/articles/C?tab=store");
  });

  it("affiche le manque, le réservé et le quota", () => {
    renderTable([line("A", { qty: 5, available: 3, quotaMax: 6, reservedQty: 3 })]);
    const row = screen.getByTestId("order-line-A");
    expect(within(row).getByTestId("order-line-short-A")).toHaveTextContent("3 dispo · manque 2");
    expect(within(row).getByLabelText("Réservé A")).toHaveValue("3");
    expect(within(row).getByRole("button", { name: "Réserver toute la quantité A" })).toBeInTheDocument();
    expect(row).toHaveTextContent("sur 5");
    expect(within(row).getByTestId("order-line-quota-A")).toHaveTextContent("quota 6");
  });

  it("affiche le stock détaillé et l’alerte de stock insuffisant", () => {
    renderTable([
      line("A", { qty: 3, available: 0, stock: { actual_qty: 10, reserved_qty: 10, ordered_qty: 19, net_qty: -9 } }),
    ]);
    const row = screen.getByTestId("order-line-A");
    const figures = within(row).getByTestId("stock-figures");
    expect(figures).toHaveTextContent("Stock 10 · Rés. 10 · Cmd 19");
    expect(within(row).getByTestId("order-line-short-A")).toHaveTextContent("Rupture");
    expect(within(row).getByRole("button", { name: "Réserver toute la quantité A" })).toHaveAttribute("title", expect.stringContaining("Non réservé"));
  });

  it("demande confirmation avant de retirer une ligne", async () => {
    const user = userEvent.setup();
    const { onRemove } = renderTable([line("A")]);

    await user.click(screen.getByRole("button", { name: "Retirer la ligne A" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Annuler" }));
    expect(onRemove).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Retirer la ligne A" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /Retirer/ }));
    expect(onRemove).toHaveBeenCalledWith(["k-A"]);
  });

  it("applique les actions groupées aux lignes sélectionnées", async () => {
    const user = userEvent.setup();
    const { onChangeMany, onRemove } = renderTable([line("A"), line("B"), line("C", { delivered: 1 })]);

    await user.click(screen.getByRole("checkbox", { name: "Sélectionner toutes les lignes" }));
    const toolbar = screen.getByRole("toolbar", { name: "Actions sur les lignes sélectionnées" });
    expect(toolbar).toHaveTextContent("3 lignes sélectionnées");

    await user.click(within(toolbar).getByRole("button", { name: /Libérer/ }));
    expect(onChangeMany).toHaveBeenLastCalledWith(["k-A", "k-B", "k-C"], { reservedQty: 0 });

    await user.type(within(toolbar).getByLabelText("Remise pour la sélection"), "5");
    await user.click(within(toolbar).getByRole("button", { name: /Appliquer/ }));
    expect(onChangeMany).toHaveBeenLastCalledWith(["k-A", "k-B", "k-C"], { discount: 5, rate: null });

    // La ligne déjà livrée n'est pas retirée.
    await user.click(within(toolbar).getByRole("button", { name: /Retirer \(2\)/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Retirer 2 lignes");
    await user.click(within(dialog).getByRole("button", { name: /^Retirer$/ }));
    expect(onRemove).toHaveBeenCalledWith(["k-A", "k-B"]);
  });
});
