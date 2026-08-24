import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DesktopShell } from "@/layouts/DesktopShell";

vi.mock("frappe-react-sdk", () => ({ useFrappeAuth: () => ({ logout: vi.fn() }) }));

describe("DesktopShell", () => {
  it("n'affiche au préparateur que son espace autorisé", () => {
    render(<MemoryRouter><DesktopShell user={{ name: "prep@test", email: "prep@test", fullName: "Préparateur Test", role: "preparateur" }}><p>Accueil préparation</p></DesktopShell></MemoryRouter>);
    expect(screen.getByRole("link", { name: /préparation/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /planification/i })).not.toBeInTheDocument();
  });
  it("donne au responsable les trois parcours", () => {
    render(<MemoryRouter><DesktopShell user={{ name: "manager@test", email: "manager@test", fullName: "Responsable Test", role: "responsable" }}><p>Accueil responsable</p></DesktopShell></MemoryRouter>);
    expect(screen.getByRole("link", { name: /préparation/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /planification/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /livraisons/i })).toBeInTheDocument();
  });
});
