import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { DesktopShell } from "@/layouts/DesktopShell";
import { NAV_ALERT_DISMISS_KEY } from "@/layouts/NavAlertCard";
import type { ActivityDashboardData } from "@/shared/types/distribution";

vi.mock("frappe-react-sdk", () => ({ useFrappeAuth: () => ({ logout: vi.fn() }) }));

const dashboardState = {
  data: undefined as { message: ActivityDashboardData } | undefined,
};

vi.mock("@/shared/api/distribution", () => ({
  useActivityDashboard: () => dashboardState,
}));

const manager = { name: "manager@test", email: "manager@test", fullName: "Responsable Test", role: "responsable" as const };

const dashboard: ActivityDashboardData = {
  date: "2026-09-05",
  role: "responsable",
  preparation: { toPick: 4, overdue: 1, today: 0, later: 0, inProgressPickLists: 0, remainingQty: 0, shortageOrders: 0, pickLists: [] },
  planning: { unassigned: 5, overdue: 2 },
  fulfillment: { toLoad: 1, loaded: 0, returnsPending: 0, toLoadRoutes: [], returnRoutes: [] },
  payments: { toControl: 3, discrepancies: 0, declaredToday: 0, pendingPayments: 0, driverCashTotal: 0, driverCashBoxes: 0 },
  alerts: [{ id: "prep-overdue", tone: "danger", title: "Préparation en retard", detail: "1 commande" }],
};

function renderShell(user: Parameters<typeof DesktopShell>[0]["user"], path = "/today") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DesktopShell user={user}>
        <p>Accueil</p>
      </DesktopShell>
    </MemoryRouter>,
  );
}

function navHrefs() {
  return screen
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"))
    .filter((href): href is string => Boolean(href));
}

describe("DesktopShell", () => {
  beforeEach(() => {
    dashboardState.data = undefined;
    sessionStorage.removeItem(NAV_ALERT_DISMISS_KEY);
  });

  it("n'affiche au préparateur que son espace autorisé", () => {
    renderShell({ name: "prep@test", email: "prep@test", fullName: "Préparateur Test", role: "preparateur" });
    const hrefs = navHrefs();
    expect(hrefs).toContain("/today");
    expect(hrefs).toContain("/preparation");
    expect(hrefs).toContain("/stock");
    expect(hrefs).not.toContain("/planning");
    expect(hrefs).not.toContain("/livreurs");
    expect(hrefs).not.toContain("/caisses");
    expect(screen.getAllByText("Exploitation").length).toBeGreaterThan(0);
    expect(screen.getByText("Ressources")).toBeInTheDocument();
    expect(screen.queryByText("Encaissement")).not.toBeInTheDocument();
  });

  it("donne au responsable les parcours opérationnels groupés", () => {
    renderShell(manager);
    const hrefs = navHrefs();
    expect(hrefs).toEqual(expect.arrayContaining(["/today", "/preparation", "/planning", "/deliveries", "/livreurs", "/vehicules", "/stock", "/cashier", "/caisses"]));
    expect(screen.getAllByText("Exploitation").length).toBeGreaterThan(0);
    expect(screen.getByText("Ressources")).toBeInTheDocument();
    expect(screen.getByText("Encaissement")).toBeInTheDocument();
    expect(screen.queryByText("Console")).not.toBeInTheDocument();
  });

  it("réserve l'espace caisse au Caissier", () => {
    render(
      <MemoryRouter initialEntries={["/cashier"]}>
        <DesktopShell user={{ name: "cash@test", email: "cash@test", fullName: "Caissier Test", role: "caissier" }}>
          <p>Contrôle</p>
        </DesktopShell>
      </MemoryRouter>,
    );
    const hrefs = navHrefs();
    expect(hrefs).toContain("/cashier");
    expect(hrefs).not.toContain("/caisses");
    expect(hrefs).not.toContain("/planning");
    expect(hrefs).not.toContain("/livreurs");
    expect(hrefs).not.toContain("/preparation");
    expect(hrefs).not.toContain("/stock");
    expect(screen.getAllByText("Encaissement").length).toBeGreaterThan(0);
    expect(screen.queryByText("Exploitation")).not.toBeInTheDocument();
  });

  it("permet de fermer puis de rouvrir le menu", async () => {
    const user = userEvent.setup();
    renderShell(manager);
    await user.click(screen.getByRole("button", { name: "Réduire le menu" }));
    expect(screen.getByRole("button", { name: "Déplier le menu" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Déplier le menu" }));
    expect(screen.getByRole("button", { name: "Réduire le menu" })).toBeInTheDocument();
  });

  it("affiche les compteurs de file et l’encart d’anomalies", async () => {
    dashboardState.data = { message: dashboard };
    const user = userEvent.setup();
    renderShell(manager);
    expect(within(screen.getByRole("link", { name: /préparation/i })).getByText("4")).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: /planification/i })).getByText("5")).toBeInTheDocument();
    expect(screen.getByText("1 anomalie")).toBeInTheDocument();
    expect(screen.getByText("Préparation en retard")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Masquer les anomalies" }));
    expect(screen.queryByText("1 anomalie")).not.toBeInTheDocument();
  });

  it("ouvre la recherche vers une page de la console", async () => {
    const user = userEvent.setup();
    renderShell(manager);
    await user.click(screen.getByRole("button", { name: /rechercher/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Rechercher une page…"), "planif");
    await user.click(screen.getByRole("button", { name: /planification/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
