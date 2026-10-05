import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { DesktopShell } from "@/layouts/DesktopShell";
import { NAV_ALERT_DISMISS_KEY } from "@/layouts/NavAlertCard";
import { deskRoot } from "@/shared/frappeCompat";
import type { ActivityDashboardData } from "@/shared/types/distribution";

vi.mock("frappe-react-sdk", () => ({ useFrappeAuth: () => ({ logout: vi.fn() }) }));

const dashboardState = {
  data: undefined as { message: ActivityDashboardData } | undefined,
};

vi.mock("@/shared/api/distribution", () => ({
  useActivityDashboard: () => dashboardState,
}));

vi.mock("@/shared/api/receipts", () => ({
  useReceiptCounts: () => ({ data: undefined }),
}));

vi.mock("@/shared/api/orders", () => ({
  useOrderCounts: () => ({ data: undefined }),
}));

vi.mock("@/shared/api/inventory", () => ({
  useInventories: () => ({ data: undefined }),
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
    localStorage.clear();
  });

  it("n'affiche au préparateur que son espace autorisé", () => {
    renderShell({ name: "prep@test", email: "prep@test", fullName: "Préparateur Test", role: "preparateur" });
    const hrefs = navHrefs();
    expect(hrefs).toContain("/today");
    expect(hrefs).toContain("/preparation");
    expect(hrefs).toContain("/codes-barres");
    expect(hrefs).toContain("/stock");
    expect(hrefs).not.toContain("/planning");
    expect(hrefs).not.toContain("/livreurs");
    expect(hrefs).not.toContain("/caisses");
    expect(screen.getAllByText("Opérationnel").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ressources")).not.toBeInTheDocument();
    expect(screen.queryByText("Caisse Tournées")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bureau" })).toHaveAttribute("href", deskRoot());
  });

  it("donne au responsable les parcours opérationnels groupés", () => {
    renderShell(manager);
    const hrefs = navHrefs();
    expect(hrefs).toEqual(expect.arrayContaining(["/today", "/preparation", "/codes-barres", "/planning", "/deliveries", "/livreurs", "/vehicules", "/stock", "/cashier", "/caisses"]));
    expect(screen.getAllByText("Opérationnel").length).toBeGreaterThan(0);
    expect(screen.getByText("Ressources")).toBeInTheDocument();
    expect(screen.getByText("Ventes")).toBeInTheDocument();
    expect(screen.getByText("Stock")).toBeInTheDocument();
    expect(screen.queryByText("Achats")).not.toBeInTheDocument();
    expect(screen.queryByText("Caisse")).not.toBeInTheDocument();
    expect(hrefs.indexOf("/cashier")).toBeGreaterThan(hrefs.indexOf("/deliveries"));
    expect(screen.queryByText("Console")).not.toBeInTheDocument();
  });

  it("garde les compteurs visibles quand une section est repliée", async () => {
    const user = userEvent.setup();
    dashboardState.data = { message: dashboard };
    renderShell(manager);
    const stock = screen.getByRole("button", { name: /^Stock/ });
    expect(stock).toHaveTextContent(/^Stock$/);
    await user.click(stock);
    expect(stock).toHaveAttribute("aria-expanded", "false");
    // Préparation (4) + Stock véhicules (1), cumulés sur la section repliée.
    expect(stock).toHaveTextContent("Stock5");
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
    expect(hrefs).not.toContain("/codes-barres");
    expect(hrefs).not.toContain("/stock");
    expect(screen.getAllByText("Opérationnel").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ventes")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bureau" })).toHaveAttribute("href", deskRoot());
  });

  it("permet de fermer puis de rouvrir le menu", async () => {
    const user = userEvent.setup();
    renderShell(manager);
    await user.click(screen.getByRole("button", { name: "Réduire le menu" }));
    expect(screen.getByRole("button", { name: "Déplier le menu" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Déplier le menu" }));
    expect(screen.getByRole("button", { name: "Réduire le menu" })).toBeInTheDocument();
  });

  it("replie et déplie une section du menu", async () => {
    const user = userEvent.setup();
    renderShell(manager);
    expect(navHrefs()).toContain("/receptions");
    await user.click(screen.getByRole("button", { name: "Stock" }));
    expect(navHrefs()).not.toContain("/receptions");
    expect(navHrefs()).toContain("/deliveries");
    await user.click(screen.getByRole("button", { name: "Stock" }));
    expect(navHrefs()).toContain("/receptions");
  });

  it("affiche les compteurs de file et l’encart d’anomalies", async () => {
    dashboardState.data = { message: dashboard };
    const user = userEvent.setup();
    renderShell(manager);
    expect(within(screen.getByRole("link", { name: /^préparation\s*\d*$/i })).getByText("4")).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: /planification/i })).getByText("5")).toBeInTheDocument();
    expect(screen.getByText("1 anomalie")).toBeInTheDocument();
    expect(screen.getByText("Préparation en retard")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Masquer les anomalies" }));
    expect(screen.queryByText("1 anomalie")).not.toBeInTheDocument();
  });

  it("affiche l’id de la pick list dans le fil d’Ariane", () => {
    renderShell(manager, "/preparation?pick_lists=PL-42");
    const trail = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(within(trail).getByText("PL-42")).toBeInTheDocument();
    expect(within(trail).getByRole("link", { name: /^préparation\s*\d*$/i })).toHaveAttribute("href", "/preparation");
  });

  it("affiche un lien Bureau vers le desk pour les rôles internes", () => {
    renderShell(manager);
    const desk = screen.getByRole("link", { name: "Bureau" });
    expect(desk).toHaveAttribute("href", deskRoot());
  });

  it("n'affiche pas le lien Bureau pour un livreur", () => {
    renderShell({ name: "driver@test", email: "driver@test", fullName: "Livreur Test", role: "livreur" });
    expect(screen.queryByRole("link", { name: "Bureau" })).not.toBeInTheDocument();
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
