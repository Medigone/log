import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"
import { InstallAppBannerView } from "@/pwa/InstallAppBanner"

describe("bandeau d'installation PWA", () => {
  it("affiche le titre et le bouton Installer sur une ligne", () => {
    render(
      <InstallAppBannerView
        show
        isIos={false}
        canPrompt
        onInstall={() => undefined}
        onDismiss={() => undefined}
      />,
    )
    const banner = screen.getByTestId("install-app-banner")
    expect(banner).toBeVisible()
    expect(screen.getByText("Installer l’application")).toBeVisible()
    expect(screen.getByRole("button", { name: "Installer" })).toBeEnabled()
    expect(banner.querySelector("[data-slot=card-content]")).toHaveClass("flex-row", "items-center")
    expect(screen.queryByText(/écran d’accueil/)).not.toBeInTheDocument()
    expect(screen.queryByText(/notifications/)).not.toBeInTheDocument()
  })

  it("masque le bandeau une fois installé ou refusé", () => {
    const { rerender } = render(
      <InstallAppBannerView
        show={false}
        isIos={false}
        canPrompt
        onInstall={() => undefined}
        onDismiss={() => undefined}
      />,
    )
    expect(screen.queryByTestId("install-app-banner")).not.toBeInTheDocument()
    rerender(
      <InstallAppBannerView
        show
        isIos={false}
        canPrompt
        onInstall={() => undefined}
        onDismiss={() => undefined}
      />,
    )
    expect(screen.getByTestId("install-app-banner")).toBeVisible()
  })

  it("masque le bouton Installer sur iOS sans prompt natif", () => {
    render(
      <InstallAppBannerView show isIos canPrompt={false} onInstall={() => undefined} onDismiss={() => undefined} />,
    )
    expect(screen.getByText("Installer l’application")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Installer" })).not.toBeInTheDocument()
    expect(screen.queryByText(/Sur l’écran d’accueil/)).not.toBeInTheDocument()
  })

  it("ferme le bandeau via Plus tard", async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    render(
      <InstallAppBannerView show isIos={false} canPrompt onInstall={() => undefined} onDismiss={onDismiss} />,
    )
    await user.click(screen.getByRole("button", { name: "Plus tard" }))
    expect(onDismiss).toHaveBeenCalled()
  })
})
