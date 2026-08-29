import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { vi } from "vitest"
import { MobileBottomNav } from "@/layouts/MobileBottomNav"
import { SidebarProvider } from "@/components/ui/sidebar"
import type { PortalContext, StorefrontPayload } from "@/shared/types"

const mocks = vi.hoisted(() => ({
  storefront: {
    data: { message: null as StorefrontPayload | null },
    isLoading: false,
    error: null as Error | null,
  },
  logout: vi.fn(),
}))

vi.mock("@/shared/api", () => ({
  useStorefront: () => mocks.storefront,
}))

vi.mock("frappe-react-sdk", () => ({
  useFrappeAuth: () => ({ logout: mocks.logout }),
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

function stubMobileMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

function renderNav(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarProvider>
        <MobileBottomNav context={context} />
        <Routes>
          <Route path="/" element={<div>Accueil page</div>} />
          <Route path="/orders" element={<div>Page commandes</div>} />
        </Routes>
      </SidebarProvider>
    </MemoryRouter>,
  )
}

describe("MobileBottomNav", () => {
  beforeEach(() => {
    stubMobileMatchMedia()
    mocks.storefront.isLoading = false
    mocks.storefront.data = {
      message: {
        hero: { title: "Promo", cta: { type: "catalog", label: "Voir" } },
        banners: [],
        categories: [{ name: "Boissons" }, { name: "Épicerie" }],
        rails: [],
      },
    }
  })

  it("affiche les onglets boutique et le compte tout à droite", () => {
    renderNav()
    const nav = screen.getByRole("navigation", { name: "Navigation boutique" })
    const boutique = screen.getByRole("group", { name: "Boutique" })
    expect(within(boutique).getByRole("button", { name: "Accueil" })).toHaveAttribute("href", "/")
    expect(within(boutique).getByRole("button", { name: "Accueil" })).toHaveAttribute("aria-current", "page")
    expect(within(boutique).getByRole("button", { name: "Offres" })).toHaveAttribute("href", "/?view=offres")
    expect(within(boutique).getByRole("button", { name: "Offres" })).not.toHaveAttribute("aria-current")
    expect(within(boutique).getByRole("button", { name: "Catalogue" })).toHaveAttribute("href", "/?view=catalog")
    expect(within(boutique).getByRole("button", { name: "Catalogue" })).not.toHaveAttribute("aria-current")
    expect(within(boutique).getByRole("button", { name: "Rayons" })).toBeVisible()
    expect(within(boutique).queryByRole("button", { name: /Client test/ })).not.toBeInTheDocument()
    const account = screen.getByRole("button", { name: "Client test" })
    expect(nav.lastElementChild).toContainElement(account)
    expect(boutique.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("ouvre les rayons dans une feuille et navigue vers un rayon", async () => {
    const user = userEvent.setup()
    renderNav()
    await user.click(screen.getByRole("button", { name: "Rayons" }))
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible())
    expect(screen.getByRole("heading", { name: "Rayons" })).toBeVisible()
    const drinks = screen.getByRole("link", { name: "Boissons" })
    expect(drinks).toHaveAttribute("href", "/?group=Boissons")
    await user.click(drinks)
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("ouvre le suivi de compte depuis le bouton de droite", async () => {
    const user = userEvent.setup()
    renderNav()
    const trigger = screen.getByRole("button", { name: "Client test" })
    trigger.focus()
    await user.keyboard("{Enter}")
    await waitFor(() => expect(screen.getByRole("menuitem", { name: /Commandes/ })).toBeVisible())
    expect(screen.getByRole("menuitem", { name: /Bons de livraison/ })).toBeVisible()
    expect(screen.getByRole("menuitem", { name: /Paiements/ })).toBeVisible()
    expect(screen.getByRole("menuitem", { name: "Mon compte" })).toBeVisible()
    await user.click(screen.getByRole("menuitem", { name: /Commandes/ }))
    expect(screen.getByText("Page commandes")).toBeVisible()
  })
})
