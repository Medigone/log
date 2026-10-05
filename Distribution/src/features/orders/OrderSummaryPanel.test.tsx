import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyDraft } from "@/features/orders/orderDraft";
import { OrderFooter } from "@/features/orders/OrderSummaryPanel";
import type { OrderDetail } from "@/shared/api/orders";

const preview = {
  lines: [],
  taxes: [{ description: "TVA 19%", rate: 19, base: 1000, amount: 190 }],
  payment_schedule: [],
  totals: { qty: 3, total: 1500, discount_amount: 0, net_total: 1500, taxes: 190, grand_total: 1690, rounding_adjustment: 0, rounded_total: 1690 },
} as unknown as OrderDetail;

describe("OrderFooter", () => {
  it("ventile la TVA par taux, exonéré compris", async () => {
    const user = userEvent.setup();
    render(<OrderFooter draft={emptyDraft()} preview={preview} onChange={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "Taxes" }));
    const table = screen.getByRole("table", { name: "Ventilation de la TVA" });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("19 %");
    expect(rows[1]).toHaveTextContent("1 000");
    expect(rows[2]).toHaveTextContent("Exonéré");
    expect(rows[2]).toHaveTextContent("500");
    expect(within(screen.getByLabelText("Totaux")).getByText("Total TTC")).toBeInTheDocument();
  });
});
