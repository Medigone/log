import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CashierRoutePage } from "@/features/cashier/CashierRoutePage";
import type { CashReconciliation, DistributionRoute } from "@/shared/types/distribution";

const mocks = vi.hoisted(() => ({
  validate: vi.fn().mockResolvedValue({ reconciliation: { requiresManagerApproval: false } }),
  resolve: vi.fn().mockResolvedValue({ reconciliation: { requiresManagerApproval: false } }),
  mutate: vi.fn().mockResolvedValue(undefined),
  route: null as DistributionRoute | null,
  reconciliation: null as CashReconciliation | null,
}));

const route = {
  name: "LIV-CASH-1",
  date: "2026-08-25",
  lifecycle: "Contrôle caisse",
  revision: 4,
  driver: "DRV-1",
  driverName: "Livreur Test",
  vehicleLabel: "CAM-04",
  cash: { status: "À contrôler", declaredCash: 1500, declaredCheques: 0, declaredTotal: 1500, countedTotal: 0, payments: [] },
} as unknown as DistributionRoute;

const reconciliation: CashReconciliation = {
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
  useCashierRoutes: () => ({ data: { message: mocks.route ? [mocks.route] : [] }, error: undefined, isLoading: false, mutate: mocks.mutate }),
  useCashierReconciliation: (routeId?: string) => ({
    data: routeId && mocks.reconciliation ? { message: mocks.reconciliation } : undefined,
    error: undefined,
    isLoading: false,
    mutate: mocks.mutate,
  }),
  useDistributionMutations: () => ({
    validateCashReconciliation: mocks.validate,
    resolveCashDiscrepancy: mocks.resolve,
    cashier: false,
  }),
}));

function renderDetail(path = "/cashier/LIV-CASH-1", canResolve = false) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/cashier/:routeId" element={<CashierRoutePage canResolveDiscrepancy={canResolve} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CashierRoutePage", () => {
  it("contrôle la déclaration, la facture et l'avance avant de créer le paiement", async () => {
    mocks.route = route;
    mocks.reconciliation = reconciliation;
    const user = userEvent.setup();
    renderDetail();

    expect(await screen.findByText("LIV-CASH-1")).toBeInTheDocument();
    await user.click(screen.getByText("Client Test"));
    expect(screen.getAllByText("SINV-1").length).toBeGreaterThan(0);
    expect(screen.getByText(/avance client/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /valider le contrôle de caisse/i }));

    await waitFor(() => expect(mocks.validate).toHaveBeenCalledWith(expect.objectContaining({
      routeId: "LIV-CASH-1",
      countedCash: 1500,
      payments: [expect.objectContaining({ paymentId: "PAY-1" })],
    })));
  });

  it("nomme le blocage quand aucun encaissement n’est déclaré", () => {
    mocks.route = route;
    mocks.reconciliation = { ...reconciliation, payments: [], declaredCash: 0, declaredTotal: 0 };
    renderDetail();
    expect(screen.getByText(/rien à contrôler/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /valider le contrôle de caisse/i })).toBeDisabled();
  });

  it("exige un motif dès qu’un écart est constaté", async () => {
    mocks.route = route;
    mocks.reconciliation = reconciliation;
    const user = userEvent.setup();
    renderDetail();
    await user.clear(screen.getByLabelText(/espèces comptées/i));
    await user.type(screen.getByLabelText(/espèces comptées/i), "500");
    expect(screen.getByText(/motif d'écart manquant/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /transmettre l’écart au responsable/i })).toBeDisabled();
  });
});
