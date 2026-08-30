import { type FormEvent, type RefObject, useState } from "react"
import { BarcodeScannerDialog, type ScanQtyResult } from "@/components/BarcodeScannerDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/ui/status-badge"
import { formatQuantity } from "@/shared/format"
import { cn } from "@/lib/utils"
import { ArrowLeft, Camera, CheckCircle, ChevronDown, ScanBarcode } from "lucide-react"

export type ScanSnapshot = ScanQtyResult & {
  itemCode: string
  warehouse?: string
  increment: number
}

export type FloorLine = {
  key: string
  itemCode: string
  itemName: string
  warehouse?: string
  picked: number
  requested: number
  remaining: number
  complete: boolean
}

export function PickFloorView({
  title,
  remainingArticles,
  lines,
  lastScan,
  scanError,
  scanMessage,
  scanning,
  scanValue,
  onScanValueChange,
  onScanSubmit,
  onOpenCamera,
  cameraOpen,
  onCameraOpenChange,
  onApplyScan,
  onBack,
  onReview,
  onFillRequested,
  busy,
  scanInputRef,
}: {
  title: string
  remainingArticles: number
  lines: FloorLine[]
  lastScan: ScanSnapshot | null
  scanError: string
  scanMessage: string
  scanning: boolean
  scanValue: string
  onScanValueChange: (value: string) => void
  onScanSubmit: (event: FormEvent) => void
  onOpenCamera: () => void
  cameraOpen: boolean
  onCameraOpenChange: (open: boolean) => void
  onApplyScan: (text: string) => void
  onBack: () => void
  onReview: () => void
  onFillRequested: () => void
  busy: boolean
  scanInputRef: RefObject<HTMLInputElement | null>
}) {
  const [manualOpen, setManualOpen] = useState(false)
  const active = lastScan
  const remainingSorted = [...lines].sort((a, b) => Number(a.complete) - Number(b.complete))
  const progress = active && active.requested > 0 ? Math.min(100, (active.picked / active.requested) * 100) : 0

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="-ml-2 shrink-0" onClick={onBack}>
          <ArrowLeft />
          Commandes
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
        </div>
        <StatusBadge tone={remainingArticles > 0 ? "warning" : "success"} size="sm">
          {remainingArticles > 0
            ? `${remainingArticles} restant${remainingArticles > 1 ? "s" : ""}`
            : "Complet"}
        </StatusBadge>
      </header>

      <section
        className={cn(
          "rounded-touch border p-4",
          active ? "border-brand-200 bg-brand-50/60" : "border-dashed border-hairline bg-muted/30",
        )}
        aria-live="polite"
      >
        {active ? (
          <>
            <p className="truncate text-sm font-medium text-foreground">
              {active.itemCode} · {active.itemName}
            </p>
            {active.warehouse ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{active.warehouse}</p>
            ) : null}
            <p className="num mt-3 text-4xl font-semibold tracking-tight">
              {formatQuantity(active.picked)}
              <span className="text-xl font-medium text-muted-foreground"> / {formatQuantity(active.requested)}</span>
            </p>
            <p className={active.remaining > 0 ? "mt-1 text-sm font-medium text-amber-800" : "mt-1 text-sm font-medium text-emerald-700"}>
              {active.remaining > 0 ? `Reste ${formatQuantity(active.remaining)}` : "Quantité atteinte"}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          </>
        ) : (
          <div className="py-2 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-touch bg-brand-50 text-brand-700">
              <ScanBarcode className="size-6" />
            </span>
            <p className="mt-3 text-sm font-medium">Scannez un article</p>
            <p className="mt-1 text-sm text-muted-foreground">Le compteur se met à jour à chaque scan.</p>
          </div>
        )}
      </section>

      <Button type="button" size="touch" className="w-full" onClick={onOpenCamera} disabled={busy}>
        <Camera />
        Scanner
      </Button>

      <button
        type="button"
        className="flex items-center justify-center gap-1 text-sm text-muted-foreground"
        onClick={() => setManualOpen((open) => !open)}
        aria-expanded={manualOpen}
      >
        Saisir un code
        <ChevronDown className={cn("size-4 transition-transform", manualOpen && "rotate-180")} />
      </button>

      {manualOpen ? (
        <form onSubmit={onScanSubmit} className="flex flex-col gap-2">
          <label htmlFor="pick-scan-barcode" className="sr-only">
            Code-barres article
          </label>
          <Input
            id="pick-scan-barcode"
            ref={scanInputRef}
            value={scanValue}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
            placeholder="Code-barres puis Entrée"
            className="h-12 rounded-touch text-base"
            onChange={(event) => onScanValueChange(event.target.value)}
          />
        </form>
      ) : null}

      <p className={`text-sm ${scanError ? "text-red-700" : "text-muted-foreground"}`} aria-live="polite">
        {scanning ? "Lecture…" : scanError || scanMessage || "Chaque scan ajoute une unité (ou le pack)."}
      </p>

      <ul className="space-y-2">
        {remainingSorted.map((line) => (
          <li
            key={line.key}
            className={cn(
              "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5",
              lastScan && `${lastScan.itemCode}-${lastScan.warehouse || ""}` === line.key
                ? "border-emerald-400 bg-emerald-50"
                : "border-hairline",
              line.complete && "opacity-50",
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {line.itemCode} · {line.itemName}
              </p>
              <p className="truncate text-xs text-muted-foreground">{line.warehouse || "Entrepôt non défini"}</p>
            </div>
            <p className="num shrink-0 text-sm font-semibold">
              {formatQuantity(line.picked)}/{formatQuantity(line.requested)}
            </p>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 pt-2">
        <Button type="button" variant="outline" size="touch" className="w-full" onClick={onReview} disabled={busy}>
          <CheckCircle />
          Contrôle final
        </Button>
        <Button type="button" variant="ghost" size="sm" className="w-full" onClick={onFillRequested} disabled={busy}>
          Tout prélever
        </Button>
      </div>

      <BarcodeScannerDialog
        open={cameraOpen}
        onOpenChange={onCameraOpenChange}
        onScan={onApplyScan}
        feedback={scanning ? "Lecture…" : scanError || scanMessage}
        feedbackTone={scanError ? "error" : scanMessage ? "success" : undefined}
        scanResult={lastScan}
      />
    </div>
  )
}
