import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { DesktopShell } from "@/layouts/DesktopShell";

vi.mock("frappe-react-sdk", () => ({ useFrappeAuth: () => ({ logout: vi.fn() }) }));

const manager = { name: "manager@test", email: "manager@test", fullName: "Responsable Test", role: "responsable" as const };

describe("DesktopShell", () => {
  it("n'affiche au préparateur que son espace autorisé", () => {
    render(<MemoryRouter><DesktopShell user={{ name: "prep@test", email: "prep@test", fullName: "Préparateur Test", role: "preparateur" }}><p>Accueil préparation</p></DesktopShell></MemoryRouter>);
    expect(screen.getByRole("link", { name: /préparation/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /planification/i })).not.toBeInTheDocument();
  });
  it("donne au responsable les trois parcours", () => {
    render(<MemoryRouter><DesktopShell user={manager}><p>Accueil responsable</p></DesktopShell></MemoryRouter>);
    expect(screen.getByRole("link", { name: /préparation/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /planification/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /livraisons/i })).toBeInTheDocument();
  });
  it("permet de fermer puis de rouvrir le menu", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><DesktopShell user={manager}><p>Accueil</p></DesktopShell></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "Réduire le menu" }));
    expect(screen.getByRole("button", { name: "Déplier le menu" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Déplier le menu" }));
    expect(screen.getByRole("button", { name: "Réduire le menu" })).toBeInTheDocument();
  });
});
