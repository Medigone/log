import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { DriverCashPage } from "@/features/cashier/DriverCashPage";
import { chooseOption } from "@/test/chooseOption";
import type { DriverCashBox } from "@/shared/types/distribution";

const mocks = vi.hoisted(() => ({
  adjust: vi.fn().mockResolvedValue({ balance: 0 }),
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
    lastMovement: { name: "MVT-1", type: "Encaissement", amount: 1500, balanceAfter: 1500, routeId: "LIV-1", date: "2026-08-25 10:00:00" },
    todayRouteId: "LIV-1",
  },
  { name: "CAISSE-DRV-2", driver: "DRV-2", driverName: "Nadir", balance: -80, updatedAt: "2026-08-25 11:00:00", active: true },
  { name: "CAISSE-DRV-3", driver: "DRV-3", driverName: "Samir", balance: 0, updatedAt: "2026-08-24 09:00:00", active: false },
];

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}));

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useDriverCashBoxes: () => ({ data: { message: boxes }, error: undefined, isLoading: false, mutate: mocks.mutate }),
  useDriverCashBox: () => ({ data: undefined, error: undefined, isLoading: false, mutate: mocks.mutate }),
  useDistributionMutations: () => ({ postDriverCashAdjustment: mocks.adjust, driverCash: false }),
}));

function DetailStub() {
  const { driver } = useParams();
  return <p>Détail {driver}</p>;
}

function renderList(entry = "/caisses") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/caisses" element={<DriverCashPage />} />
        <Route path="/caisses/:driver" element={<DetailStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("DriverCashPage", () => {
  it("affiche une ligne par caisse active, un total, et n'ouvre aucune caisse", () => {
    renderList();
    expect(screen.getByRole("heading", { name: /caisses des livreurs/i })).toBeInTheDocument();
    expect(screen.getByText("Karim")).toBeInTheDocument();
    expect(screen.getByText("Nadir")).toBeInTheDocument();
    expect(screen.queryByText("Samir")).not.toBeInTheDocument();
    expect(screen.getByText("Total des caisses affichées")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /\+ mouvement/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Karim" })).not.toBeInTheDocument();
  });

  it("ouvre le détail au clic d'une ligne", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByText("Karim"));
    expect(screen.getByText("Détail DRV-1")).toBeInTheDocument();
  });

  it("filtre par chips et masque les inactifs par défaut", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: /inactif/i }));
    expect(screen.getByText("Samir")).toBeInTheDocument();
    expect(screen.queryByText("Karim")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /réinitialiser/i }));
    expect(screen.getByText("Karim")).toBeInTheDocument();
    expect(screen.queryByText("Samir")).not.toBeInTheDocument();
  });

  it("préremplit Remettre au solde et enregistre l'opération", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: /^remettre$/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Montant")).toHaveValue(1500);
    expect(within(dialog).getByRole("button", { name: "Remise" })).toHaveAttribute("aria-pressed", "true");
    await user.type(within(dialog).getByPlaceholderText(/expliquez le mouvement/i), "Remise du soir");
    await user.click(within(dialog).getByRole("button", { name: /enregistrer/i }));
    await waitFor(() =>
      expect(mocks.adjust).toHaveBeenCalledWith(
        expect.objectContaining({ driver: "DRV-1", type: "Remise", amount: 1500, reason: "Remise du soir" }),
      ),
    );
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it("trie par nom", async () => {
    const user = userEvent.setup();
    renderList();
    await chooseOption(user, screen.getByRole("combobox", { name: "Tri" }), "Nom A → Z");
    const names = screen.getAllByText(/karim|nadir/i).map((node) => node.textContent);
    expect(names[0]).toMatch(/Karim/);
  });
});
