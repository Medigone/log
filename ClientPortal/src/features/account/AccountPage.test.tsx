import type { ReactNode } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { vi } from "vitest"
import { AccountPage } from "@/features/account/AccountPage"
import type { PortalContext } from "@/shared/types"

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  updateProfile: vi.fn(),
  updateImage: vi.fn(),
}))

vi.mock("@/shared/api", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api")>("@/shared/api")
  return {
    ...actual,
    useGpsActions: () => ({ update: mocks.update, saving: false }),
    useCommunes: () => ({
      data: {
        message: {
          items: [
            { name: "COM-1", nom: "Alger Centre", wilaya: "Alger", wilayaName: "Alger" },
            { name: "COM-2", nom: "Oran", wilaya: "Oran", wilayaName: "Oran" },
          ],
        },
      },
      isLoading: false,
      error: null,
    }),
    useProfileActions: () => ({ update: mocks.updateProfile, saving: false }),
    useCustomerImageActions: () => ({ update: mocks.updateImage, saving: false }),
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
    usePushConfig: () => ({ data: { message: { vapidPublicKey: "key", enabled: true } }, isLoading: false, error: null }),
    usePushSubscriptionActions: () => ({ subscribe: vi.fn(), unsubscribe: vi.fn(), saving: false }),
  }
})

vi.mock("@/pwa/usePortalPwa", () => ({
  usePortalPwa: () => ({
    showBanner: false,
    isIos: false,
    isStandalone: false,
    canPrompt: false,
    pushStatus: "unsupported",
    pushError: "",
    enablingPush: false,
    enablePush: vi.fn(),
    install: vi.fn(),
    dismiss: vi.fn(),
    installing: false,
  }),
}))

vi.mock("leaflet", () => ({ divIcon: (options: unknown) => options }))
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="map">
      <button type="button" onClick={() => (window as Window & { __pickMapPin?: () => void }).__pickMapPin?.()}>
        Poser un pin
      </button>
      {children}
    </div>
  ),
  Marker: ({ position }: { position: [number, number] }) => (
    <div data-testid="marker" data-lat={position[0]} data-lng={position[1]} />
  ),
  TileLayer: () => <div data-testid="tiles" />,
  useMap: () => ({ setView: vi.fn() }),
  useMapEvents: (handlers: { click: (event: { latlng: { lat: number; lng: number } }) => void }) => {
    ;(window as Window & { __pickMapPin?: () => void }).__pickMapPin = () =>
      handlers.click({ latlng: { lat: 36.7, lng: 3.05 } })
    return null
  },
}))

const context: PortalContext = {
  user: { name: "client@example.com", fullName: "Client", email: "client@example.com" },
  customer: { name: "CUST-1", customerName: "Client test" },
  company: "IntraPro",
  currency: "DZD",
  gpsConfigured: false,
  mustChangePassword: false,
  balances: [],
}

function renderAccount(portalContext = context) {
  return render(
    <MemoryRouter initialEntries={["/account?tab=localisation"]}>
      <AccountPage context={portalContext} onUpdated={vi.fn()} />
    </MemoryRouter>,
  )
}

describe("onglet Localisation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.update.mockResolvedValue({ success: true, gpsConfigured: true })
    mocks.updateProfile.mockResolvedValue({ success: true })
  })

  it("enregistre une position GPS précise depuis l'appareil", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: 36.75, longitude: 3.05, accuracy: 20 } } as GeolocationPosition),
    )
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } })
    const user = userEvent.setup()
    renderAccount()

    await user.click(screen.getByRole("button", { name: "Enregistrer ma position actuelle" }))
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({
        source: "device",
        latitude: 36.75,
        longitude: 3.05,
        accuracy: 20,
      }),
    )
  })

  it("refuse un GPS trop imprécis", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: 36.75, longitude: 3.05, accuracy: 80 } } as GeolocationPosition),
    )
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } })
    const user = userEvent.setup()
    renderAccount()

    await user.click(screen.getByRole("button", { name: "Enregistrer ma position actuelle" }))
    expect(await screen.findByText(/Précision insuffisante/)).toBeVisible()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("enregistre un pin posé sur la carte sans règle de 50 m", async () => {
    const user = userEvent.setup()
    renderAccount()

    await user.click(screen.getByRole("button", { name: "Localiser sur la carte" }))
    await user.click(screen.getByRole("button", { name: "Poser un pin" }))
    expect(screen.getByTestId("marker")).toHaveAttribute("data-lat", "36.7")
    await user.click(screen.getByRole("button", { name: "Enregistrer la position de la carte" }))
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({
        source: "map",
        latitude: 36.7,
        longitude: 3.05,
      }),
    )
  })
})

describe("onglet Profil", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateProfile.mockResolvedValue({ success: true })
  })

  it("met à jour la wilaya depuis la commune et n'autorise pas le code client", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={["/account"]}>
        <AccountPage context={context} onUpdated={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText("Code client")).toBeDisabled()
    expect(screen.getByText("Client")).toBeVisible()
    expect(screen.queryByText("Compte portail : client@example.com")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Photo du client")).toBeEnabled()
    expect(screen.getByRole("tab", { name: "Notifications" })).toBeVisible()
    expect(screen.queryByRole("tab", { name: "Solde comptable" })).not.toBeInTheDocument()
    await user.clear(screen.getByLabelText("Utilisateur"))
    await user.type(screen.getByLabelText("Utilisateur"), "Amine Test")
    await user.type(screen.getByLabelText("E-mail client"), "client@test.com")
    await user.type(screen.getByLabelText("Téléphone"), "0550000000")
    await user.click(screen.getByRole("combobox", { name: "Commune" }))
    await user.click(screen.getByRole("button", { name: /Alger Centre/ }))
    expect(screen.getByLabelText("Wilaya")).toHaveValue("Alger")
    await user.click(screen.getByRole("button", { name: "Enregistrer le profil" }))
    await waitFor(() =>
      expect(mocks.updateProfile).toHaveBeenCalledWith({
        fullName: "Amine Test",
        email: "client@test.com",
        phone: "0550000000",
        commune: "COM-1",
      }),
    )
  })

  it("envoie la photo sur la fiche client", async () => {
    mocks.updateImage.mockResolvedValue({ success: true, customer: { image: "/files/shop.jpg" } })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={["/account"]}>
        <AccountPage context={context} onUpdated={vi.fn()} />
      </MemoryRouter>,
    )
    const file = new File(["photo"], "shop.jpg", { type: "image/jpeg" })
    await user.upload(screen.getByLabelText("Photo du client"), file)
    await waitFor(() => expect(mocks.updateImage).toHaveBeenCalled())
    expect(mocks.updateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "shop.jpg",
        imageData: expect.stringMatching(/^data:image\/jpeg;base64,/),
      }),
    )
  })
})
