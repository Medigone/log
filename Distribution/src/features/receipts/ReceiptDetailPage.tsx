import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CircleCheck,
  ClipboardCheck,
  CloudCheck,
  LoaderCircle,
  ScanBarcode,
  Trash2,
  Undo2,
} from "lucide-react";
import { BarcodeScannerDialog } from "@/components/BarcodeScannerDialog";
import { ScanQuantityPrompt } from "@/components/ScanQuantityPrompt";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { ScanJournal } from "@/features/preparation/ScanJournal";
import { scanClock, type ScanLogEntry, type ScanTone } from "@/features/preparation/pickScan";
import { QuickItemDialog } from "@/features/receipts/QuickItemDialog";
import { ReceiptLinesTable } from "@/features/receipts/ReceiptLinesTable";
import {
  applyReceiptScan,
  linesFromReceipt,
  receiptTotals,
  removeLine,
  reviewReceipt,
  splitBatch,
  toLineInputs,
  undoReceiptScan,
  updateLine,
  type ReceiptLine,
  type ScanBatch,
} from "@/features/receipts/receiptScan";
import { receiptStatusTone } from "@/features/receipts/receiptStatus";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/shared/api/distribution";
import {
  RECEIPT_STATUS_LABELS,
  splitServerMessage,
  useReceipt,
  useReceiptMutations,
  useReceiptOptions,
  type NewItemInput,
  type ScannedItem,
} from "@/shared/api/receipts";
import { formatMoney, formatQuantity, formatShortDate } from "@/shared/format";

type SaveState = "saved" | "dirty" | "saving" | "error";
type ReviewMode = "ready" | "submit";

const AUTOSAVE_MS = 800;

const FEEDBACK_TEXT: Record<ScanTone, string> = {
  idle: "text-muted-foreground",
  ok: "text-emerald-700",
  warn: "text-amber-700",
  error: "text-destructive",
};

