import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Ban, CircleCheck, FilePenLine, Pencil, Printer, Save, Trash2, Undo2 } from "lucide-react";
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
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { CustomerPicker } from "@/features/orders/CustomerPicker";
import { ItemSearchPanel, type ScanOutcome } from "@/features/orders/ItemSearchPanel";
import { OrderLinesTable } from "@/features/orders/OrderLinesTable";
import { OrderSummaryPanel } from "@/features/orders/OrderSummaryPanel";
import { OrderTrackingCard } from "@/features/orders/OrderTrackingCard";
import { QuickCustomerDialog } from "@/features/orders/QuickCustomerDialog";
import {
  addOrderItem,
  draftFromOrder,
  emptyDraft,
  orderWarnings,
  parseQuantityScan,
  removeOrderLine,
  toOrderPayload,
  toUpdatePayload,
  updateOrderLine,
  type OrderDraft,
  type OrderLine,
} from "@/features/orders/orderDraft";
import { orderStatusTone } from "@/features/orders/orderStatus";
import type { ScanTone } from "@/features/preparation/pickScan";
import { apiErrorMessage } from "@/shared/api/distribution";
import {
  openOrdersPdf,
  orderStatusLabel,
  useCustomerRecentItems,
  useOrder,
  useOrderMutations,
  useOrderOptions,
  type CustomerSummary,
  type ItemCard,
  type NewCustomerInput,
  type OrderDetail,
  type ScannedOrderItem,
} from "@/shared/api/orders";
import { splitServerMessage } from "@/shared/api/receipts";
import { formatMoney, formatQuantity } from "@/shared/format";

const PREVIEW_DELAY_MS = 400;

