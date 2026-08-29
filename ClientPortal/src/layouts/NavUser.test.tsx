import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { vi } from "vitest"
import { NavUser } from "@/layouts/NavUser"
import { SidebarProvider } from "@/components/ui/sidebar"
import type { PortalContext } from "@/shared/types"

const logout = vi.fn()

vi.mock("frappe-react-sdk", () => ({
  useFrappeAuth: () => ({ logout }),
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
          <Route path="/orders" element={<div>Page commandes</div>} />
          <Route path="/deliveries" element={<div>Page livraisons</div>} />
          <Route path="/payments" element={<div>Page paiements</div>} />
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
  })

  it("ouvre le suivi de compte avec commandes, livraisons, paiements et profil", async () => {
    const user = userEvent.setup()
    renderNav()
    const trigger = screen.getByRole("button", { name: /Client test/ })
    trigger.focus()
    await user.keyboard("{Enter}")
    await waitFor(() => expect(screen.getByRole("menuitem", { name: /Commandes/ })).toBeVisible())
    expect(screen.getByRole("menuitem", { name: /Commandes/ })).toHaveTextContent("1")
    expect(screen.getByRole("menuitem", { name: /Bons de livraison/ })).toBeVisible()
    expect(screen.getByRole("menuitem", { name: /Paiements/ })).toBeVisible()
    expect(screen.queryByText(/150/)).not.toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Mon compte" })).toBeVisible()
    expect(screen.getByRole("menuitem", { name: "Déconnexion" })).toBeVisible()
    expect(screen.getAllByText("Client")).toHaveLength(2)
    expect(screen.queryByText("client@example.com")).not.toBeInTheDocument()
    expect(document.querySelector("[data-slot=avatar-fallback]")).toHaveClass("bg-black", "text-white")
  })

  it("navigue vers les commandes depuis le menu", async () => {
    const user = userEvent.setup()
    renderNav()
    const trigger = screen.getByRole("button", { name: /Client test/ })
    trigger.focus()
    await user.keyboard("{Enter}")
    await waitFor(() => expect(screen.getByRole("menuitem", { name: /Commandes/ })).toBeVisible())
    await user.click(screen.getByRole("menuitem", { name: /Commandes/ }))
    expect(screen.getByText("Page commandes")).toBeVisible()
  })

  it("en variante barre n'affiche que l'avatar et ouvre le même suivi de compte", async () => {
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
    await waitFor(() => expect(screen.getByRole("menuitem", { name: /Commandes/ })).toBeVisible())
    expect(screen.getByText("Client")).toBeVisible()
    expect(screen.getByRole("menuitem", { name: "Mon compte" })).toBeVisible()
  })
})
