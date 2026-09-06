import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DriverCashBoxPage } from "@/features/cashier/DriverCashBoxPage";
import type { DriverCashBox } from "@/shared/types/distribution";

const mocks = vi.hoisted(() => ({
  adjust: vi.fn().mockResolvedValue({ balance: 1300 }),
  mutate: vi.fn().mockResolvedValue(undefined),
  toastSuccess: vi.fn(),
}));

const boxes: DriverCashBox[] = [
  {
    name: "CAISSE-DRV-1",
    driver: "DRV-1",
    driverName: "Karim",
    balance: 1500,
    updatedAt: "2026-08-25 10:00:00",
    active: true,
    todayRouteId: "LIV-1",
  },
  { name: "CAISSE-DRV-2", driver: "DRV-2", driverName: "Nadir", balance: -80, updatedAt: "2026-08-25 11:00:00", active: true },
];

const detail: DriverCashBox = {
  ...boxes[0],
  pendingControlAmount: 1500,
  movements: [
    { name: "MVT-1", type: "Encaissement", amount: 1500, balanceAfter: 1500, routeId: "LIV-1", reason: "Espèces comptées", date: "2026-08-25 10:00:00" },
    { name: "MVT-2", type: "Remise", amount: -200, balanceAfter: 1300, reason: "Remise partielle", date: "2026-08-25 18:00:00" },
  ],
};

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}));

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useDriverCashBoxes: () => ({ data: { message: boxes }, error: undefined, isLoading: false, mutate: mocks.mutate }),
  useDriverCashBox: (driver?: string) => ({
    data: driver === "DRV-1" ? { message: detail } : driver === "DRV-2" ? { message: { ...boxes[1], movements: [] } } : undefined,
    error: undefined,
    isLoading: false,
    mutate: mocks.mutate,
  }),
  useDistributionMutations: () => ({ postDriverCashAdjustment: mocks.adjust, driverCash: false }),
}));

function renderDetail(path = "/caisses/DRV-1") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/caisses/:driver" element={<DriverCashBoxPage />} />
        <Route path="/caisses" element={<p>Liste</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("DriverCashBoxPage", () => {
  it("montre le solde signé, l'état et les tuiles de flux", async () => {
    renderDetail();
    expect(await screen.findByRole("heading", { name: "Karim" })).toBeInTheDocument();
    expect(screen.getAllByText("À remettre").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "LIV-1" })).toHaveAttribute("href", "/planning/routes/LIV-1");
    expect(screen.getByText("Espèces comptées")).toBeInTheDocument();
    expect(screen.getByText(/encaissé/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ouvrir le contrôle de caisse/i })).toHaveAttribute("href", "/cashier");
  });

  it("filtre l'historique par type", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole("button", { name: /^remise/i }));
    expect(screen.getByText("Remise partielle")).toBeInTheDocument();
    expect(screen.queryByText("Espèces comptées")).not.toBeInTheDocument();
  });

  it("exige montant et motif, prévisualise le solde, et signe une remise", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole("button", { name: /mouvement/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: /enregistrer/i })).toBeDisabled();
    expect(within(dialog).getByText(/montant et motif obligatoires/i)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Montant"), "200");
    expect(within(dialog).getByText(/le solde passera de/i)).toBeInTheDocument();
    await user.type(within(dialog).getByPlaceholderText(/expliquez le mouvement/i), "Remise du soir");
    await user.click(within(dialog).getByRole("button", { name: /enregistrer/i }));
    await waitFor(() =>
      expect(mocks.adjust).toHaveBeenCalledWith(
        expect.objectContaining({ driver: "DRV-1", type: "Remise", amount: 200, reason: "Remise du soir" }),
      ),
    );
  });

  it("préremplit Remettre au solde actuel", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole("button", { name: /remettre 1.?500/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Montant")).toHaveValue(1500);
  });
});
