import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Camera, LoaderCircle, ScanBarcode, Search, Trash2 } from "lucide-react"
import { BarcodeScannerDialog } from "@/components/BarcodeScannerDialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { PageHeader } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { preparationChipClass } from "@/features/preparation/PreparationQueueShell"
import {
  decideScanAction,
  normalizeScannedBarcode,
  type ItemBarcodeItem,
  type ItemBarcodeSummary,
} from "@/features/barcodes/itemBarcodeScan"
import { apiErrorMessage, useItemBarcode, useItemBarcodeMutations, useItemBarcodeSearch } from "@/shared/api/itemBarcodes"
import { cn } from "@/lib/utils"

type FeedbackTone = "idle" | "ok" | "warn" | "error"

function useDebouncedValue(value: string, delayMs = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

function ItemRow({
  item,
  selected,
  onSelect,
}: {
  item: ItemBarcodeSummary
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left",
        selected ? "border-foreground bg-muted/60" : "border-hairline bg-card hover:border-brand-300",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {item.itemCode} · {item.itemName}
        </p>
        <p className="truncate text-xs text-muted-foreground">{item.stockUom || "Unité"}</p>
      </div>
      <StatusBadge tone={item.barcodeCount ? "success" : "warning"} size="sm">
        {item.barcodeCount ? `${item.barcodeCount} code${item.barcodeCount > 1 ? "s" : ""}` : "Sans code"}
      </StatusBadge>
    </button>
  )
}

export function ItemBarcodesPage() {
  const [query, setQuery] = useState("")
  const [missingOnly, setMissingOnly] = useState(false)
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [scanValue, setScanValue] = useState("")
  const [pendingBarcode, setPendingBarcode] = useState("")
  const [uom, setUom] = useState("")
  const [cameraOpen, setCameraOpen] = useState(false)
  const [feedback, setFeedback] = useState({ text: "", tone: "idle" as FeedbackTone })
  const scanRef = useRef<HTMLInputElement>(null)
  const debouncedQuery = useDebouncedValue(query)
  const { data, error, isLoading, mutate: refreshSearch } = useItemBarcodeSearch(debouncedQuery, missingOnly)
  const { data: itemData, error: itemError, isLoading: itemLoading, mutate: refreshItem } = useItemBarcode(selectedCode)
  const actions = useItemBarcodeMutations()
  const items = data?.message || []
  const item = itemData?.message
  const busy = actions.adding || actions.lookingUp || actions.removing

  useEffect(() => {
    if (!item) return
    const next = uom && item.uoms.some((row) => row.uom === uom) ? uom : item.stockUom
    if (next !== uom) setUom(next)
  }, [item, uom])

  const focusScan = () => {
    window.setTimeout(() => scanRef.current?.focus(), 50)
  }

  const applyItem = (next: ItemBarcodeItem) => {
    setSelectedCode(next.itemCode)
    setUom(next.stockUom)
    void refreshItem()
    void refreshSearch()
  }

  const handleScan = async (raw: string) => {
    const barcode = normalizeScannedBarcode(raw)
    if (!barcode || busy) return
    setScanValue("")
    setFeedback({ text: "", tone: "idle" })
    try {
      const looked = await actions.lookupBarcode(barcode)
      const decision = decideScanAction(barcode, looked.item, selectedCode)
      if (decision.action === "conflict") {
        setFeedback({
          text: `Déjà associé à ${decision.item.itemCode} · ${decision.item.itemName}`,
          tone: "error",
        })
        focusScan()
        return
      }
      if (decision.action === "already") {
        applyItem(decision.item)
        setPendingBarcode("")
        setFeedback({ text: "Ce code est déjà associé à cet article.", tone: "warn" })
        focusScan()
        return
      }
      if (decision.action === "open-item") {
        applyItem(decision.item)
        setPendingBarcode("")
        setFeedback({ text: `Article trouvé : ${decision.item.itemCode} · ${decision.item.itemName}`, tone: "ok" })
        focusScan()
        return
      }
      if (decision.action === "pending") {
        setPendingBarcode(decision.barcode)
        setFeedback({ text: "Choisissez un article pour y associer ce code.", tone: "warn" })
        return
      }
      const saved = await actions.addBarcode(decision.itemCode, decision.barcode, uom || item?.stockUom)
      applyItem(saved)
      setPendingBarcode("")
      toast.success(`Code ${decision.barcode} associé à ${saved.itemCode}.`)
      setFeedback({ text: `Code ${decision.barcode} associé.`, tone: "ok" })
      focusScan()
    } catch (scanError) {
      setFeedback({ text: apiErrorMessage(scanError), tone: "error" })
      focusScan()
    }
  }

  const assignPending = async (itemCode: string) => {
    if (!pendingBarcode) return
    try {
      const chosenUom = item?.itemCode === itemCode ? uom || item.stockUom : undefined
      const saved = await actions.addBarcode(itemCode, pendingBarcode, chosenUom)
      applyItem(saved)
      setPendingBarcode("")
      toast.success(`Code ${pendingBarcode} associé à ${saved.itemCode}.`)
      setFeedback({ text: `Code ${pendingBarcode} associé.`, tone: "ok" })
      focusScan()
    } catch (scanError) {
      setFeedback({ text: apiErrorMessage(scanError), tone: "error" })
    }
  }

  const removeBarcode = async (barcode: string) => {
    if (!selectedCode) return
    try {
      const saved = await actions.removeBarcode(selectedCode, barcode)
      applyItem(saved)
      toast.success(`Code ${barcode} retiré.`)
      setFeedback({ text: `Code ${barcode} retiré.`, tone: "ok" })
      focusScan()
    } catch (scanError) {
      setFeedback({ text: apiErrorMessage(scanError), tone: "error" })
    }
  }

  const selectItem = (itemCode: string) => {
    setSelectedCode(itemCode)
    setFeedback({ text: "", tone: "idle" })
    if (pendingBarcode) void assignPending(itemCode)
  }

  const toneClass =
    feedback.tone === "error"
      ? "text-destructive"
      : feedback.tone === "warn"
        ? "text-amber-700"
        : feedback.tone === "ok"
          ? "text-emerald-700"
          : "text-muted-foreground"

  const listHint = useMemo(() => {
    if (isLoading) return "Recherche…"
    if (items.length === 1) return "1 article"
    return `${items.length} articles`
  }, [isLoading, items.length])

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Codes-barres"
        description="Scannez un code pour retrouver l’article, ou associez un nouveau code à l’article choisi. Pistolet ou caméra."
      />

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-col gap-2.5 border-b p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="t-micro text-muted-foreground">Scan code-barres</span>
            <Button type="button" variant="outline" size="sm" className="h-[30px]" onClick={() => setCameraOpen(true)}>
              <Camera data-icon="inline-start" />
              Caméra
            </Button>
          </div>
          <Input
            ref={scanRef}
            value={scanValue}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
            id="item-barcode-scan"
            placeholder="Scannez puis Entrée"
            aria-label="Code-barres à associer"
            aria-invalid={feedback.tone === "error"}
            onChange={(event) => setScanValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              event.preventDefault()
              void handleScan(event.currentTarget.value)
            }}
            className={cn(
              "h-[52px] font-mono text-[17px]",
              feedback.tone === "error" && "border-destructive/40 bg-destructive/5",
            )}
          />
          <p className={cn("text-[12.5px] leading-snug", toneClass)} aria-live="polite">
            {feedback.text ||
              (pendingBarcode
                ? `Code ${pendingBarcode} en attente — choisissez un article.`
                : selectedCode
                  ? "Scannez un code pour l’associer à l’article sélectionné."
                  : "Scannez un code existant pour ouvrir l’article, ou un nouveau code puis choisissez l’article.")}
          </p>
          {pendingBarcode ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <ScanBarcode className="size-4" />
              <span className="font-mono font-medium">{pendingBarcode}</span>
              <span className="text-amber-800">en attente d’un article</span>
              <Button type="button" variant="ghost" size="sm" className="ml-auto h-7" onClick={() => setPendingBarcode("")}>
                Annuler
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <Card className="gap-0 overflow-hidden py-0">
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
            <InputGroup className="h-[30px] min-w-40 flex-1 bg-background">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nom ou code article"
                aria-label="Rechercher un article"
              />
            </InputGroup>
            <button
              type="button"
              className={preparationChipClass(!missingOnly)}
              aria-pressed={!missingOnly}
              onClick={() => setMissingOnly(false)}
            >
              Tous
            </button>
            <button
              type="button"
              className={preparationChipClass(missingOnly)}
              aria-pressed={missingOnly}
              onClick={() => setMissingOnly(true)}
            >
              Sans code
            </button>
            <span className="num text-[11px] text-muted-foreground">{listHint}</span>
          </div>
          <div className="max-h-[min(36vh,420px)] space-y-2 overflow-y-auto p-3 lg:max-h-[min(70vh,640px)]">
            {error ? <p className="text-sm text-destructive">{apiErrorMessage(error)}</p> : null}
            {isLoading ? (
              <div className="space-y-2" aria-hidden>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={Search}
                title="Aucun article"
                description={missingOnly ? "Tous les articles affichés ont déjà un code-barres." : "Saisissez un nom ou un code article."}
              />
            ) : (
              items.map((row) => (
                <ItemRow
                  key={row.itemCode}
                  item={row}
                  selected={selectedCode === row.itemCode}
                  onSelect={() => selectItem(row.itemCode)}
                />
              ))
            )}
          </div>
        </Card>

        <Card className="gap-0 overflow-hidden py-0">
          {!selectedCode ? (
            <EmptyState
              icon={ScanBarcode}
              title="Aucun article sélectionné"
              description="Cherchez un article à gauche, ou scannez un code déjà enregistré."
            />
          ) : itemLoading && !item ? (
            <div className="space-y-3 p-4" aria-hidden>
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : itemError ? (
            <p className="p-4 text-sm text-destructive">{apiErrorMessage(itemError)}</p>
          ) : item ? (
            <div className="flex flex-col gap-4 p-4">
              <div>
                <p className="t-micro text-muted-foreground">Article</p>
                <h2 className="text-lg font-semibold">
                  {item.itemCode} · {item.itemName}
                </h2>
                <p className="text-sm text-muted-foreground">Unité de stock : {item.stockUom || "—"}</p>
              </div>

              <label className="grid max-w-xs gap-1.5 text-sm">
                <span className="text-muted-foreground">Unité du code (pack / unité)</span>
                <NativeSelect
                  value={uom}
                  onChange={(event) => setUom(event.target.value)}
                  aria-label="Unité du code-barres"
                >
                  {(item.uoms.length ? item.uoms : [{ uom: item.stockUom, conversionFactor: 1 }]).map((row) => (
                    <NativeSelectOption key={row.uom} value={row.uom}>
                      {row.uom}
                      {row.conversionFactor > 1 ? ` ×${row.conversionFactor}` : ""}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>

              {pendingBarcode ? (
                <Button type="button" disabled={busy} onClick={() => void assignPending(item.itemCode)}>
                  {busy ? <LoaderCircle className="animate-spin" /> : <ScanBarcode data-icon="inline-start" />}
                  Associer {pendingBarcode}
                </Button>
              ) : null}

              <div>
                <p className="mb-2 t-micro text-muted-foreground">Codes associés</p>
                {item.barcodes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun code-barres. Scannez pour en ajouter un.</p>
                ) : (
                  <ul className="space-y-2">
                    {item.barcodes.map((row) => (
                      <li
                        key={row.barcode}
                        className="flex items-center gap-3 rounded-lg border border-hairline px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-sm font-medium">{row.barcode}</p>
                          <p className="text-xs text-muted-foreground">{row.uom || item.stockUom}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Retirer ${row.barcode}`}
                          disabled={busy}
                          onClick={() => void removeBarcode(row.barcode)}
                        >
                          <Trash2 />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      <BarcodeScannerDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onScan={(text) => void handleScan(text)}
        feedback={feedback.text}
        feedbackTone={feedback.tone === "error" ? "error" : feedback.tone === "ok" ? "success" : undefined}
      />
    </div>
  )
}
