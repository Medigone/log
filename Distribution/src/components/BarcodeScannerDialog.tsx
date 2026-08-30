import { useEffect, useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  cameraErrorDetail,
  cameraErrorMessage,
  startHtml5Scanner,
  stopHtml5Scanner,
  waitForScanRegion,
  type Html5QrcodeLike,
} from "@/components/barcodeScanner"
import { formatQuantity } from "@/shared/format"
import { XIcon } from "lucide-react"

export type ScanQtyResult = {
  itemName: string
  picked: number
  requested: number
  remaining: number
}

export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onScan,
  feedback,
  feedbackTone,
  scanResult,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScan: (text: string) => void
  feedback?: string
  feedbackTone?: "success" | "error"
  scanResult?: ScanQtyResult | null
}) {
  const reactId = useId()
  const regionId = `barcode-scanner-${reactId.replace(/:/g, "")}`
  const titleId = `${regionId}-title`
  const [cameraError, setCameraError] = useState("")
  const [cameraErrorRaw, setCameraErrorRaw] = useState("")
  const [copied, setCopied] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)
  const onScanRef = useRef(onScan)
  const lastScanRef = useRef({ text: "", at: 0 })
  const stopQueueRef = useRef(Promise.resolve())

  onScanRef.current = onScan

  useEffect(() => {
    if (!open) {
      setCameraError("")
      setCameraErrorRaw("")
      setCopied(false)
      return
    }

    let cancelled = false
    let scanner: Html5QrcodeLike | null = null

    const session = (async () => {
      await stopQueueRef.current
      if (cancelled) return
      try {
        await waitForScanRegion(regionId)
        if (cancelled) return
        const { Html5Qrcode } = await import("html5-qrcode")
        if (cancelled) return
        scanner = await startHtml5Scanner(
          () => new Html5Qrcode(regionId, { verbose: false }),
          () => Html5Qrcode.getCameras(),
          (text) => onScanRef.current(text),
          lastScanRef.current,
        )
        if (cancelled) await stopHtml5Scanner(scanner)
      } catch (error) {
        if (!cancelled) {
          setCameraError(cameraErrorMessage(error))
          setCameraErrorRaw(cameraErrorDetail(error))
        }
        await stopHtml5Scanner(scanner)
        scanner = null
      }
    })()

    return () => {
      cancelled = true
      stopQueueRef.current = session.then(() => stopHtml5Scanner(scanner))
    }
  }, [open, regionId, retryNonce])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false)
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onOpenChange])

  if (!open) return null

  const remainingLabel = scanResult
    ? scanResult.remaining > 0
      ? `Reste ${formatQuantity(scanResult.remaining)}`
      : "Complet"
    : null

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold">
            Scanner un code-barres
          </h2>
          <p className="text-sm text-muted-foreground">Cadrez le code dans le cadre. La caméra reste ouverte pour enchaîner les articles.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          <XIcon />
          Fermer
        </Button>
      </header>

      <div
        id={regionId}
        className="h-[50vh] min-h-[240px] w-full flex-1 overflow-hidden bg-black [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
      />

      <div className="shrink-0 space-y-3 border-t bg-background px-4 py-4">
        {scanResult ? (
          <div className="rounded-xl border bg-muted/50 p-3" aria-live="polite">
            <p className="truncate text-sm font-medium">{scanResult.itemName}</p>
            <p className="num mt-1 text-2xl font-semibold tracking-tight">
              {formatQuantity(scanResult.picked)} / {formatQuantity(scanResult.requested)}
            </p>
            <p className={scanResult.remaining > 0 ? "text-sm text-amber-800" : "text-sm text-emerald-700"}>
              {remainingLabel}
            </p>
          </div>
        ) : null}

        {cameraError ? (
          <div className="flex flex-col gap-2">
            <p role="alert" className="text-sm text-destructive">
              {cameraError}
            </p>
            {cameraErrorRaw ? (
              <div className="space-y-2">
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-xs text-foreground">
                  {cameraErrorRaw}
                </pre>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(cameraErrorRaw)
                      setCopied(true)
                    } catch {
                      setCopied(false)
                    }
                  }}
                >
                  {copied ? "Erreur copiée" : "Copier l’erreur"}
                </Button>
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCameraError("")
                setCameraErrorRaw("")
                setCopied(false)
                setRetryNonce((value) => value + 1)
              }}
            >
              Réessayer
            </Button>
          </div>
        ) : (
          <p
            className={
              feedbackTone === "error"
                ? "text-sm text-destructive"
                : feedbackTone === "success"
                  ? "text-sm text-foreground"
                  : "text-sm text-muted-foreground"
            }
            aria-live="polite"
          >
            {feedback || "Pointez la caméra vers le code-barres de l’article."}
          </p>
        )}
      </div>
    </div>
  )
}
