import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { vi } from "vitest"
import { AppSidebar } from "@/layouts/AppSidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { PortalContext, StorefrontPayload } from "@/shared/types"

const mocks = vi.hoisted(() => ({
  storefront: {
    data: { message: null as StorefrontPayload | null },
    isLoading: false,
    error: null as Error | null,
  },
}))

vi.mock("@/shared/api", () => ({
  useStorefront: () => mocks.storefront,
}))

vi.mock("@/layouts/NavUser", () => ({
  NavUser: () => <div>Compte</div>,
}))

const context: PortalContext = {
  user: { name: "client@example.com", fullName: "Client", email: "client@example.com" },
  customer: { name: "CUST-1", customerName: "Client test" },
  company: "IntraPro",
  currency: "DZD",
  gpsConfigured: true,
  mustChangePassword: false,
  balances: [],
}

function stubMatchMedia(mobile = false) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: mobile && query.includes("max-width: 767px"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

function renderSidebar(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar context={context} />
        </SidebarProvider>
      </TooltipProvider>
    </MemoryRouter>,
  )
}

describe("AppSidebar boutique", () => {
  beforeEach(() => {
    stubMatchMedia()
    mocks.storefront.isLoading = false
    mocks.storefront.data = {
      message: {
        banners: [{ title: "Promo", campaign: "CAMP-1", cta: { type: "catalog", label: "Voir" } }],
        categories: [{ name: "Boissons" }, { name: "Épicerie" }],
        rails: [
          {
            campaign: "CAMP-1",
            kind: "campaign",
            title: "Offres",
            cta: { type: "catalog", label: "Voir" },
            items: [],
          },
        ],
      },
    }
  })

  it("affiche le menu portail sans l’arborescence des rayons", () => {
    renderSidebar()
    expect(screen.getByRole("link", { name: "Accueil" })).toHaveAttribute("href", "/")
    expect(screen.queryByRole("link", { name: "Catalogue" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Offres" })).toHaveAttribute("href", "/?view=offres")
    expect(screen.getByRole("link", { name: "Demander un article" })).toHaveAttribute("href", "/requests")
    expect(screen.getByRole("link", { name: "Mes commandes" })).toHaveAttribute("href", "/orders")
    expect(screen.getByRole("link", { name: "Bons de livraison" })).toHaveAttribute("href", "/deliveries")
    expect(screen.getByRole("link", { name: "Paiements" })).toHaveAttribute("href", "/payments")
    expect(screen.queryByRole("link", { name: "Boissons" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Épicerie" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Panier" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Mon compte" })).not.toBeInTheDocument()
    expect(screen.getByText("1")).toBeVisible()
  })

  it("marque l'accueil comme actif lorsqu’un rayon est filtré", () => {
    renderSidebar("/?group=Boissons")
    expect(screen.getByRole("link", { name: "Accueil" })).toHaveAttribute("data-active")
    expect(screen.getByRole("link", { name: "Offres" })).not.toHaveAttribute("data-active")
  })

  it("monte sans contenu visible tant que la feuille mobile est fermée", () => {
    stubMatchMedia(true)
    renderSidebar()
    expect(screen.queryByRole("link", { name: "Accueil" })).not.toBeInTheDocument()
  })
})
