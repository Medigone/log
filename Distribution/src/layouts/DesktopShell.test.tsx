import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { DesktopShell } from "@/layouts/DesktopShell";

vi.mock("frappe-react-sdk", () => ({ useFrappeAuth: () => ({ logout: vi.fn() }) }));

const manager = { name: "manager@test", email: "manager@test", fullName: "Responsable Test", role: "responsable" as const };

function renderShell(user: Parameters<typeof DesktopShell>[0]["user"]) {
  return render(
    <MemoryRouter initialEntries={["/today"]}>
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
  it("n'affiche au préparateur que son espace autorisé", () => {
    renderShell({ name: "prep@test", email: "prep@test", fullName: "Préparateur Test", role: "preparateur" });
    const hrefs = navHrefs();
    expect(hrefs).toContain("/today");
    expect(hrefs).toContain("/preparation");
    expect(hrefs).toContain("/stock");
    expect(hrefs).not.toContain("/planning");
    expect(hrefs).not.toContain("/livreurs");
    expect(hrefs).not.toContain("/caisses");
  });
  it("donne au responsable les parcours opérationnels", () => {
    renderShell(manager);
    const hrefs = navHrefs();
    expect(hrefs).toEqual(expect.arrayContaining(["/today", "/preparation", "/planning", "/deliveries", "/livreurs", "/vehicules", "/stock", "/cashier", "/caisses"]));
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
    expect(hrefs).toContain("/caisses");
    expect(hrefs).not.toContain("/planning");
    expect(hrefs).not.toContain("/livreurs");
    expect(hrefs).not.toContain("/preparation");
    expect(hrefs).not.toContain("/stock");
  });
  it("permet de fermer puis de rouvrir le menu", async () => {
    const user = userEvent.setup();
    renderShell(manager);
    await user.click(screen.getByRole("button", { name: "Réduire le menu" }));
    expect(screen.getByRole("button", { name: "Déplier le menu" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Déplier le menu" }));
    expect(screen.getByRole("button", { name: "Réduire le menu" })).toBeInTheDocument();
  });
});
