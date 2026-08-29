import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { DriverCashPage } from "@/features/cashier/DriverCashPage";
import { chooseOption } from "@/test/chooseOption";

const mocks = vi.hoisted(() => ({
  adjust: vi.fn().mockResolvedValue({ balance: -200 }),
  mutate: vi.fn().mockResolvedValue(undefined),
  toastSuccess: vi.fn(),
}));

const boxes = [
  { name: "CAISSE-DRV-1", driver: "DRV-1", driverName: "Karim", balance: 1500, updatedAt: "2026-08-25 10:00:00", active: true },
  { name: "CAISSE-DRV-2", driver: "DRV-2", driverName: "Nadir", balance: -80, updatedAt: "2026-08-25 11:00:00", active: true },
  { name: "CAISSE-DRV-3", driver: "DRV-3", driverName: "Samir", balance: 0, updatedAt: "2026-08-24 09:00:00", active: false },
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

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}));

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useDriverCashBoxes: () => ({ data: { message: boxes }, error: undefined, isLoading: false, mutate: mocks.mutate }),
  useDriverCashBox: (driver?: string) => ({
    data: driver === "DRV-1"
      ? { message: detail }
      : driver === "DRV-2"
        ? { message: { ...boxes[1], movements: [] } }
        : driver === "DRV-3"
          ? { message: { ...boxes[2], movements: [] } }
          : undefined,
    error: undefined,
    isLoading: false,
    mutate: mocks.mutate,
  }),
  useDistributionMutations: () => ({ postDriverCashAdjustment: mocks.adjust, driverCash: false }),
}));

function renderPage(canAdjust = false) {
  return render(
    <MemoryRouter>
      <DriverCashPage canAdjust={canAdjust} />
    </MemoryRouter>,
  );
}

describe("DriverCashPage", () => {
  it("montre le solde négatif et enregistre une remise responsable", async () => {
    const user = userEvent.setup();
    renderPage(true);

    expect(await screen.findByRole("heading", { name: /caisses des livreurs/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /nadir/i })).toHaveTextContent(/-80/);
    expect(screen.getByRole("link", { name: "LIV-1" })).toHaveAttribute("href", "/planning/routes/LIV-1");
    expect(screen.getByText("Espèces comptées")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /nouveau mouvement/i }));
    const dialog = await screen.findByRole("dialog");
    await chooseOption(user, within(dialog).getByRole("combobox"), "Remise");
    await user.type(within(dialog).getByRole("spinbutton"), "200");
    await user.type(within(dialog).getByPlaceholderText(/expliquez le mouvement/i), "Remise du soir");
    await user.click(within(dialog).getByRole("button", { name: /enregistrer/i }));

    await waitFor(() => expect(mocks.adjust).toHaveBeenCalledWith(expect.objectContaining({
      driver: "DRV-1",
      type: "Remise",
      amount: 200,
      reason: "Remise du soir",
    })));
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it("cache le formulaire d’ajustement pour le caissier", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: /caisses des livreurs/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nouveau mouvement/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enregistrer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "LIV-1" })).not.toBeInTheDocument();
    expect(screen.getByText("LIV-1")).toBeInTheDocument();
  });

  it("filtre les caisses par KPI, recherche et état", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("heading", { name: "Karim" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /samir/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /soldes négatifs/i }));
    expect(screen.getByRole("heading", { name: "Nadir" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Karim" })).not.toBeInTheDocument();

    await chooseOption(user, screen.getByRole("combobox", { name: "État" }), "Inactifs");
    expect(screen.getByRole("heading", { name: "Samir" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nadir" })).not.toBeInTheDocument();

    await chooseOption(user, screen.getByRole("combobox", { name: "État" }), "Tous (actifs)");
    await user.type(screen.getByRole("textbox", { name: /rechercher un livreur/i }), "Karim");
    expect(screen.getByRole("heading", { name: "Karim" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nadir/i })).not.toBeInTheDocument();
  });
});
