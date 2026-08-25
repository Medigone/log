import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CashierPage } from "@/features/cashier/CashierPage";

const mocks = vi.hoisted(() => ({
  validate: vi.fn().mockResolvedValue({ reconciliation: { requiresManagerApproval: false } }),
  mutate: vi.fn().mockResolvedValue(undefined),
}));

const route = {
  name: "LIV-CASH-1",
  date: "2026-08-25",
  lifecycle: "Contrôle caisse",
  revision: 4,
  driver: "DRV-1",
  driverName: "Livreur Test",
};

const reconciliation = {
  routeId: "LIV-CASH-1",
  routeLifecycle: "Contrôle caisse",
  status: "À contrôler",
  declaredCash: 1500,
  declaredCheques: 0,
  declaredTotal: 1500,
  countedTotal: 0,
  validatedTotal: 0,
  payments: [{
    name: "PAY-1",
    deliveryNote: "DN-1",
    salesInvoice: "SINV-1",
    customer: "CUST-1",
    customerName: "Client Test",
    method: "Espèce",
    amount: 1500,
    countedAmount: 0,
    status: "À contrôler",
    allocations: [{ salesInvoice: "SINV-1", outstandingBefore: 1000, allocatedAmount: 1000 }],
    unallocatedAmount: 500,
  }],
};

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useCashierRoutes: () => ({ data: { message: [route] }, error: undefined, isLoading: false, mutate: mocks.mutate }),
  useCashierReconciliation: (routeId?: string) => ({ data: routeId ? { message: reconciliation } : undefined, error: undefined, isLoading: false, mutate: mocks.mutate }),
  useDistributionMutations: () => ({ validateCashReconciliation: mocks.validate, cashier: false }),
}));

describe("CashierPage", () => {
  it("contrôle la déclaration, la facture et l'avance avant de créer le paiement", async () => {
    const user = userEvent.setup();
    render(<CashierPage />);

    expect(await screen.findByRole("heading", { name: /caisse des tournées/i })).toBeInTheDocument();
    expect(screen.getByText("SINV-1")).toBeInTheDocument();
    expect(screen.getByText(/avance client : 500 DZD/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /valider le contrôle de caisse/i }));

    await waitFor(() => expect(mocks.validate).toHaveBeenCalledWith(expect.objectContaining({
      routeId: "LIV-CASH-1",
      countedCash: 1500,
      payments: [expect.objectContaining({ paymentId: "PAY-1" })],
    })));
  });
});
