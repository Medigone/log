import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { usePortalPwa } from "@/pwa/usePortalPwa"

export function InstallAppBannerView({
  show,
  isIos,
  canPrompt,
  installing,
  onInstall,
  onDismiss,
}: {
  show: boolean
  isIos: boolean
  canPrompt: boolean
  installing?: boolean
  onInstall: () => void
  onDismiss: () => void
}) {
  if (!show) return null
  const showInstall = !isIos || canPrompt
  return (
    <Card size="sm" data-testid="install-app-banner">
      <CardContent className="flex flex-row flex-nowrap items-center gap-3">
        <p className="min-w-0 flex-1 truncate font-heading text-sm font-medium leading-none">
          Installer l’application
        </p>
        {showInstall ? (
          <Button type="button" size="sm" className="shrink-0" onClick={onInstall} disabled={installing || !canPrompt}>
            Installer
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" aria-label="Plus tard" onClick={onDismiss}>
          <X />
        </Button>
      </CardContent>
    </Card>
  )
}

export function InstallAppBanner() {
  const pwa = usePortalPwa()
  return (
    <InstallAppBannerView
      show={pwa.showBanner}
      isIos={pwa.isIos}
      canPrompt={pwa.canPrompt}
      installing={pwa.installing}
      onInstall={() => void pwa.install()}
      onDismiss={pwa.dismiss}
    />
  )
}