export function OrderEntryPage() {
  const { orderId } = useParams();
  const name = orderId ? decodeURIComponent(orderId) : undefined;
  const navigate = useNavigate();
  const location = useLocation();
  const { data: optionsData } = useOrderOptions();
  const options = optionsData?.message;
  const { data: orderData, error: orderError, isLoading: orderLoading, mutate: mutateOrder } = useOrder(name);
  const order = orderData?.message;
  const api = useOrderMutations();
  const apiRef = useRef(api);
  apiRef.current = api;

  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const draftRef = useRef<OrderDraft | null>(null);
  draftRef.current = draft;
  const loadedFor = useRef<string | null>(null);
  const [preview, setPreview] = useState<OrderDetail | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const previewSeq = useRef(0);
  const [dirty, setDirty] = useState(false);
  const [lastItem, setLastItem] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; tone: ScanTone }>({ text: "", tone: "idle" });
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraItem, setCameraItem] = useState<ScannedOrderItem | null>(null);
  const [newCustomerName, setNewCustomerName] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lifecycle, setLifecycle] = useState<"cancel" | "delete" | "amend" | null>(null);
  const [actionError, setActionError] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const itemInputRef = useRef<HTMLInputElement | null>(null);

  const orderDocstatus = order?.docstatus ?? 0;
  const submitted = orderDocstatus === 1;
  const editingSubmitted = submitted && editing;
  // Brouillon : modifiable sauf commande portail pour le commercial. Validée : seulement en mode « Modifier ».
  const readOnly = Boolean(order && (orderDocstatus === 0 ? !order.editable : !editingSubmitted));
  const canValidate = Boolean(options?.can_validate);

  // Nouvelle commande : brouillon vide dès que les options sont connues (client pré-choisi depuis sa fiche).
  const presetCustomer = (location.state as { customer?: CustomerSummary } | null)?.customer ?? null;
  useEffect(() => {
    if (name || draft || !options) return;
    const empty = emptyDraft(options);
    setDraft(
      presetCustomer
        ? {
            ...empty,
            customer: presetCustomer,
            paymentTermsTemplate:
              presetCustomer.payment_terms && !empty.paymentTermsTemplate && empty.scheduleMode === "template"
                ? presetCustomer.payment_terms
                : empty.paymentTermsTemplate,
          }
        : empty,
    );
  }, [name, draft, options, presetCustomer]);

  // Commande existante : on charge une seule fois par nom.
  useEffect(() => {
    if (!name || !order || loadedFor.current === name) return;
    loadedFor.current = name;
    setDraft(draftFromOrder(order));
    setPreview(order);
    setDirty(false);
  }, [name, order]);

  const change = useCallback((patch: Partial<OrderDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
  }, []);

  const setLines = useCallback((update: (lines: OrderLine[]) => OrderLine[]) => {
    setDraft((current) => (current ? { ...current, lines: update(current.lines) } : current));
    setDirty(true);
  }, []);

  // Aperçu ERPNext (prix, remises, taxes, échéances) après chaque modification.
  useEffect(() => {
    if (!draft || readOnly || !dirty) return;
    const updatePayload = editingSubmitted ? toUpdatePayload(draft) : null;
    const createPayload = editingSubmitted ? null : toOrderPayload(draft);
    const payload = updatePayload ?? createPayload;
    if (!payload || !payload.lines.length) {
      setPreview(null);
      setPreviewError("");
      return;
    }
    const seq = ++previewSeq.current;
    const timer = window.setTimeout(() => {
      setPreviewing(true);
      const request = updatePayload
        ? apiRef.current.previewOrderUpdate(updatePayload)
        : apiRef.current.previewOrder(createPayload!);
      request
        .then((result) => {
          if (seq !== previewSeq.current) return;
          setPreview(result);
          setPreviewError("");
        })
        .catch((err) => {
          if (seq === previewSeq.current) setPreviewError(apiErrorMessage(err));
        })
        .finally(() => {
          if (seq === previewSeq.current) setPreviewing(false);
        });
    }, PREVIEW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, readOnly, dirty, editingSubmitted]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // « / » place le curseur dans la recherche d'articles.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || target?.closest("input, textarea, [contenteditable=true]")) return;
      event.preventDefault();
      itemInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const context = {
    customer: draft?.customer?.name,
    priceList: draft?.priceList || null,
    warehouse: draft?.warehouse || null,
  };
  const { data: recentData } = useCustomerRecentItems(readOnly ? null : draft?.customer?.name, context.priceList, context.warehouse);

  const addItem = (item: ItemCard, qty: number) => {
    const current = draftRef.current?.lines.find((line) => line.itemCode === item.item_code)?.qty ?? 0;
    setLines((lines) => addOrderItem(lines, item, qty).lines);
    setLastItem(item.item_code);
    setFeedback({ text: `${item.item_name} : ${formatQuantity(current + qty)} ${item.uom}`, tone: "ok" });
  };

  const handleScan = async (raw: string, fromCamera = false): Promise<ScanOutcome> => {
    const { code, qty } = parseQuantityScan(raw);
    if (!code) return "error";
    try {
      const result = await api.scanOrderItem(code, context);
      if (!result.found) {
        setFeedback({ text: `Code ${code} inconnu : cherchez l’article par son nom.`, tone: "warn" });
        return "unknown";
      }
      if (fromCamera) {
        // Caméra : on confirme la quantité avant d'ajouter.
        setCameraItem(result);
        return "found";
      }
      addItem(result, qty * (result.increment || 1));
      return "found";
    } catch (err) {
      setFeedback({ text: apiErrorMessage(err), tone: "error" });
      return "error";
    }
  };

  const selectCustomer = (customer: CustomerSummary | null) => {
    if (!draft) return;
    const patch: Partial<OrderDraft> = { customer };
    if (customer?.payment_terms && !draft.paymentTermsTemplate && draft.scheduleMode === "template") {
      patch.paymentTermsTemplate = customer.payment_terms;
    }
    change(patch);
    if (customer) window.setTimeout(() => itemInputRef.current?.focus(), 0);
  };

  const createCustomer = async (payload: NewCustomerInput) => {
    const created = await api.createCustomer(payload);
    setNewCustomerName(null);
    selectCustomer(created);
    toast.success(`Client ${created.customer_name} créé.`);
  };

  const warnings = useMemo(() => (draft ? orderWarnings(draft, preview) : { blocking: [], warnings: [] }), [draft, preview]);

  const persist = async (): Promise<OrderDetail | null> => {
    if (!draft) return null;
    const payload = toOrderPayload(draft);
    if (!payload || warnings.blocking.length) {
      setActionError(warnings.blocking);
      return null;
    }
    setActionError([]);
    try {
      const saved = await api.saveOrder(payload);
      setDraft((current) => (current ? { ...current, name: saved.name } : current));
      setPreview(saved);
      setDirty(false);
      return saved;
    } catch (err) {
      setActionError(splitServerMessage(apiErrorMessage(err)));
      return null;
    }
  };

  const goToSaved = (saved: OrderDetail) => {
    if (saved.name && saved.name !== name) {
      loadedFor.current = null;
      navigate(`/commandes/${encodeURIComponent(saved.name)}`, { replace: true });
    } else {
      void mutateOrder({ message: saved }, false);
    }
  };

  const saveDraft = async () => {
    setBusy(true);
    const saved = await persist();
    setBusy(false);
    if (!saved) return;
    toast.success(
      canValidate ? `Brouillon ${saved.name} enregistré.` : `Commande ${saved.name} enregistrée : en attente de validation par le responsable.`,
    );
    goToSaved(saved);
  };

  const validate = async () => {
    setBusy(true);
    const saved = dirty || !draft?.name ? await persist() : preview;
    if (!saved?.name) {
      setBusy(false);
      return;
    }
    try {
      const submitted = await api.submitOrder(saved.name);
      setConfirming(false);
      setPreview(submitted);
      toast.success(`Commande ${submitted.name} validée : la préparation est lancée.`);
      goToSaved(submitted);
    } catch (err) {
      setActionError(splitServerMessage(apiErrorMessage(err)));
    } finally {
      setBusy(false);
    }
  };

  const showOrder = (result: OrderDetail) => {
    setDraft(draftFromOrder(result));
    setPreview(result);
    setDirty(false);
    setEditing(false);
    setActionError([]);
    void mutateOrder({ message: result }, false);
  };

  const saveSubmitted = async () => {
    if (!draft) return;
    const payload = toUpdatePayload(draft);
    if (!payload || warnings.blocking.length) {
      setActionError(warnings.blocking);
      return;
    }
    setBusy(true);
    try {
      const updated = await api.updateSubmittedOrder(payload);
      showOrder(updated);
      toast.success(`Commande ${updated.name} modifiée : la préparation est mise à jour.`);
    } catch (err) {
      setActionError(splitServerMessage(apiErrorMessage(err)));
    } finally {
      setBusy(false);
    }
  };

  const discardEdits = () => {
    if (order) showOrder(order);
  };

  const runLifecycle = async () => {
    if (!draft?.name || !lifecycle) return;
    setBusy(true);
    try {
      if (lifecycle === "cancel") {
        const cancelled = await api.cancelOrder(draft.name);
        showOrder(cancelled);
        toast.success(`Commande ${draft.name} annulée.`);
      } else if (lifecycle === "delete") {
        await api.deleteOrder(draft.name);
        setDirty(false);
        toast.success(`Commande ${draft.name} supprimée.`);
        navigate("/commandes");
      } else {
        const amended = await api.amendOrder(draft.name);
        toast.success(`Commande ${draft.name} annulée : le brouillon ${amended.name} est prêt à être modifié.`);
        loadedFor.current = null;
        navigate(`/commandes/${encodeURIComponent(amended.name)}`, { replace: true });
      }
      setLifecycle(null);
    } catch (err) {
      setActionError(splitServerMessage(apiErrorMessage(err)));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft?.name) return;
    try {
      await api.deleteOrder(draft.name);
      setDirty(false);
      toast.success(`Commande ${draft.name} supprimée.`);
      navigate("/commandes");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  if (name && orderError && !order) {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Commande introuvable</AlertTitle>
        <AlertDescription>
          {apiErrorMessage(orderError)}{" "}
          <Link to="/commandes" className="font-medium underline">
            Retour aux commandes
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  if (!draft || (name && orderLoading && !order)) {
    return (
      <div className="flex flex-col gap-3" aria-label="Chargement de la commande">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const status = order ?? preview;
  const docstatus = status?.docstatus ?? 0;
  const isSaved = Boolean(draft.name);

  const issues = (
    <>
      {actionError.length ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>À corriger</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {actionError.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {warnings.warnings.length ? (
        <ul className="flex flex-col gap-1 text-[12px] text-amber-800">
          {warnings.warnings.map((warning) => (
            <li key={warning} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {warning}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );

  const submittedActions = editingSubmitted ? (
    <>
      {issues}
      <Button size="lg" onClick={() => void saveSubmitted()} disabled={busy || !dirty || warnings.blocking.length > 0}>
        {busy ? <Spinner /> : <Save />} Enregistrer les modifications
      </Button>
      <Button variant="outline" onClick={discardEdits} disabled={busy}>
        <Undo2 /> Abandonner
      </Button>
    </>
  ) : null;

  const actions = orderDocstatus > 0 ? submittedActions : readOnly ? null : (
    <>
      {issues}
      {canValidate ? (
        <Button size="lg" onClick={() => setConfirming(true)} disabled={busy || warnings.blocking.length > 0}>
          <CircleCheck /> Valider la commande
        </Button>
      ) : null}
      <Button
        size="lg"
        variant={canValidate ? "outline" : "default"}
        onClick={() => void saveDraft()}
        disabled={busy || warnings.blocking.length > 0 || (isSaved && !dirty)}
      >
        {busy && !confirming ? <Spinner /> : <Save />}
        {isSaved && !dirty ? "Brouillon enregistré" : "Enregistrer le brouillon"}
      </Button>
      {isSaved && draft.name && status?.origin !== "Portail client" ? (
        <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
          <Trash2 /> Supprimer le brouillon
        </Button>
      ) : null}
    </>
  );

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/commandes" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="size-3.5" /> Commandes
          </Link>
        }
        title={draft.customer?.customer_name || "Nouvelle commande"}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            {isSaved ? (
              <StatusBadge tone={orderStatusTone(status?.status, docstatus)}>
                {orderStatusLabel(status?.status, docstatus, order?.per_delivered ?? 0)}
              </StatusBadge>
            ) : (
              <StatusBadge tone="info">Nouvelle</StatusBadge>
            )}
            {draft.name ? <span className="num text-xs text-muted-foreground">{draft.name}</span> : null}
            {status?.origin === "Portail client" ? <span className="text-xs text-muted-foreground">Portail client</span> : null}
            {dirty && !readOnly ? <span className="text-xs text-muted-foreground">Modifications non enregistrées</span> : null}
          </span>
        }
        actions={
          draft.name ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => draft.name && openOrdersPdf([draft.name])}
                disabled={dirty && !readOnly}
                title={dirty && !readOnly ? "Enregistrez la commande avant de l’imprimer" : undefined}
              >
                <Printer /> Imprimer / PDF
              </Button>
              {order && orderDocstatus > 0 && !editingSubmitted ? (
                <>
                  {order.can_edit_items ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setActionError([]);
                        setEditing(true);
                      }}
                    >
                      <Pencil /> Modifier
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    onClick={() => setLifecycle("amend")}
                    disabled={submitted && order.blockers.length > 0}
                    title="Annule la commande et ouvre un brouillon entièrement modifiable"
                  >
                    <FilePenLine /> Modifier entièrement
                  </Button>
                  {order.can_cancel ? (
                    <Button variant="outline" onClick={() => setLifecycle("cancel")} disabled={order.blockers.length > 0}>
                      <Ban /> Annuler
                    </Button>
                  ) : null}
                  {order.can_delete ? (
                    <Button variant="destructive" onClick={() => setLifecycle("delete")} disabled={submitted && order.blockers.length > 0}>
                      <Trash2 /> Supprimer
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null
        }
      />

      {order && orderDocstatus === 2 ? (
        <Alert>
          <Ban />
          <AlertTitle>Commande annulée</AlertTitle>
          <AlertDescription>« Modifier entièrement » crée un nouveau brouillon à partir de cette commande.</AlertDescription>
        </Alert>
      ) : null}
      {editingSubmitted ? (
        <Alert>
          <Pencil />
          <AlertTitle>Modification d’une commande validée</AlertTitle>
          <AlertDescription>
            Quantités, articles, remises, réservations et date de livraison. La préparation en cours sera mise à jour à l’enregistrement.
          </AlertDescription>
        </Alert>
      ) : null}
      {order && orderDocstatus === 1 ? <OrderTrackingCard order={order} /> : null}
      {readOnly && docstatus === 0 ? (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Commande du portail client</AlertTitle>
          <AlertDescription>Seul le responsable peut la modifier et la valider.</AlertDescription>
        </Alert>
      ) : null}
      {previewError && !readOnly ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Calcul impossible</AlertTitle>
          <AlertDescription>{previewError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-3">
          <CustomerPicker
            customer={draft.customer}
            readOnly={readOnly || editingSubmitted}
            onSelect={selectCustomer}
            onCreate={(initial) => setNewCustomerName(initial)}
          />
          {readOnly ? null : (
            <ItemSearchPanel
              context={context}
              inputRef={itemInputRef}
              feedback={feedback}
              recentItems={recentData?.message ?? []}
              onScan={handleScan}
              onPick={addItem}
              onOpenCamera={() => setCameraOpen(true)}
            />
          )}
          <OrderLinesTable
            lines={draft.lines}
            preview={preview?.lines}
            lastKey={draft.lines.find((line) => line.itemCode === lastItem)?.key ?? null}
            readOnly={readOnly}
            editableRate={options?.editable_rate}
            onChange={(key, patch) => setLines((lines) => updateOrderLine(lines, key, patch))}
            onRemove={(key) => setLines((lines) => removeOrderLine(lines, key))}
          />
        </div>
        <OrderSummaryPanel
          draft={draft}
          options={options}
          preview={preview}
          previewing={previewing}
          readOnly={readOnly || editingSubmitted}
          editableDeliveryDate={editingSubmitted}
          onChange={change}
          actions={actions}
        />
      </div>

      <BarcodeScannerDialog
        open={cameraOpen}
        onOpenChange={(open) => {
          setCameraOpen(open);
          if (!open) setCameraItem(null);
        }}
        onScan={(text) => void handleScan(text, true)}
        paused={cameraItem != null}
        prompt={
          cameraItem ? (
            <ScanQuantityPrompt
              key={`${cameraItem.item_code}-${cameraItem.barcode}`}
              title={cameraItem.item_name}
              subtitle={`${cameraItem.item_code} · ${cameraItem.barcode}`}
              details={
                <span className="flex flex-wrap gap-x-3 text-muted-foreground">
                  {cameraItem.price != null ? <span>{formatMoney(cameraItem.price)}</span> : <span className="text-amber-700">Sans prix</span>}
                  {cameraItem.is_stock_item ? <span>{formatQuantity(Math.max(0, cameraItem.available))} disponible(s)</span> : null}
                  {(() => {
                    const ordered = draft.lines.find((line) => line.itemCode === cameraItem.item_code)?.qty;
                    return ordered ? <span>Déjà commandé : {formatQuantity(ordered)}</span> : null;
                  })()}
                </span>
              }
              defaultQty={cameraItem.increment > 0 ? cameraItem.increment : 1}
              unit={cameraItem.uom}
              onConfirm={(values) => {
                addItem(cameraItem, values.qty);
                setCameraItem(null);
              }}
              onCancel={() => setCameraItem(null)}
            />
          ) : null
        }
        feedback={feedback.text}
        feedbackTone={feedback.tone === "error" || feedback.tone === "warn" ? "error" : "success"}
      />

      <QuickCustomerDialog
        open={newCustomerName != null}
        onOpenChange={(open) => !open && setNewCustomerName(null)}
        initialName={newCustomerName || ""}
        options={options}
        onSubmit={createCustomer}
      />

      <Dialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Valider la commande</DialogTitle>
            <DialogDescription>
              La Commande Client est soumise dans ERPNext et la liste de préparation est créée.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <dl className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 text-[13px]">
              <dt className="text-muted-foreground">Client</dt>
              <dd className="truncate font-medium">{draft.customer?.customer_name}</dd>
              <dt className="text-muted-foreground">Articles</dt>
              <dd className="num">{draft.lines.filter((line) => line.qty > 0).length}</dd>
              <dt className="text-muted-foreground">Total TTC</dt>
              <dd className="num font-semibold">{formatMoney(preview?.totals.rounded_total ?? 0, { precise: true })}</dd>
            </dl>
            {warnings.warnings.length ? (
              <ul className="mt-3 flex flex-col gap-1 text-[12.5px] text-amber-800">
                {warnings.warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            ) : null}
            {actionError.length ? (
              <ul className="mt-3 flex flex-col gap-1 text-[12.5px] text-destructive">
                {actionError.map((issue) => (
                  <li key={issue}>• {issue}</li>
                ))}
              </ul>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Retour
            </Button>
            <Button onClick={() => void validate()} disabled={busy}>
              {busy ? <Spinner /> : <CircleCheck />}
              Valider la commande
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lifecycle != null} onOpenChange={(open) => !open && setLifecycle(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {lifecycle === "cancel"
                ? "Annuler la commande ?"
                : lifecycle === "delete"
                  ? "Supprimer la commande ?"
                  : "Modifier entièrement la commande ?"}
            </DialogTitle>
            <DialogDescription>
              {lifecycle === "amend"
                ? "La commande est annulée et un nouveau brouillon est créé avec les mêmes informations : client, taxes, remise et échéances deviennent modifiables. Il devra être validé à nouveau."
                : lifecycle === "delete" && orderDocstatus === 2
                  ? `La commande ${draft.name} sera supprimée définitivement.`
                  : lifecycle === "delete"
                    ? `La commande ${draft.name} sera annulée puis supprimée définitivement.`
                    : `La commande ${draft.name} sera annulée et gardée dans l’historique.`}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {order && orderDocstatus === 1 && (order.pick_lists.length || order.delivery_notes.length) ? (
              <p className="text-[13px]">
                Seront aussi supprimés : {order.pick_lists.length} liste{order.pick_lists.length > 1 ? "s" : ""} de préparation
                {order.delivery_notes.length ? ` et ${order.delivery_notes.length} BL brouillon${order.delivery_notes.length > 1 ? "s" : ""}` : ""}. Les
                réservations sont libérées.
              </p>
            ) : (
              <p className="text-[13px] text-muted-foreground">Les réservations de stock de la commande sont libérées.</p>
            )}
            {actionError.length ? (
              <ul className="mt-3 flex flex-col gap-1 text-[12.5px] text-destructive">
                {actionError.map((issue) => (
                  <li key={issue}>• {issue}</li>
                ))}
              </ul>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLifecycle(null)}>
              Retour
            </Button>
            <Button variant={lifecycle === "amend" ? "default" : "destructive"} onClick={() => void runLifecycle()} disabled={busy}>
              {busy ? <Spinner /> : lifecycle === "amend" ? <FilePenLine /> : lifecycle === "delete" ? <Trash2 /> : <Ban />}
              {lifecycle === "cancel" ? "Annuler la commande" : lifecycle === "delete" ? "Supprimer" : "Annuler et modifier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le brouillon ?</DialogTitle>
            <DialogDescription>La commande {draft.name} sera supprimée définitivement.</DialogDescription>
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
