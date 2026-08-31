import { Download, Share, Smartphone, X } from "lucide-react"
import { BrandLogo } from "@/components/BrandLogo"
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
  return (
    <Card size="sm" data-testid="install-app-banner">
      <CardContent className="flex items-start gap-3">
        <BrandLogo compact className="mt-0.5 size-10 shrink-0" />
        <div className="grid min-w-0 flex-1 gap-2">
          <div className="grid gap-0.5">
            <p className="font-heading text-base font-medium leading-snug">Installer l’application</p>
            <p className="text-sm text-muted-foreground">
              Ajoutez IntraPro à l’écran d’accueil pour recevoir les notifications sur votre téléphone.
            </p>
          </div>
          {isIos && !canPrompt ? (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Share className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Appuyez sur <strong className="font-medium text-foreground">Partager</strong>, puis sur{" "}
                <strong className="font-medium text-foreground">Sur l’écran d’accueil</strong>.
              </span>
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {isIos && !canPrompt ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Smartphone className="size-3.5" aria-hidden />
                Disponible sur iPhone et iPad
              </span>
            ) : (
              <Button type="button" onClick={onInstall} disabled={installing || !canPrompt}>
                <Download data-icon="inline-start" />
                Installer
              </Button>
            )}
          </div>
        </div>
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
