import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"
import { InstallAppBannerView } from "@/pwa/InstallAppBanner"

describe("bandeau d'installation PWA", () => {
  it("affiche le bouton Installer hors mode application", () => {
    render(
      <InstallAppBannerView
        show
        isIos={false}
        canPrompt
        onInstall={() => undefined}
        onDismiss={() => undefined}
      />,
    )
    expect(screen.getByTestId("install-app-banner")).toBeVisible()
    expect(screen.getByRole("button", { name: "Installer" })).toBeEnabled()
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

  it("affiche les consignes iOS à la place du prompt natif", () => {
    render(
      <InstallAppBannerView show isIos canPrompt={false} onInstall={() => undefined} onDismiss={() => undefined} />,
    )
    expect(screen.getByText("Installer l’application")).toBeVisible()
    expect(screen.getByText(/Sur l’écran d’accueil/)).toBeVisible()
    expect(screen.queryByRole("button", { name: "Installer" })).not.toBeInTheDocument()
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
