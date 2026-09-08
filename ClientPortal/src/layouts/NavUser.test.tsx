import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { vi } from "vitest"
import { NavUser } from "@/layouts/NavUser"
import { SidebarProvider } from "@/components/ui/sidebar"
import type { PortalContext } from "@/shared/types"

const { logout, goToLanding, pwa } = vi.hoisted(() => ({
  logout: vi.fn(),
  goToLanding: vi.fn(),
  pwa: {
    canInstall: true,
    isIos: false,
    canPrompt: true,
    installing: false,
    install: vi.fn(),
  },
}))

vi.mock("frappe-react-sdk", () => ({
  useFrappeAuth: () => ({ logout }),
}))

vi.mock("@/shared/session", () => ({
  LANDING_HREF: "/",
  goToLanding,
}))

vi.mock("@/pwa/usePortalPwa", () => ({
  usePortalPwa: () => pwa,
}))

const context: PortalContext = {
  user: { name: "client@example.com", fullName: "Client", email: "client@example.com" },
  customer: { name: "CUST-1", customerName: "Client test" },
  company: "IntraPro",
  currency: "DZD",
  gpsConfigured: true,
  mustChangePassword: false,
  balances: [{ company: "IntraPro", currency: "DZD", amount: 150 }],
  inProgressOrders: ["SAL-ORD-1"],
}

function stubMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

function renderNav() {
  return render(
    <MemoryRouter>
      <SidebarProvider>
        <NavUser context={context} />
        <Routes>
          <Route path="/" element={<div>Accueil</div>} />
          <Route path="/account" element={<div>Page compte</div>} />
        </Routes>
      </SidebarProvider>
    </MemoryRouter>,
  )
}

describe("NavUser suivi de compte", () => {
  beforeEach(() => {
    stubMatchMedia()
    logout.mockReset()
    goToLanding.mockReset()
    pwa.canInstall = true
    pwa.install.mockReset()
  })

  it("n’affiche que le profil, mon compte et la déconnexion", async () => {
    const user = userEvent.setup()
    renderNav()
    const trigger = screen.getByRole("button", { name: /Client test/ })
    trigger.focus()
    await user.keyboard("{Enter}")
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Mon compte" })).toBeVisible())
    expect(screen.getByRole("menuitem", { name: "Installer" })).toBeVisible()
    expect(screen.queryByRole("menuitem", { name: /Commandes/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: /Bons de livraison/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: /Paiements/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/150/)).not.toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Déconnexion" })).toBeVisible()
    expect(screen.getAllByText("Client")).toHaveLength(2)
    expect(screen.queryByText("client@example.com")).not.toBeInTheDocument()
    expect(document.querySelector("[data-slot=avatar-fallback]")).toHaveClass("bg-black", "text-white")
  })

  it("navigue vers le compte depuis le menu", async () => {
    const user = userEvent.setup()
    renderNav()
    const trigger = screen.getByRole("button", { name: /Client test/ })
    trigger.focus()
    await user.keyboard("{Enter}")
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Mon compte" })).toBeVisible())
    await user.click(screen.getByRole("menuitem", { name: "Mon compte" }))
    expect(screen.getByText("Page compte")).toBeVisible()
  })

  it("en variante barre n’affiche que l’avatar et ouvre le même menu", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SidebarProvider>
          <NavUser context={context} variant="bar" />
        </SidebarProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByText("client@example.com")).not.toBeInTheDocument()
    const trigger = screen.getByRole("button", { name: "Client test" })
    trigger.focus()
    await user.keyboard("{Enter}")
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Mon compte" })).toBeVisible())
    expect(screen.getByText("Client")).toBeVisible()
    expect(screen.getByRole("menuitem", { name: "Déconnexion" })).toBeVisible()
  })

  it("masque Installer quand l’application est déjà installée", async () => {
    pwa.canInstall = false
    const user = userEvent.setup()
    renderNav()
    const trigger = screen.getByRole("button", { name: /Client test/ })
    trigger.focus()
    await user.keyboard("{Enter}")
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Mon compte" })).toBeVisible())
    expect(screen.queryByRole("menuitem", { name: "Installer" })).not.toBeInTheDocument()
  })

  it("installe l’application depuis le menu compte", async () => {
    const user = userEvent.setup()
    pwa.install.mockResolvedValue("accepted")
    renderNav()
    const trigger = screen.getByRole("button", { name: /Client test/ })
    trigger.focus()
    await user.keyboard("{Enter}")
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Installer" })).toBeVisible())
    await user.click(screen.getByRole("menuitem", { name: "Installer" }))
    expect(pwa.install).toHaveBeenCalled()
  })

  it("envoie vers la landing après déconnexion", async () => {
    logout.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderNav()
    const trigger = screen.getByRole("button", { name: /Client test/ })
    trigger.focus()
    await user.keyboard("{Enter}")
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Déconnexion" })).toBeVisible())
    await user.click(screen.getByRole("menuitem", { name: "Déconnexion" }))
    await waitFor(() => expect(logout).toHaveBeenCalled())
    expect(goToLanding).toHaveBeenCalled()
  })
})
