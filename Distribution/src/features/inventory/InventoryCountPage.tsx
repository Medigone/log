import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  CloudOff,
  LoaderCircle,
  RotateCcw,
  ScanBarcode,
  Search,
  X,
} from "lucide-react";
import { BarcodeScannerDialog } from "@/components/BarcodeScannerDialog";
import { FormSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { CountEntryPrompt, type CountPromptValues } from "@/features/inventory/CountEntryPrompt";
import { canCount, lineStatusTone } from "@/features/inventory/inventoryStatus";
import {
  deviceTotals,
  lineKey,
  makeJournalEntry,
  resolveScan,
  type JournalEntry,
  type ResolvedScan,
} from "@/features/inventory/inventoryScan";
import { useInventoryJournal } from "@/features/inventory/useInventoryJournal";
import {
  apiErrorMessage,
  INVENTORY_STATUS_LABELS,
  useCountSheet,
  useInventory,
  useInventoryMutations,
  useScanIndex,
} from "@/shared/api/inventory";
import { formatQuantity, formatShortDate } from "@/shared/format";

function localTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

type ScanMode = "unit" | "qty";
type Feedback = { text: string; tone: "idle" | "ok" | "error" };

const WAREHOUSE_KEY = "intrapro-distribution.inventory-warehouse.v1.";

function readWarehouse(inventory: string | undefined) {
  try {
    return inventory ? localStorage.getItem(WAREHOUSE_KEY + inventory) || "" : "";
  } catch {
    return "";
  }
}

const STATE_LABEL: Record<JournalEntry["state"], string> = {
  pending: "En attente d’envoi",
  synced: "Enregistré",
  error: "Rejeté",
  undone: "Annulé",
};

export function InventoryCountPage() {
  const { inventoryId } = useParams();
  const name = inventoryId ? decodeURIComponent(inventoryId) : undefined;
  const { data: inventoryData, error: inventoryError } = useInventory(name);
  const { data: indexData, error: indexError } = useScanIndex(name);
  const api = useInventoryMutations();
  const inventory = inventoryData?.message;
  const index = indexData?.message;

  const [warehouse, setWarehouse] = useState(() => readWarehouse(name));
  const [scanMode, setScanMode] = useState<ScanMode>("unit");
  const [scanValue, setScanValue] = useState("");
  const [feedback, setFeedback] = useState<Feedback>({ text: "", tone: "idle" });
  const [prompt, setPrompt] = useState<ResolvedScan | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [sheetSearch, setSheetSearch] = useState("");
  const [onlyRemaining, setOnlyRemaining] = useState(true);
  const lastBatchRef = useRef<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);

  const sheet = useCountSheet(name, warehouse);
  const { journal, add, flush, markUndone, dismiss, syncing, offline, pendingCount, errorCount } = useInventoryJournal(
    name,
    (entries) => api.recordCounts(name as string, entries),
    () => void sheet.mutate(),
  );

  const warehouses = useMemo(() => index?.warehouses ?? [], [index]);
  useEffect(() => {
    if (!warehouses.length) return;
    if (!warehouse || !warehouses.includes(warehouse)) setWarehouse(warehouses[0]);
  }, [warehouses, warehouse]);

  useEffect(() => {
    try {
      if (name && warehouse) localStorage.setItem(WAREHOUSE_KEY + name, warehouse);
    } catch {
      // Préférence non conservée : sans conséquence.
    }
  }, [name, warehouse]);

  const totals = useMemo(() => deviceTotals(journal), [journal]);
  const counting = inventory ? canCount(inventory.status) : false;
  const lastEntry = [...journal].reverse().find((entry) => entry.state !== "undone");

  const record = (scan: ResolvedScan, values: CountPromptValues, mode: "scan" | "manuel") => {
    const entry = makeJournalEntry(scan, {
      warehouse,
      qty: values.qty,
      batchNo: values.batchNo,
      expiryDate: values.expiryDate,
      mode,
    });
    if (values.batchNo) lastBatchRef.current[scan.itemCode] = values.batchNo;
    add(entry);
    const total = (totals[lineKey(scan.itemCode, warehouse, values.batchNo)] ?? 0) + entry.stockQty;
    setFeedback({
      text: `+${formatQuantity(entry.stockQty)} ${scan.stockUom} · ${scan.itemName}${values.batchNo ? ` (lot ${values.batchNo})` : ""} — ${formatQuantity(total)} compté${total > 1 ? "s" : ""} sur cet appareil`,
      tone: "ok",
    });
  };

  const handleScan = (raw: string) => {
    setScanValue("");
    if (!counting) {
      setFeedback({ text: "Le comptage n’est pas ouvert.", tone: "error" });
      return;
    }
    if (!warehouse) {
      setFeedback({ text: "Choisissez l’entrepôt compté.", tone: "error" });
      return;
    }
    const result = resolveScan(index, raw);
    if (!result.ok) {
      setFeedback({ text: result.message, tone: "error" });
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(200);
      return;
    }
    if (scanMode === "unit" && !result.scan.hasBatch) {
      record(result.scan, { qty: 1, batchNo: null, expiryDate: null }, "scan");
      return;
    }
    setPrompt(result.scan);
  };

  const closePrompt = () => {
    setPrompt(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const undo = async (entry: JournalEntry) => {
    if (entry.state === "pending") {
      if (syncing) {
        toast.error("Envoi en cours, réessayez dans un instant.");
        return;
      }
      markUndone(entry.client_uuid);
      return;
    }
    if (entry.state === "error") {
      dismiss(entry.client_uuid);
      return;
    }
    try {
      await api.undoCount(name as string, entry.client_uuid);
      markUndone(entry.client_uuid);
      void sheet.mutate();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const sheetLines = useMemo(() => {
    const haystack = sheetSearch.trim().toLocaleLowerCase("fr");
    return (sheet.data?.message ?? []).filter((line) => {
      if (onlyRemaining && line.status === "Compté") return false;
      if (!haystack) return true;
      return [line.item_code, line.item_name, line.batch_no || ""].some((value) => value.toLocaleLowerCase("fr").includes(haystack));
    });
  }, [sheet.data, sheetSearch, onlyRemaining]);

  const sheetStats = useMemo(() => {
    const lines = sheet.data?.message ?? [];
    return { total: lines.length, counted: lines.filter((line) => line.status === "Compté").length };
  }, [sheet.data]);

  const loadError = inventoryError || indexError;
  const promptNode = prompt ? (
    <CountEntryPrompt
      key={prompt.itemCode}
      scan={prompt}
      lastBatch={lastBatchRef.current[prompt.itemCode]}
      loadBatches={() => api.itemBatches(name as string, prompt.itemCode, warehouse)}
      onConfirm={(values) => {
        record(prompt, values, scanMode === "qty" ? "manuel" : "scan");
        closePrompt();
      }}
      onCancel={closePrompt}
    />
  ) : null;

  return (
    <>
      <PageHeader
        eyebrow={inventory ? INVENTORY_STATUS_LABELS[inventory.status] : "Inventaire"}
        title={inventory ? `Comptage · ${inventory.titre}` : "Comptage"}
        description="Scannez à la douchette ou à la caméra. Les saisies partent automatiquement, même après une coupure réseau."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link to={`/inventaires/${encodeURIComponent(name ?? "")}`} />}>
            <ArrowLeft /> Inventaire
          </Button>
        }
      />

      {loadError ? (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(loadError)}
        </p>
      ) : null}
      {inventory && !counting ? (
        <p role="status" className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="size-4 shrink-0" />
          Le comptage est fermé ({INVENTORY_STATUS_LABELS[inventory.status]}). Les saisies ne sont plus acceptées.
        </p>
      ) : null}

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm" aria-label="Scan des articles">
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3.5 py-2.5">
          <div className="w-full min-w-48 sm:w-64">
            <FormSelect
              value={warehouse}
              onChange={setWarehouse}
              options={warehouses.map((value) => ({ value, label: value }))}
              aria-label="Entrepôt compté"
            />
          </div>
          <div className="flex gap-1" role="radiogroup" aria-label="Mode de scan">
            {(["unit", "qty"] as ScanMode[]).map((mode) => (
              <Button
                key={mode}
                type="button"
                size="sm"
                variant={scanMode === mode ? "default" : "outline"}
                role="radio"
                aria-checked={scanMode === mode}
                onClick={() => setScanMode(mode)}
              >
                {mode === "unit" ? "+1 par scan" : "Saisir la quantité"}
              </Button>
            ))}
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setCameraOpen(true)} disabled={!counting}>
            <Camera /> Caméra
          </Button>
          <span className="ml-auto flex items-center gap-1.5 text-[12px]" aria-live="polite">
            {offline ? (
              <span className="flex items-center gap-1 text-amber-700">
                <CloudOff className="size-3.5" /> Hors ligne
              </span>
            ) : null}
            {syncing ? <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" /> : null}
            {pendingCount ? (
              <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => void flush()}>
                {pendingCount} en attente
              </button>
            ) : (
              <span className="flex items-center gap-1 text-emerald-700">
                <Check className="size-3.5" /> À jour
              </span>
            )}
            {errorCount ? <span className="text-destructive">· {errorCount} rejetée{errorCount > 1 ? "s" : ""}</span> : null}
          </span>
        </div>

        <div className="flex flex-col gap-2.5 p-3.5">
          <Input
            ref={inputRef}
            value={scanValue}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={!counting || !index}
            placeholder={index ? "Code-barres ou code article, puis Entrée" : "Chargement des articles…"}
            aria-label="Code-barres article"
            aria-invalid={feedback.tone === "error"}
            onChange={(event) => setScanValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              handleScan(event.currentTarget.value);
            }}
            className={cn(
              "h-[52px] rounded-lg font-mono text-[17px]",
              feedback.tone === "error" && "border-destructive/40 bg-destructive/5",
            )}
          />
          <p
            className={cn(
              "text-[12.5px] leading-snug",
              feedback.tone === "ok" ? "text-emerald-700" : feedback.tone === "error" ? "text-destructive" : "text-muted-foreground",
            )}
            aria-live="polite"
          >
            {feedback.text ||
              (scanMode === "unit"
                ? "Chaque scan compte 1 unité (ou 1 carton pour un code-barres carton). Les articles à lots demandent le lot."
                : "Scannez un article puis saisissez la quantité comptée.")}
          </p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card" aria-label="Mes dernières saisies">
          <header className="flex items-center gap-2 border-b px-3.5 py-2.5">
            <h2 className="text-[13px] font-medium">Mes dernières saisies</h2>
            {lastEntry ? <span className="ml-auto t-meta text-muted-foreground">Dernière à {localTime(lastEntry.createdAt)}</span> : null}
          </header>
          {journal.length ? (
            <ul className="max-h-[420px] divide-y overflow-y-auto">
              {[...journal].reverse().slice(0, 60).map((entry) => (
                <li key={entry.client_uuid} className={cn("flex items-center gap-2 px-3.5 py-2", entry.state === "undone" && "opacity-50")}>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-[13px] font-medium", entry.state === "undone" && "line-through")}>
                      {entry.itemName}
                    </p>
                    <p className="truncate t-meta text-muted-foreground">
                      {entry.item_code}
                      {entry.batch_no ? ` · lot ${entry.batch_no}` : ""} · {entry.warehouse} · {localTime(entry.createdAt)}
                    </p>
                    {entry.state === "error" && entry.message ? (
                      <p className="truncate text-[12px] text-destructive">{entry.message}</p>
                    ) : null}
                  </div>
                  <span className="num whitespace-nowrap text-[14px] font-medium">
                    +{formatQuantity(entry.stockQty)} <span className="text-[11px] font-normal text-muted-foreground">{entry.stockUom}</span>
                  </span>
                  <StatusBadge
                    size="sm"
                    tone={entry.state === "synced" ? "success" : entry.state === "error" ? "danger" : entry.state === "pending" ? "info" : "neutral"}
                  >
                    {STATE_LABEL[entry.state]}
                  </StatusBadge>
                  {entry.state !== "undone" && counting ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={entry.state === "error" ? "Retirer" : "Annuler la saisie"}
                      onClick={() => void undo(entry)}
                    >
                      {entry.state === "error" ? <X /> : <RotateCcw />}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={ScanBarcode} title="Aucune saisie" description="Les articles scannés s’affichent ici." />
          )}
        </section>

        <section className="rounded-xl border bg-card" aria-label="Feuille de comptage">
          <header className="flex flex-wrap items-center gap-2 border-b px-3.5 py-2.5">
            <h2 className="text-[13px] font-medium">Feuille de comptage</h2>
            <span className="num t-meta text-muted-foreground">
              {sheetStats.counted}/{sheetStats.total} lignes comptées
            </span>
            <label className="ml-auto flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <input type="checkbox" checked={onlyRemaining} onChange={(event) => setOnlyRemaining(event.target.checked)} />
              Restantes seulement
            </label>
          </header>
          <div className="border-b px-3.5 py-2">
            <InputGroup className="bg-background">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                value={sheetSearch}
                onChange={(event) => setSheetSearch(event.target.value)}
                placeholder="Article, désignation ou lot…"
                aria-label="Rechercher dans la feuille de comptage"
              />
            </InputGroup>
          </div>
          {sheet.isLoading && !sheet.data ? (
            <div className="grid min-h-32 place-items-center">
              <LoaderCircle className="size-6 animate-spin text-brand-600" />
            </div>
          ) : sheetLines.length ? (
            <ul className="max-h-[420px] divide-y overflow-y-auto">
              {sheetLines.slice(0, 300).map((line) => {
                const mine = totals[lineKey(line.item_code, line.warehouse, line.batch_no)] ?? 0;
                return (
                  <li key={line.name} className="flex items-center gap-2 px-3.5 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{line.item_name}</p>
                      <p className="truncate t-meta text-muted-foreground">
                        {line.item_code}
                        {line.batch_no ? ` · lot ${line.batch_no}` : ""}
                        {line.expiry_date ? ` · ${formatShortDate(line.expiry_date)}` : ""}
                        {line.hors_liste ? " · hors liste" : ""}
                      </p>
                    </div>
                    {line.status === "Compté" ? (
                      <span className="num text-[13px]">
                        {formatQuantity(line.counted_qty)} <span className="text-[11px] text-muted-foreground">{line.stock_uom}</span>
                      </span>
                    ) : mine ? (
                      <span className="num text-[13px] text-muted-foreground">{formatQuantity(mine)} en envoi</span>
                    ) : null}
                    <StatusBadge size="sm" tone={lineStatusTone(line.status)}>
                      {line.status}
                    </StatusBadge>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={Check}
              title={onlyRemaining ? "Tout est compté" : "Aucune ligne"}
              description={onlyRemaining ? "Toutes les lignes de cet entrepôt ont au moins une saisie." : "Modifiez la recherche."}
            />
          )}
        </section>
      </div>

      <Dialog open={Boolean(prompt) && !cameraOpen} onOpenChange={(open) => (open ? undefined : closePrompt())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Quantité comptée</DialogTitle>
          </DialogHeader>
          <DialogBody>{promptNode}</DialogBody>
        </DialogContent>
      </Dialog>

      <BarcodeScannerDialog
        open={cameraOpen}
        onOpenChange={(open) => {
          setCameraOpen(open);
          if (!open) setPrompt(null);
        }}
        onScan={handleScan}
        paused={Boolean(prompt)}
        prompt={promptNode}
        feedback={feedback.text || undefined}
        feedbackTone={feedback.tone === "error" ? "error" : "success"}
      />
    </>
  );
}
