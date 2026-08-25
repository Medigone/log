import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DriverCashPage } from "@/features/cashier/DriverCashPage";

const mocks = vi.hoisted(() => ({
  adjust: vi.fn().mockResolvedValue({ balance: -200 }),
  mutate: vi.fn().mockResolvedValue(undefined),
}));

const boxes = [
  { name: "CAISSE-DRV-1", driver: "DRV-1", driverName: "Karim", balance: 1500, updatedAt: "2026-08-25 10:00:00", active: true },
  { name: "CAISSE-DRV-2", driver: "DRV-2", driverName: "Nadir", balance: -80, updatedAt: "2026-08-25 11:00:00", active: true },
];

const detail = {
  name: "CAISSE-DRV-1",
  driver: "DRV-1",
  driverName: "Karim",
  balance: 1500,
  updatedAt: "2026-08-25 10:00:00",
  movements: [
    { name: "MVT-1", type: "Retour tournée", amount: 1500, balanceAfter: 1500, routeId: "LIV-1", reason: "Espèces comptées", date: "2026-08-25 10:00:00" },
  ],
};

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

describe("DriverCashPage", () => {
  it("montre le solde négatif et enregistre une remise responsable", async () => {
    const user = userEvent.setup();
    render(<DriverCashPage canAdjust />);

    expect(await screen.findByRole("heading", { name: /caisses des livreurs/i })).toBeInTheDocument();
    expect(screen.getByText("Nadir")).toBeInTheDocument();
    expect(screen.getByText(/-80/)).toBeInTheDocument();
    expect(screen.getByText("Retour tournée")).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox"), "Remise");
    await user.type(screen.getByRole("spinbutton"), "200");
    await user.type(screen.getByPlaceholderText(/expliquez le mouvement/i), "Remise du soir");
    await user.click(screen.getByRole("button", { name: /enregistrer/i }));

    await waitFor(() => expect(mocks.adjust).toHaveBeenCalledWith(expect.objectContaining({
      driver: "DRV-1",
      type: "Remise",
      amount: 200,
      reason: "Remise du soir",
    })));
  });

  it("cache le formulaire d’ajustement pour le caissier", async () => {
    render(<DriverCashPage />);
    expect(await screen.findByRole("heading", { name: /caisses des livreurs/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enregistrer/i })).not.toBeInTheDocument();
  });
});
