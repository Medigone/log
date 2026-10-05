import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ReceivablesPage } from "@/features/receivables/ReceivablesPage";

const mocks = vi.hoisted(() => ({ useReceivables: vi.fn() }));

vi.mock("@/shared/api/receivables", () => mocks);

const debtor = (patch: Record<string, unknown>) => ({
  customer: "CLI-1",
  customer_name: "Pharmacie Centrale",
  customer_group: "Pharmacie",
  wilaya: "Oran",
  invoices: 2,
  gross: 0,
  credits: 0,
  net: 0,
  not_due: 0,
  d30: 0,
  d60: 0,
  d90: 0,
  d90_plus: 0,
  overdue: 0,
  due_soon: 0,
  oldest_due_date: null,
  max_days_overdue: 0,
  credit_limit: null,
  over_limit: false,
  last_payment: "2026-09-20",
  ...patch,
});

const receivables = {
  as_of: "2026-10-05",
  soon_days: 7,
  totals: {
    gross: 130000,
    credits: 0,
    net: 130000,
    overdue: 100000,
    overdue_share: 0.769,
    due_soon: 30000,
    d90_plus: 80000,
    buckets: { not_due: 30000, d30: 20000, d60: 0, d90: 0, d90_plus: 80000 },
    customers: 2,
    overdue_customers: 2,
    due_soon_customers: 1,
    d90_customers: 1,
    over_limit_customers: 1,
    invoices: 4,
  },
  customers: [
    debtor({ customer: "CLI-2", customer_name: "Pharmacie du Port", gross: 80000, net: 80000, d90_plus: 80000, overdue: 80000, max_days_overdue: 120, credit_limit: 50000, over_limit: true }),
    debtor({ gross: 50000, net: 50000, d30: 20000, not_due: 30000, overdue: 20000, due_soon: 30000, max_days_overdue: 12 }),
  ],
};

describe("ReceivablesPage", () => {
  beforeEach(() => {
    mocks.useReceivables.mockReset().mockReturnValue({ data: { message: receivables }, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() });
  });

  it("affiche les créances au jour et filtre la balance âgée depuis un indicateur", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ReceivablesPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Créances clients" })).toBeInTheDocument();
    const kpis = screen.getByRole("region", { name: "Indicateurs des créances" });
    expect(within(kpis).getByText("Situation au 05/10/2026")).toBeInTheDocument();
    expect(within(kpis).getByText(/76,9\s?%/)).toBeInTheDocument();

    await user.click(within(kpis).getByRole("button", { name: /Plafond dépassé/ }));
    const table = screen.getByRole("table", { name: "Créances par client" });
    expect(within(table).getByText("Pharmacie du Port")).toBeInTheDocument();
    expect(within(table).queryByText("Pharmacie Centrale")).toBeNull();
    expect(within(table).getByText("120 j")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Réinitialiser/ }));
    expect(within(screen.getByRole("table", { name: "Créances par client" })).getByText("Pharmacie Centrale")).toBeInTheDocument();
  });
});
