import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { vi } from "vitest"
import { AccountHub } from "@/features/account/AccountHub"
import { AccountPage } from "@/features/account/AccountPage"
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

vi.mock("@/shared/api", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api")>("@/shared/api")
  return {
    ...actual,
    useGpsActions: () => ({ update: vi.fn(), saving: false }),
    useCommunes: () => ({ data: { message: { items: [] } }, isLoading: false, error: null }),
    useProfileActions: () => ({ update: vi.fn(), saving: false }),
    useCustomerImageActions: () => ({ update: vi.fn(), saving: false }),
    useNotificationPreferences: () => ({
      data: {
        message: {
          categories: { commandes: 1, livraisons: 1, paiements: 1, demandes: 1, promotions: 0 },
        },
      },
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    }),
    useNotificationPreferenceActions: () => ({ update: vi.fn(), saving: false }),
  }
})

const context: PortalContext = {
  user: { name: "client@example.com", fullName: "Amine Melizi", email: "client@example.com" },
  customer: { name: "CUST-1", customerName: "Magasin Test" },
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

describe("hub compte mobile", () => {
  beforeEach(() => {
    stubMatchMedia(true)
    logout.mockReset()
    goToLanding.mockReset()
    pwa.canInstall = true
    pwa.install.mockReset()
  })

  afterEach(() => {
    stubMatchMedia(false)
  })

  it("affiche l’identité réelle et les accès du portail", () => {
    render(
      <MemoryRouter>
        <AccountHub context={context} />
      </MemoryRouter>,
    )
    expect(screen.getByText("Magasin Test")).toBeVisible()
    expect(screen.getByText("Amine Melizi")).toBeVisible()
    expect(screen.getByText("Portail client")).toBeVisible()
    expect(screen.getByRole("link", { name: /Mon compte/ })).toHaveAttribute("href", "/account?tab=profile")
    expect(screen.getByText("Coordonnées et préférences")).toBeVisible()
    expect(screen.getByRole("link", { name: /Notifications/ })).toHaveAttribute("href", "/account?tab=notifications")
    expect(screen.getByRole("link", { name: /Mes commandes/ })).toHaveAttribute("href", "/orders")
    expect(screen.getByText("Historique et suivi")).toBeVisible()
    expect(screen.getByRole("link", { name: /Bons de livraison/ })).toHaveAttribute("href", "/deliveries")
    expect(screen.getByRole("link", { name: /Paiements/ })).toHaveAttribute("href", "/payments")
    expect(screen.getByRole("link", { name: /Demandes hors catalogue/ })).toHaveAttribute("href", "/requests")
    expect(screen.getByRole("button", { name: "Installer" })).toBeVisible()
    expect(screen.getByText("Ajouter à l’écran d’accueil")).toBeVisible()
    expect(screen.getByRole("heading", { name: "Assistance" })).toBeVisible()
    expect(screen.queryByText("Changer de client")).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Accueil" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Catalogue" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Promotions" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Panier" })).not.toBeInTheDocument()
  })

  it("déconnecte sans bouton plein rouge", async () => {
    logout.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AccountHub context={context} />
      </MemoryRouter>,
    )
    const button = screen.getByRole("button", { name: "Déconnexion" })
    expect(button).toHaveClass("text-destructive")
    expect(button).not.toHaveClass("bg-destructive")
    await user.click(button)
    await waitFor(() => expect(logout).toHaveBeenCalled())
    expect(goToLanding).toHaveBeenCalled()
  })

  it("propose Installer tant que l’application n’est pas installée", async () => {
    const user = userEvent.setup()
    pwa.install.mockResolvedValue("accepted")
    render(
      <MemoryRouter>
        <AccountHub context={context} />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole("button", { name: "Installer" }))
    expect(pwa.install).toHaveBeenCalled()
  })

  it("masque Installer une fois l’application installée", () => {
    pwa.canInstall = false
    render(
      <MemoryRouter>
        <AccountHub context={context} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole("button", { name: "Installer" })).not.toBeInTheDocument()
  })

  it("ouvre le hub sur /account et le profil via l’onglet", () => {
    stubMatchMedia(true)
    render(
      <MemoryRouter initialEntries={["/account"]}>
        <AccountPage context={context} />
      </MemoryRouter>,
    )
    expect(screen.getByRole("link", { name: /Mon compte/ })).toBeVisible()
    expect(screen.queryByRole("tab", { name: "Profil" })).not.toBeInTheDocument()
  })
})