export function ReceiptDetailPage() {
  const { receiptId = "" } = useParams();
  const name = decodeURIComponent(receiptId);
  const navigate = useNavigate();
  const { data, error, isLoading, mutate } = useReceipt(name);
  const { data: optionsData } = useReceiptOptions();
  const options = optionsData?.message;
  const detail = data?.message;
  const api = useReceiptMutations();

  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const linesRef = useRef<ReceiptLine[]>([]);
  const loadedFor = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef<Promise<boolean> | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");

  const [scanValue, setScanValue] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; tone: ScanTone }>({ text: "", tone: "idle" });
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [log, setLog] = useState<ScanLogEntry[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraItem, setCameraItem] = useState<{ item: ScannedItem; code: string } | null>(null);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewMode | null>(null);
  const [reviewError, setReviewError] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const editable = Boolean(detail && detail.docstatus === 0 && !detail.linked_to_purchase_order);
  const canValidate = Boolean(options?.can_validate);

  useEffect(() => {
    if (!detail || loadedFor.current === detail.name) return;
    loadedFor.current = detail.name;
    const initial = linesFromReceipt(detail);
    linesRef.current = initial;
    setLines(initial);
  }, [detail]);

  const runSave = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timerRef.current);
    if (savingRef.current) await savingRef.current;
    if (!dirtyRef.current) return true;
    dirtyRef.current = false;
    setSaveState("saving");
    const promise = (async () => {
      try {
        const saved = await api.saveLines(name, toLineInputs(linesRef.current));
        void mutate({ message: saved }, false);
        setSaveError("");
        setSaveState(dirtyRef.current ? "dirty" : "saved");
        return true;
      } catch (err) {
        dirtyRef.current = true;
        setSaveError(apiErrorMessage(err));
        setSaveState("error");
        return false;
      }
    })();
    savingRef.current = promise;
    const ok = await promise;
    savingRef.current = null;
    return ok;
  }, [api, mutate, name]);

  const runSaveRef = useRef(runSave);
  runSaveRef.current = runSave;

  const commitLines = useCallback((next: ReceiptLine[]) => {
    linesRef.current = next;
    setLines(next);
    dirtyRef.current = true;
    setSaveState("dirty");
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void runSaveRef.current(), AUTOSAVE_MS);
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      // Quitter la page n'abandonne pas la dernière saisie.
      if (dirtyRef.current) void runSaveRef.current();
    };
  }, []);

  const pushLog = (entry: Omit<ScanLogEntry, "id" | "time">) => {
    setLog((current) => [{ ...entry, id: `${Date.now()}-${current.length}`, time: scanClock() }, ...current].slice(0, 50));
  };

  const addScannedItem = (item: ScannedItem, code: string, batch?: ScanBatch) => {
    const applied = applyReceiptScan(linesRef.current, item, undefined, batch);
    commitLines(applied.lines);
    setLastKey(applied.key);
    const line = applied.lines.find((entry) => entry.key === applied.key);
    const batchHint = item.has_batch_no && !line?.batchNo ? " · saisissez le lot" : "";
    setFeedback({
      text: `${item.item_name} : ${formatQuantity(line?.qty ?? applied.amount)} ${line?.uom ?? ""}${batchHint}`.trim(),
      tone: "ok",
    });
    pushLog({ key: applied.key, amount: applied.amount, code, label: item.item_name, tone: "ok" });
  };

  const handleScan = async (raw: string, fromCamera = false) => {
    const code = raw.trim();
    setScanValue("");
    if (!code || !editable) return;
    try {
      const result = await api.scanReceiptItem(name, code);
      if (!result.found) {
        setFeedback({ text: `Code ${code} inconnu : créez la fiche article.`, tone: "warn" });
        pushLog({ amount: 0, code, label: "Article inconnu", tone: "warn" });
        setCameraOpen(false);
        setUnknownBarcode(code);
        return;
      }
      if (fromCamera) {
        // Caméra : on confirme la quantité (et le lot) avant d'ajouter.
        setCameraItem({ item: result, code });
        return;
      }
      addScannedItem(result, code);
    } catch (err) {
      const message = apiErrorMessage(err);
      setFeedback({ text: message, tone: "error" });
      pushLog({ amount: 0, code, label: message, tone: "error" });
    } finally {
      if (!fromCamera) inputRef.current?.focus();
    }
  };

  const createItem = async (payload: NewItemInput) => {
    const item = await api.createItem({
      ...payload,
      company: options?.company,
      warehouse: detail?.warehouse,
      receipt: name,
    });
    setUnknownBarcode(null);
    addScannedItem(item, payload.barcode);
    toast.success(`Article ${item.item_name} créé et ajouté.`);
  };

  const undo = (entry: ScanLogEntry) => {
    if (!entry.key) return;
    commitLines(undoReceiptScan(linesRef.current, entry.key, entry.amount));
    setLog((current) => current.filter((item) => item.id !== entry.id));
  };

  const totals = useMemo(() => receiptTotals(lines), [lines]);
  const reviewResult = useMemo(() => reviewReceipt(lines), [lines]);

  const openReview = (mode: ReviewMode) => {
    setReviewError([]);
    setReview(mode);
  };

  const confirmReview = async () => {
    if (!review) return;
    setReviewError([]);
    const saved = await runSave();
    if (!saved) {
      setReviewError(["L’enregistrement des lignes a échoué. Corrigez l’erreur puis réessayez."]);
      return;
    }
    try {
      if (review === "ready") {
        const updated = await api.markReady(name, true);
        void mutate({ message: updated }, false);
        toast.success("Saisie terminée : la réception attend la validation du responsable.");
      } else {
        const updated = await api.submitReceipt(name);
        void mutate({ message: updated }, false);
        toast.success("Réception validée : le stock est mis à jour.");
      }
      setReview(null);
    } catch (err) {
      setReviewError(splitServerMessage(apiErrorMessage(err)));
    }
  };

  const reopen = async () => {
    try {
      const updated = await api.markReady(name, false);
      void mutate({ message: updated }, false);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const remove = async () => {
    try {
      window.clearTimeout(timerRef.current);
      dirtyRef.current = false;
      await api.deleteReceipt(name);
      toast.success(`Réception ${name} supprimée.`);
      navigate("/receptions");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  if (error && !detail) {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Réception introuvable</AlertTitle>
        <AlertDescription>
          {apiErrorMessage(error)}{" "}
          <Link to="/receptions" className="font-medium underline">
            Retour aux réceptions
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading || !detail) {
    return (
      <div className="flex flex-col gap-3" aria-label="Chargement de la réception">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const saveIndicator =
    saveState === "saving" ? (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" /> Enregistrement…
      </span>
    ) : saveState === "dirty" ? (
      <span className="text-xs text-muted-foreground">Modifications en attente…</span>
    ) : saveState === "error" ? (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
        <AlertTriangle className="size-3.5" /> Non enregistré
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <CloudCheck className="size-3.5" /> Enregistré
      </span>
    );

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/receptions" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="size-3.5" /> Réceptions
          </Link>
        }
        title={detail.supplier_name}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={receiptStatusTone(detail.status)}>{RECEIPT_STATUS_LABELS[detail.status]}</StatusBadge>
            <span className="num text-xs text-muted-foreground">{detail.name}</span>
            {editable ? saveIndicator : null}
          </span>
        }
        description={[
          detail.warehouse,
          formatShortDate(detail.posting_date || undefined),
          detail.supplier_delivery_note ? `BL ${detail.supplier_delivery_note}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          detail.docstatus === 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Supprimer
              </Button>
              {!canValidate ? (
                detail.ready ? (
                  <Button variant="outline" onClick={() => void reopen()} disabled={api.markingReady}>
                    <Undo2 /> Reprendre la saisie
                  </Button>
                ) : (
                  <Button onClick={() => openReview("ready")} disabled={!lines.length}>
                    <ClipboardCheck /> Terminer la saisie
                  </Button>
                )
              ) : (
                <Button onClick={() => openReview("submit")} disabled={!lines.length}>
                  <CircleCheck /> Valider la réception
                </Button>
              )}
            </div>
          ) : null
        }
      />

      {detail.linked_to_purchase_order && detail.docstatus === 0 ? (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Réception liée à une commande d’achat</AlertTitle>
          <AlertDescription>Ses lignes se modifient dans le Desk ERPNext ; vous pouvez la valider ici.</AlertDescription>
        </Alert>
      ) : null}

      {detail.ready && detail.docstatus === 0 ? (
        <Alert>
          <ClipboardCheck />
          <AlertTitle>Saisie terminée</AlertTitle>
          <AlertDescription>
            {canValidate
              ? "Le magasinier a terminé : vérifiez les lignes puis validez la réception."
              : "En attente de validation par le responsable. Toute modification remet la réception en saisie."}
          </AlertDescription>
        </Alert>
      ) : null}

      {saveState === "error" && saveError ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Les dernières modifications ne sont pas enregistrées</AlertTitle>
          <AlertDescription>
            {saveError}
            <Button variant="outline" size="sm" className="ml-2" onClick={() => void runSave()}>
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {editable ? (
        <section className="rounded-xl border bg-card p-3.5 shadow-sm" aria-label="Scan des articles">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <ScanBarcode className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={scanValue}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Scannez ou tapez un code-barres puis Entrée"
                aria-label="Code-barres article"
                aria-invalid={feedback.tone === "error"}
                disabled={api.scanning}
                onChange={(event) => setScanValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  void handleScan(event.currentTarget.value);
                }}
                className={cn(
                  "h-[52px] rounded-lg pl-10 font-mono text-[17px]",
                  feedback.tone === "error" && "border-destructive/40 bg-destructive/5",
                )}
              />
            </div>
            <Button variant="outline" className="h-[52px]" onClick={() => setCameraOpen(true)}>
              <Camera /> Caméra
            </Button>
          </div>
          <p className={cn("mt-2 text-[12.5px] leading-snug", FEEDBACK_TEXT[feedback.tone])} aria-live="polite">
            {feedback.text || "Chaque scan ajoute une unité (ou le contenu du carton) à la ligne de l’article."}
          </p>
        </section>
      ) : null}

      <ReceiptLinesTable
        lines={lines}
        lastKey={lastKey}
        readOnly={!editable}
        onChange={(key, patch) => commitLines(updateLine(linesRef.current, key, patch))}
        onRemove={(key) => commitLines(removeLine(linesRef.current, key))}
        onSplitBatch={(key) => {
          const result = splitBatch(linesRef.current, key);
          commitLines(result.lines);
          if (result.key) setLastKey(result.key);
        }}
      />

      <section
        className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border bg-muted/30 px-3.5 py-2.5 text-[13px]"
        aria-label="Totaux de la réception"
      >
        <span>
          <span className="num font-semibold">{totals.items}</span> article{totals.items > 1 ? "s" : ""}
        </span>
        <span>
          <span className="num font-semibold">{formatQuantity(totals.qty)}</span> unités reçues
        </span>
        <span className="ml-auto">
          Total HT <span className="num font-semibold">{formatMoney(totals.amount, { precise: true })}</span>
        </span>
      </section>

      {editable && log.length ? (
        <div className="hidden md:block">
          <ScanJournal log={log} onUndo={undo} />
        </div>
      ) : null}

      <BarcodeScannerDialog
        open={cameraOpen}
        onOpenChange={(open) => {
          setCameraOpen(open);
          if (!open) setCameraItem(null);
        }}
        onScan={(text) => void handleScan(text, true)}
        feedback={feedback.text}
        feedbackTone={feedback.tone === "error" || feedback.tone === "warn" ? "error" : "success"}
        paused={cameraItem != null}
        prompt={
          cameraItem ? (
            <ScanQuantityPrompt
              key={`${cameraItem.code}-${log.length}`}
              title={cameraItem.item.item_name}
              subtitle={`${cameraItem.item.item_code} · ${cameraItem.code}`}
              details={(() => {
                const received = lines
                  .filter((line) => line.itemCode === cameraItem.item.item_code)
                  .reduce((sum, line) => sum + line.qty, 0);
                return received ? (
                  <span className="text-muted-foreground">Déjà reçu : {formatQuantity(received)} {cameraItem.item.uom}</span>
                ) : null;
              })()}
              defaultQty={cameraItem.item.increment > 0 ? cameraItem.item.increment : 1}
              unit={cameraItem.item.uom}
              askBatch={cameraItem.item.has_batch_no}
              onConfirm={(values) => {
                addScannedItem({ ...cameraItem.item, increment: values.qty }, cameraItem.code, {
                  batchNo: values.batchNo,
                  expiryDate: values.expiryDate,
                });
                setCameraItem(null);
              }}
              onCancel={() => setCameraItem(null)}
            />
          ) : null
        }
      />

      <QuickItemDialog
        open={unknownBarcode != null}
        onOpenChange={(open) => {
          if (!open) setUnknownBarcode(null);
        }}
        barcode={unknownBarcode || ""}
        options={options}
        onSubmit={createItem}
      />

      <Dialog open={review != null} onOpenChange={(open) => !open && setReview(null)}>
        <DialogContent size="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{review === "submit" ? "Valider la réception" : "Terminer la saisie"}</DialogTitle>
            <DialogDescription>
              {review === "submit"
                ? "La validation crée le Reçu d’Achat définitif et les entrées de stock. Elle ne peut pas être annulée ici."
                : "Le responsable vérifiera la réception avant de la valider."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-3">
              <dl className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-3 text-center">
                <div>
                  <dt className="t-micro text-muted-foreground">Articles</dt>
                  <dd className="num text-lg font-semibold">{totals.items}</dd>
                </div>
                <div>
                  <dt className="t-micro text-muted-foreground">Unités</dt>
                  <dd className="num text-lg font-semibold">{formatQuantity(totals.qty)}</dd>
                </div>
                <div>
                  <dt className="t-micro text-muted-foreground">Total HT</dt>
                  <dd className="num text-lg font-semibold">{formatMoney(totals.amount)}</dd>
                </div>
              </dl>
              {[...reviewResult.blocking, ...reviewError].length ? (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertTitle>À corriger avant de continuer</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4">
                      {[...reviewResult.blocking, ...reviewError].map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}
              {reviewResult.warnings.length ? (
                <Alert>
                  <AlertTriangle />
                  <AlertTitle>À vérifier</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4">
                      {reviewResult.warnings.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview(null)}>
              Retour
            </Button>
            <Button
              onClick={() => void confirmReview()}
              disabled={reviewResult.blocking.length > 0 || api.submitting || api.markingReady || api.saving}
            >
              {api.submitting || api.markingReady ? <Spinner /> : null}
              {review === "submit" ? "Valider et mettre en stock" : "Terminer la saisie"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer la réception ?</DialogTitle>
            <DialogDescription>
              Le brouillon {detail.name} et ses {lines.length} ligne{lines.length > 1 ? "s" : ""} seront supprimés. Le stock n’est pas modifié.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={() => void remove()} disabled={api.deleting}>
              {api.deleting ? <Spinner /> : <Trash2 />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
