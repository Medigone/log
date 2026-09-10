import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Package,
  Printer,
  QrCode,
} from "lucide-react";
import { ScanConsole } from "@/features/preparation/ScanConsole";
import { PickLinesTable } from "@/features/preparation/pickLineRows";
import { ScanJournal } from "@/features/preparation/ScanJournal";
import { scanClock, type PickLine, type ScanEntryMode, type ScanLogEntry, type ScanTone } from "@/features/preparation/pickScan";
import { apiErrorMessage } from "@/shared/api/distribution";
import {
  usePickSession,
  usePreparationMutations,
  useRecentPickLists,
  applyBarcodeScan,
  getPickGroupLocations,
  pickListDueDate,
  pickListIncomplete,
  usePickListOrderChanged,
  type DeliveryNoteResult,
  type PickGroup,
} from "@/shared/api/preparation";
import { PickListQueue } from "@/features/preparation/PickListQueue";
import { OrderModifiedAlert } from "@/features/preparation/OrderModifiedAlert";
import { ReturnControlPanel, usePendingReturnRoutes } from "@/features/preparation/ReturnControlPanel";
import { PickFloorView, type ScanSnapshot } from "@/features/preparation/PickFloorView";
import { ScanQtyDialog, type ScanQtyPrompt } from "@/features/preparation/ScanQtyDialog";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertsChip } from "@/features/today/AlertsSummary";
import { cn } from "@/lib/utils";
import { formatLongDate, formatQuantity } from "@/shared/format";

const PREPARATION_STEPS = ["Sélection", "Prélèvement", "Contrôle"] as const;

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const formatQty = formatQuantity;

const PICK_QTY_SAVE_MS = 400;

function groupPickedQty(group: PickGroup, picked: Record<string, number>) {
  return getPickGroupLocations(group).reduce(
    (sum, location) => sum + (picked[location.name] ?? location.picked_qty ?? 0),
    0,
  );
}

function locationIdentity(pickLists: Array<{ locations?: Array<{ name: string }> }>) {
  return pickLists
    .flatMap((pickList) => (pickList.locations || []).map((location) => location.name))
    .sort()
    .join("\0");
}

function qtyByLocation(pickLists: Array<{ locations?: Array<{ name: string; picked_qty?: number }> }>) {
  const next: Record<string, number> = {};
  pickLists.flatMap((pickList) => pickList.locations || []).forEach((location) => {
    next[location.name] = location.picked_qty ?? 0;
  });
  return next;
}

function PreparationStepBar({ current }: { current: (typeof PREPARATION_STEPS)[number] }) {
  const currentIndex = PREPARATION_STEPS.indexOf(current);
  return (
    <div className="flex w-fit items-center gap-0.5 rounded-[10px] border bg-card p-0.5" aria-label="Étapes de préparation">
      {PREPARATION_STEPS.map((step, index) => {
        const active = index === currentIndex;
        const done = index < currentIndex;
        return (
          <div
            key={step}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-3 text-[12.5px]",
              active && "bg-muted font-medium",
              !active && "text-muted-foreground",
            )}
          >
            <span className="num text-[11px] text-muted-foreground">{index + 1}</span>
            {step}
            {done ? <span className="text-[11px]" aria-hidden>✓</span> : null}
          </div>
        );
      })}
    </div>
  );
}

type PendingReset = { key: string; itemCode: string; itemName: string; picked: number; source: "location" | "floor" };

function ResetPickQtyDialog({
  target,
  onClose,
  onConfirm,
}: {
  target: PendingReset | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!target) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <p className="t-micro text-muted-foreground">Confirmation requise</p>
          <DialogTitle>Remettre à 0</DialogTitle>
          <DialogDescription>
            La quantité prélevée de {target.itemCode} · {target.itemName} ({formatQuantity(target.picked)})
            sera effacée. Cette action enregistre immédiatement 0 sur la liste.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Remettre à 0
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PickSessionSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <Skeleton className="h-[148px] w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}

function isoDateWithOffset(days: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

function printQr(note: DeliveryNoteResult) {
  const src = note.custom_qr_image || note.image;
  if (!src) return;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(
    `<html><head><title>QR ${note.name}</title></head><body style="text-align:center;font-family:sans-serif"><h2>${note.name}</h2><p>${note.customer_name || note.customer || ""}</p><img src="${src}" style="max-width:320px"/></body></html>`
  );
  win.document.close();
  win.print();
}

function PickListWorkspace({ pickListNames, creationConfirmed, onBack }: { pickListNames: string[]; creationConfirmed: boolean; onBack: () => void }) {
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [createdNotes, setCreatedNotes] = useState<DeliveryNoteResult[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [confirmingBl, setConfirmingBl] = useState(false);
  const [scanValue, setScanValue] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [scanError, setScanError] = useState("");
  const [scanTone, setScanTone] = useState<ScanTone>("idle");
  const [scanIncrement, setScanIncrement] = useState(1);
  const [scanMode, setScanMode] = useState<ScanEntryMode>("unit");
  const [pendingQty, setPendingQty] = useState<(ScanQtyPrompt & { code: string; locationName: string; warehouse?: string }) | null>(null);
  const [pendingReset, setPendingReset] = useState<PendingReset | null>(null);
  const [scanLog, setScanLog] = useState<ScanLogEntry[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [lastScan, setLastScan] = useState<ScanSnapshot | null>(null);
  const [lastScannedKey, setLastScannedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [orderChangedNotice, setOrderChangedNotice] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);
  const confirmBlButtonRef = useRef<HTMLButtonElement>(null);
  const pickedRef = useRef<Record<string, number>>({});
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanSeq = useRef(0);
  const qtyTouched = useRef(false);

  const isMobile = useIsMobile();
  const { data, mutate, error, isLoading } = usePickSession(pickListNames);
  const { updateQuantities, submitPickList, scanPickItem, saving, submitting, scanning, acknowledgeModification, acknowledging } = usePreparationMutations();

  const session = data?.message;
  const pickLists = session?.pick_lists || [];
  const draftOpen = pickLists.some((item) => item.docstatus === 0);
  const modificationPending = Boolean(session?.modification_pending);
  const floorMode = isMobile && draftOpen && !reviewing;
  const locationKey = locationIdentity(pickLists);
  const pickListsRef = useRef(pickLists);
  const modificationPendingRef = useRef(modificationPending);
  const updateQuantitiesRef = useRef(updateQuantities);
  pickListsRef.current = pickLists;
  modificationPendingRef.current = modificationPending;
  updateQuantitiesRef.current = updateQuantities;

  const persistQty = async () => {
    if (modificationPendingRef.current || !qtyTouched.current) return;
    const current = pickedRef.current;
    try {
      for (const pickList of pickListsRef.current.filter((item) => item.docstatus === 0)) {
        await updateQuantitiesRef.current(
          pickList.name,
          (pickList.locations || []).map((location) => ({
            name: location.name,
            picked_qty: current[location.name] ?? 0,
          })),
        );
      }
    } catch (mutationError) {
      setErrorMessage(apiErrorMessage(mutationError));
    }
  };

  const flushPersist = () => {
    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    void persistQty();
  };

  const schedulePersist = () => {
    if (modificationPendingRef.current) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      persistTimer.current = null;
      void persistQty();
    }, PICK_QTY_SAVE_MS);
  };

  usePickListOrderChanged(pickListNames, (reason) => {
    setOrderChangedNotice(reason || "Commande modifiée, la liste a été actualisée.");
    flushPersist();
    mutate();
  });

  useEffect(() => {
    if (session?.order_changed_notice) {
      setOrderChangedNotice(session.order_changed_notice);
    }
  }, [session?.order_changed_notice]);

  useEffect(() => {
    void import("html5-qrcode");
  }, []);

  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;

  useEffect(() => {
    if (!locationKey) {
      qtyTouched.current = false;
      return;
    }
    let cancelled = false;
    const apply = (lists: typeof pickLists) => {
      if (cancelled || qtyTouched.current) return;
      const next = qtyByLocation(lists.length ? lists : pickListsRef.current);
      pickedRef.current = next;
      setPicked(next);
    };
    apply(pickListsRef.current);
    void Promise.resolve(mutateRef.current()).then((result) => {
      const lists = (result as { message?: { pick_lists?: typeof pickLists } } | undefined)?.message?.pick_lists;
      apply(Array.isArray(lists) ? lists : pickListsRef.current);
    });
    return () => {
      cancelled = true;
    };
  }, [locationKey]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushPersist();
    };
    window.addEventListener("pagehide", flushPersist);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flushPersist);
      document.removeEventListener("visibilitychange", onHide);
      flushPersist();
    };
  }, []);

  const grouped = session?.grouped || [];
  const blCount = session?.sales_orders?.length || pickLists.length;
  const submitted = pickLists.length > 0 && pickLists.every((item) => item.docstatus === 1);
  const locations = pickLists.flatMap((pickList) => pickList.locations || []);
  const pickLines: PickLine[] = grouped.flatMap((group) =>
    getPickGroupLocations(group).map((location) => ({
      key: location.name,
      itemCode: location.item_code,
      itemName: location.item_name || location.item_code,
      warehouse: location.warehouse,
      salesOrder: location.sales_order,
      requested: location.stock_qty,
      uom: location.stock_uom || location.uom,
    })),
  );
  const varianceGroups = grouped.filter((group) => groupPickedQty(group, picked) !== group.stock_qty);
  const totals = {
    requested: grouped.reduce((sum, group) => sum + group.stock_qty, 0),
    picked: grouped.reduce((sum, group) => sum + groupPickedQty(group, picked), 0),
    remaining: grouped.reduce((sum, group) => sum + Math.max(0, group.stock_qty - groupPickedQty(group, picked)), 0),
    variance: varianceGroups.length,
  };
  const scanTotals = {
    picked: totals.picked,
    requested: totals.requested,
    percent: totals.requested ? Math.round((totals.picked / totals.requested) * 100) : 0,
    complete: totals.requested > 0 && totals.remaining === 0,
    partialLines: pickLines.filter((line) => {
      const value = picked[line.key] ?? 0;
      return value > 0 && value < line.requested;
    }).length,
  };
  const reviewBlocked = totals.remaining > 0;
  const notes = createdNotes.length
    ? createdNotes
    : session?.delivery_notes?.length
      ? session.delivery_notes
      : pickLists.flatMap((pickList) => pickList.delivery_notes || []);
  const title =
    pickLists.length === 1
      ? pickLists[0].name
      : pickLists.length > 1
        ? `${pickLists.length} listes de prélèvement`
        : pickListNames.length === 1
          ? pickListNames[0]
          : "Session de préparation";
  const description = submitted
    ? "Liste soumise. Les bons de livraison sont ci-dessous."
    : reviewing
      ? "Vérifiez les écarts avant de créer les BL."
      : "Scannez les articles, puis passez au contrôle.";

  useEffect(() => {
    if (confirmingBl) confirmBlButtonRef.current?.focus();
  }, [confirmingBl]);

  const fillRequested = () => {
    if (!session || modificationPending) return;
    const next: Record<string, number> = {};
    pickLists.flatMap((pickList) => pickList.locations || []).forEach((loc) => {
      next[loc.name] = loc.stock_qty || loc.qty || 0;
    });
    pickedRef.current = next;
    setPicked(next);
    qtyTouched.current = true;
    schedulePersist();
  };

  const handleAcknowledge = async () => {
    const orders = session?.pending_sales_orders?.length
      ? session.pending_sales_orders
      : session?.sales_orders || [];
    if (!orders.length) return;
    setErrorMessage("");
    try {
      for (const salesOrder of orders) {
        await acknowledgeModification(salesOrder);
      }
      setOrderChangedNotice("");
      await mutate();
    } catch (mutationError) {
      setErrorMessage(apiErrorMessage(mutationError));
    }
  };

  const handleSubmit = async () => {
    if (modificationPending) return;
    setErrorMessage("");
    try {
      if (persistTimer.current) {
        clearTimeout(persistTimer.current);
        persistTimer.current = null;
      }
      await persistQty();
      const notes: DeliveryNoteResult[] = [];
      for (const pickList of pickLists) {
        const result = await submitPickList(pickList.name);
        notes.push(...(result.delivery_notes || []));
      }
      setCreatedNotes(notes);
      setReviewing(false);
      setConfirmingBl(false);
      mutate();
    } catch (mutationError) {
      setConfirmingBl(false);
      setErrorMessage(apiErrorMessage(mutationError));
    }
  };

  const pushLog = (entry: Omit<ScanLogEntry, "id" | "time">) => {
    scanSeq.current += 1;
    setScanLog((current) => [{ ...entry, id: `scan-${scanSeq.current}`, time: scanClock() }, ...current].slice(0, 20));
  };

  const snapshotFor = (
    itemCode: string,
    itemName: string,
    warehouse: string | undefined,
    pickedState: Record<string, number>,
    increment: number,
  ): ScanSnapshot => {
    const group =
      grouped.find((item) => item.item_code === itemCode && (item.warehouse || "") === (warehouse || "")) ||
      grouped.find((item) => item.item_code === itemCode);
    const requested = group?.stock_qty ?? 0;
    const pickedQty = group ? groupPickedQty(group, pickedState) : 0;
    return {
      itemCode,
      itemName,
      warehouse: group?.warehouse || warehouse,
      picked: pickedQty,
      requested,
      remaining: Math.max(0, requested - pickedQty),
      increment,
    };
  };

  const recordAppliedScan = (
    applied: Extract<ReturnType<typeof applyBarcodeScan>, { ok: true }>,
    itemName: string,
    barcode: string,
    increment: number,
  ) => {
    const previous = pickedRef.current[applied.locationName] ?? 0;
    const next = { ...pickedRef.current, [applied.locationName]: applied.nextQty };
    pickedRef.current = next;
    setPicked(next);
    setLastScannedKey(applied.locationName);
    const snapshot = snapshotFor(applied.itemCode, itemName, applied.warehouse, next, increment);
    setLastScan(snapshot);
    const complete = applied.nextQty >= (locations.find((location) => location.name === applied.locationName)?.stock_qty ?? snapshot.requested);
    setScanMessage(`${applied.itemCode} · ${applied.nextQty} / ${snapshot.requested}${complete ? " — ligne complète" : ""}`);
    setScanTone("ok");
    pushLog({
      key: applied.locationName,
      code: barcode,
      label: itemName,
      amount: applied.nextQty - previous,
      tone: "ok",
    });
    qtyTouched.current = true;
    schedulePersist();
  };

  const applyScan = async (raw: string, restoreFocus = true) => {
    const value = raw.trim();
    if (!value || reviewing || scanning || !draftOpen || modificationPending) return;
    setScanMessage("");
    setScanError("");
    setScanTone("idle");
    let openedQty = false;
    try {
      const result = await scanPickItem(value, pickListNames);
      const increment = result.increment || 1;
      setScanIncrement(increment);
      const itemName = result.item_name || result.item_code;
      const applied = applyBarcodeScan(locations, pickedRef.current, result.item_code, increment);
      if (!applied.ok) {
        const matched = locations.find((location) => location.item_code === result.item_code);
        if (matched) setLastScannedKey(matched.name);
        if (applied.reason === "already_complete") {
          setLastScan(snapshotFor(result.item_code, itemName, matched?.warehouse, pickedRef.current, increment));
          setScanMessage(`Quantité déjà atteinte pour ${result.item_code} — scan ignoré.`);
          setScanTone("warn");
          pushLog({
            key: matched?.name,
            code: value,
            label: `${itemName} · quantité déjà atteinte`,
            amount: 0,
            tone: "warn",
          });
        } else {
          setScanError("Cet article n'est pas dans la session de préparation.");
          setScanTone("error");
          pushLog({ code: value, label: "Code non reconnu", amount: 0, tone: "error" });
        }
        return;
      }
      if (scanMode === "qty") {
        const current = pickedRef.current[applied.locationName] ?? 0;
        const requested = locations.find((location) => location.name === applied.locationName)?.stock_qty ?? 0;
        openedQty = true;
        setPendingQty({
          code: value,
          locationName: applied.locationName,
          warehouse: applied.warehouse,
          itemCode: applied.itemCode,
          itemName,
          picked: current,
          requested,
          remaining: Math.max(0, requested - current),
          increment,
          uom: locations.find((location) => location.name === applied.locationName)?.stock_uom
            || locations.find((location) => location.name === applied.locationName)?.uom,
        });
        setLastScannedKey(applied.locationName);
        return;
      }
      recordAppliedScan(applied, itemName, value, increment);
    } catch (scanException) {
      const detail = apiErrorMessage(scanException);
      setScanError(
        !detail || detail === "There was an error." || detail === "Une erreur inattendue est survenue."
          ? `Code inconnu : ${value} — aucune ligne de cette liste.`
          : detail,
      );
      setScanTone("error");
      pushLog({ code: value, label: "Code non reconnu", amount: 0, tone: "error" });
    } finally {
      setScanValue("");
      if (restoreFocus && !openedQty) scanInputRef.current?.focus();
    }
  };

  const confirmQtyScan = (qty: number) => {
    const pending = pendingQty;
    setPendingQty(null);
    if (!pending) return;
    const applied = applyBarcodeScan(locations, pickedRef.current, pending.itemCode, qty);
    if (!applied.ok) {
      if (applied.reason === "already_complete") {
        setScanMessage(`Quantité déjà atteinte pour ${pending.itemCode} — scan ignoré.`);
        setScanTone("warn");
      }
      scanInputRef.current?.focus();
      return;
    }
    recordAppliedScan(applied, pending.itemName, pending.code, qty);
    scanInputRef.current?.focus();
  };

  const cancelQtyScan = () => {
    setPendingQty(null);
    scanInputRef.current?.focus();
  };

  const openCamera = () => {
    setCameraOpen(true);
  };

  const handleScan = async (event: FormEvent) => {
    event.preventDefault();
    await applyScan(scanValue);
  };

  const setLocationQty = (name: string, value: number) => {
    const location = locations.find((item) => item.name === name);
    const requested = location?.stock_qty ?? 0;
    const nextQty = Math.max(0, Math.min(requested, value));
    setPicked((prev) => {
      const next = { ...prev, [name]: nextQty };
      pickedRef.current = next;
      return next;
    });
    setLastScannedKey(name);
    qtyTouched.current = true;
    schedulePersist();
  };

  const resetFloorLine = (key: string) => {
    const group = grouped.find((item) => `${item.item_code}-${item.warehouse || ""}` === key);
    if (!group || modificationPending) return;
    const next = { ...pickedRef.current };
    getPickGroupLocations(group).forEach((location) => {
      next[location.name] = 0;
    });
    pickedRef.current = next;
    setPicked(next);
    qtyTouched.current = true;
    if (lastScan && `${lastScan.itemCode}-${lastScan.warehouse || ""}` === key) {
      setLastScan({ ...lastScan, picked: 0, remaining: lastScan.requested });
    }
    schedulePersist();
  };

  const requestResetLocation = (key: string) => {
    const location = locations.find((item) => item.name === key);
    setPendingReset({
      key,
      itemCode: location?.item_code || key,
      itemName: location?.item_name || location?.item_code || "",
      picked: pickedRef.current[key] ?? 0,
      source: "location",
    });
  };

  const requestResetFloor = (key: string) => {
    const group = grouped.find((item) => `${item.item_code}-${item.warehouse || ""}` === key);
    setPendingReset({
      key,
      itemCode: group?.item_code || key,
      itemName: group?.item_name || group?.item_code || "",
      picked: group ? groupPickedQty(group, pickedRef.current) : 0,
      source: "floor",
    });
  };

  const confirmPendingReset = () => {
    if (!pendingReset) return;
    if (pendingReset.source === "floor") resetFloorLine(pendingReset.key);
    else setLocationQty(pendingReset.key, 0);
    setPendingReset(null);
  };

  const undoScan = (entry: ScanLogEntry) => {
    if (!entry.key || entry.amount <= 0) return;
    setLocationQty(entry.key, (pickedRef.current[entry.key] ?? 0) - entry.amount);
    setScanLog((current) => current.filter((item) => item.id !== entry.id));
  };

  const reviewColumns: Array<DataTableColumn<PickGroup>> = [
    {
      id: "item",
      header: "Article",
      cell: (group) => (
        <div>
          <p className="font-medium">{group.item_code} · {group.item_name}</p>
          <p className="t-meta text-muted-foreground">{group.warehouse || "Emplacement non défini"}</p>
        </div>
      ),
    },
    {
      id: "requested",
      header: "Demandé",
      numeric: true,
      width: "100px",
      cell: (group) => formatQty(group.stock_qty),
    },
    {
      id: "picked",
      header: "Prélevé",
      numeric: true,
      width: "100px",
      cell: (group) => formatQty(groupPickedQty(group, picked)),
    },
    {
      id: "diff",
      header: "Écart",
      numeric: true,
      width: "100px",
      cell: (group) => {
        const difference = groupPickedQty(group, picked) - group.stock_qty;
        return (
          <span className={difference === 0 ? "text-emerald-700" : "text-amber-700"}>
            {difference > 0 ? "+" : ""}{formatQty(difference)}
          </span>
        );
      },
    },
  ];

  const currentStep: (typeof PREPARATION_STEPS)[number] =
    pickLists.every((item) => item.docstatus === 1) || reviewing ? "Contrôle" : "Prélèvement";

  const floorLines = grouped.map((group) => {
    const pickedQty = groupPickedQty(group, picked);
    return {
      key: `${group.item_code}-${group.warehouse || ""}`,
      itemCode: group.item_code,
      itemName: group.item_name || group.item_code,
      warehouse: group.warehouse,
      picked: pickedQty,
      requested: group.stock_qty,
      remaining: Math.max(0, group.stock_qty - pickedQty),
      complete: pickedQty >= group.stock_qty,
    };
  });
  const remainingArticles = floorLines.filter((line) => !line.complete).length;

  if (floorMode) {
    return (
      <div className="flex flex-col gap-4">
        {creationConfirmed && (
          <Alert role="status" className="border-emerald-200 bg-emerald-50 text-emerald-900">
            <CheckCircle className="text-emerald-700" />
            <AlertDescription className="text-emerald-800">
              <strong>Liste de prélèvement créée avec succès.</strong>
              <span>{pickListNames.join(", ")}</span>
            </AlertDescription>
          </Alert>
        )}
        {modificationPending ? (
          <OrderModifiedAlert
            accepting={acknowledging}
            onAccept={() => void handleAcknowledge()}
            description="La liste a été actualisée. Confirmez que vous avez pris connaissance des changements avant de prélever."
          />
        ) : orderChangedNotice ? (
          <Alert role="status" className="border-amber-200 bg-amber-50 text-amber-950">
            <AlertTriangle className="text-amber-700" />
            <AlertDescription>
              <strong>Commande modifiée, la liste a été actualisée.</strong>
            </AlertDescription>
          </Alert>
        ) : null}
        {(error || errorMessage) && (
          <Alert>
            <AlertDescription>{errorMessage || "Impossible de charger la liste de prélèvement."}</AlertDescription>
          </Alert>
        )}
        {isLoading && !grouped.length ? (
          <PickSessionSkeleton />
        ) : (
          <PickFloorView
            title={title}
            remainingArticles={remainingArticles}
            lines={floorLines}
            lastScan={lastScan}
            scanError={scanError}
            scanMessage={scanMessage}
            scanning={scanning}
            scanValue={scanValue}
            onScanValueChange={setScanValue}
            onScanSubmit={handleScan}
            onOpenCamera={openCamera}
            cameraOpen={cameraOpen}
            onCameraOpenChange={setCameraOpen}
            onApplyScan={(text) => void applyScan(text, false)}
            onBack={onBack}
            onReview={() => {
              if (!modificationPending && totals.remaining === 0) setReviewing(true);
            }}
            onFillRequested={fillRequested}
            onResetLine={requestResetFloor}
            busy={scanning || submitting || saving || modificationPending}
            scanInputRef={scanInputRef}
            scanMode={scanMode}
            onScanModeChange={setScanMode}
          />
        )}
        <ScanQtyDialog prompt={pendingQty} onConfirm={confirmQtyScan} onCancel={cancelQtyScan} />
        <ResetPickQtyDialog
          target={pendingReset}
          onClose={() => setPendingReset(null)}
          onConfirm={confirmPendingReset}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Entrepôt"
        breadcrumb={
          <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
            <ArrowLeft />
            Listes
          </Button>
        }
        title={title}
        meta={
          session ? (
            <StatusBadge tone={submitted ? "success" : "info"}>
              {submitted ? "Soumise" : "Brouillon"}
            </StatusBadge>
          ) : undefined
        }
        description={description}
        actions={
          draftOpen && !reviewing ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={fillRequested} disabled={modificationPending}>
                Tout prélever
              </Button>
              <Button
                size="sm"
                onClick={() => setReviewing(true)}
                disabled={submitting || saving || isLoading || modificationPending || reviewBlocked}
                title={reviewBlocked ? `Encore ${formatQty(totals.remaining)} unité${totals.remaining > 1 ? "s" : ""} à prélever` : undefined}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Contrôle final
              </Button>
            </div>
          ) : undefined
        }
      />

      <PreparationStepBar current={currentStep} />

      {creationConfirmed && (
        <Alert role="status" className="border-emerald-200 bg-emerald-50 text-emerald-900">
          <CheckCircle className="text-emerald-700" />
          <AlertDescription className="text-emerald-800">
            <strong>Liste de prélèvement créée avec succès.</strong>
            <span>{pickListNames.join(", ")}</span>
          </AlertDescription>
        </Alert>
      )}

      {modificationPending ? (
        <OrderModifiedAlert
          accepting={acknowledging}
          onAccept={() => void handleAcknowledge()}
          description="La liste a été actualisée. Confirmez que vous avez pris connaissance des changements avant de prélever."
        />
      ) : orderChangedNotice ? (
        <Alert role="status" className="border-amber-200 bg-amber-50 text-amber-950">
          <AlertTriangle className="text-amber-700" />
          <AlertDescription>
            <strong>Commande modifiée, la liste a été actualisée.</strong>
          </AlertDescription>
        </Alert>
      ) : null}

      {createdNotes.length > 0 && (
        <Alert role="status" className="border-emerald-200 bg-emerald-50 text-emerald-900">
          <CheckCircle className="text-emerald-700" />
          <AlertDescription className="text-emerald-800">
            <strong>Bons de livraison créés avec succès.</strong>
            <span> {createdNotes.map((note) => note.name).join(", ")}</span>
          </AlertDescription>
        </Alert>
      )}

      {(error || errorMessage) && (
        <Alert>
          <AlertDescription>{errorMessage || "Impossible de charger la liste de prélèvement."}</AlertDescription>
        </Alert>
      )}

      {isLoading && !grouped.length && <PickSessionSkeleton />}

      {(!isLoading || grouped.length > 0) && (
        <>
          {!reviewing && draftOpen ? (
            <ScanConsole
              lines={pickLines}
              picked={picked}
              lastKey={lastScannedKey}
              feedback={{
                text: scanning ? "Lecture…" : scanError || scanMessage,
                tone: scanning ? "idle" : scanTone,
              }}
              scanValue={scanValue}
              onScanValueChange={setScanValue}
              onScan={(code) => void applyScan(code)}
              scanMode={scanMode}
              onScanModeChange={setScanMode}
              step={scanIncrement}
              totals={scanTotals}
              inputRef={scanInputRef}
              disabled={scanning || submitting || saving || modificationPending}
            />
          ) : null}

          {!isLoading && grouped.length === 0 && (
            <EmptyState
              icon={Package}
              title="Aucune ligne"
              description="Cette liste de prélèvement ne contient aucun article."
            />
          )}

          {!reviewing && grouped.length > 0 ? (
            <PickLinesTable
              lines={pickLines}
              picked={picked}
              lastKey={lastScannedKey}
              step={scanIncrement}
              query={search}
              onQueryChange={setSearch}
              pendingOnly={pendingOnly}
              onPendingOnlyChange={setPendingOnly}
              onSetQuantity={setLocationQty}
              onResetLine={requestResetLocation}
              readOnly={submitted || modificationPending}
            />
          ) : null}

          {!reviewing && draftOpen ? <ScanJournal log={scanLog} onUndo={undoScan} /> : null}

          {reviewing && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
                  <div>
                    <h3 className="font-semibold text-amber-900">Vérifiez les écarts avant création des BL</h3>
                    <p className="mt-1 text-sm text-amber-800">
                      Après confirmation, les quantités sont enregistrées sur le serveur, la liste de prélèvement est soumise et les bons de livraison sont créés.
                    </p>
                  </div>
                </div>
              </div>
              <div className="hidden md:block">
                <DataTable
                  label="Contrôle des écarts"
                  columns={reviewColumns}
                  rows={grouped}
                  rowKey={(group) => `${group.item_code}-${group.warehouse}-review`}
                />
              </div>
              <div className="space-y-2 md:hidden">
                {grouped.map((group) => {
                  const pickedTotal = groupPickedQty(group, picked);
                  const difference = pickedTotal - group.stock_qty;
                  return (
                    <div key={`${group.item_code}-${group.warehouse}-review`} className="grid gap-3 rounded-xl border border-hairline p-4 sm:grid-cols-[1fr_auto_auto_auto]">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{group.item_code} · {group.item_name}</p>
                        <p className="text-xs text-muted-foreground">{group.warehouse || "Emplacement non défini"}</p>
                      </div>
                      <p className="text-sm"><span className="block text-xs text-muted-foreground">Demandé</span><strong>{formatQty(group.stock_qty)}</strong></p>
                      <p className="text-sm"><span className="block text-xs text-muted-foreground">Prélevé</span><strong>{formatQty(pickedTotal)}</strong></p>
                      <p className={`text-sm ${difference === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                        <span className="block text-xs">Écart</span>
                        <strong>{difference > 0 ? "+" : ""}{formatQty(difference)}</strong>
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setReviewing(false)}>Retour au prélèvement</Button>
                <Button onClick={() => setConfirmingBl(true)} disabled={submitting || saving || modificationPending}>
                  <CheckCircle />
                  Confirmer et créer les BL
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={confirmingBl} onOpenChange={(open) => !open && !submitting && !saving && setConfirmingBl(false)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div
                className={`shrink-0 rounded-md p-2 ${varianceGroups.length ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-700"}`}
              >
                {varianceGroups.length ? <AlertTriangle className="size-5" /> : <Package className="size-5" />}
              </div>
              <div>
                <DialogTitle>Confirmer la création des BL</DialogTitle>
                <DialogDescription className="mt-1">
                  {blCount > 1
                    ? `${blCount} bons de livraison seront créés, un par commande de la session.`
                    : "Un bon de livraison sera créé pour la commande de cette session."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <DialogBody>
            <div className="space-y-2 rounded-md border border-hairline bg-surface-subtle p-3 text-sm">
              <p><strong>{pickLists.length}</strong> {pickLists.length > 1 ? "listes de prélèvement seront soumises" : "liste de prélèvement sera soumise"}.</p>
              {varianceGroups.length > 0 && (
                <p className="text-amber-800">
                  {varianceGroups.length} article{varianceGroups.length > 1 ? "s" : ""} avec écart : les BL partiront des quantités prélevées, pas des quantités demandées.
                </p>
              )}
            </div>

            <p className="mt-4 t-meta text-muted-foreground">
              Cette action enregistre les quantités, soumet les listes et crée les BL. Elle ne peut pas être annulée.
            </p>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmingBl(false)} disabled={submitting || saving}>
              Annuler
            </Button>
            <Button ref={confirmBlButtonRef} type="button" onClick={handleSubmit} disabled={submitting || saving}>
              <Package />
              {submitting || saving ? "Création…" : "Créer les BL"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScanQtyDialog prompt={pendingQty} onConfirm={confirmQtyScan} onCancel={cancelQtyScan} />
      <ResetPickQtyDialog
        target={pendingReset}
        onClose={() => setPendingReset(null)}
        onConfirm={confirmPendingReset}
      />

      {notes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bons créés ({notes.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {notes.map((note) => (
              <div key={note.name} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <div className="font-medium text-sm">{note.name}</div>
                  <div className="text-xs text-muted-foreground">{note.customer_name || note.customer}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{note.custom_statut || note.status || "Préparé"}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => printQr(note)}
                    disabled={!(note.custom_qr_image || note.image)}
                  >
                    <QrCode className="w-4 h-4 mr-1" />
                    <Printer className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function PreparationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const pickListNames = (searchParams.get("pick_lists") || searchParams.get("pick_list") || "").split(",").filter(Boolean);
  const tab = searchParams.get("tab") === "retours" ? "retours" : "listes";
  const { routes: pendingReturns } = usePendingReturnRoutes();
  const { data: recentPickLists } = useRecentPickLists();
  const returnCount = pendingReturns.length;
  const lists = recentPickLists?.message || [];
  const draftListCount = lists.filter((row) => row.docstatus === 0).length;
  const today = isoDateWithOffset(0);
  const completeLists = lists.filter((row) => pickListIncomplete(row));
  const overdueLists = lists.filter((row) => {
    const due = pickListDueDate(row);
    return Boolean(due && due < today);
  });
  const alertCount = (completeLists.length ? 1 : 0) + (overdueLists.length ? 1 : 0);
  const [alertsOpen, setAlertsOpen] = useState(false);

  const openPickLists = (names: string[], created = false) => {
    setSearchParams({ pick_lists: names.join(","), ...(created ? { created: "1" } : {}) });
  };

  if (pickListNames.length) {
    return (
      <PickListWorkspace
        pickListNames={pickListNames}
        creationConfirmed={searchParams.get("created") === "1"}
        onBack={() => {
          setSearchParams({});
          navigate("/preparation");
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={`Entrepôt · ${formatLongDate(today)}`}
        title="Préparation"
        meta={
          tab === "listes" ? (
            <AlertsChip count={alertCount} open={alertsOpen} onToggle={() => setAlertsOpen((open) => !open)} />
          ) : undefined
        }
      />
      {tab === "listes" && alertsOpen && alertCount > 0 && (
        <section aria-label="Anomalies" className="grid gap-3 sm:grid-cols-2">
          {completeLists.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-destructive/25 bg-destructive/5 p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-3.5 text-destructive" />
                <p className="text-sm font-semibold text-destructive">À compléter</p>
                <span className="num rounded bg-destructive/10 px-1.5 py-px text-[11px] text-destructive">
                  {completeLists.length}
                </span>
              </div>
              <p className="t-meta text-muted-foreground">
                {completeLists.length} liste{completeLists.length > 1 ? "s" : ""} avec un reliquat à prélever.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto w-fit p-0 text-xs font-medium text-destructive"
                onClick={() => {
                  setAlertsOpen(false);
                  setSearchParams({ complete: "1" });
                }}
              >
                Filtrer les reliquats
              </Button>
            </div>
          )}
          {overdueLists.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-warning/30 bg-warning/5 p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-3.5 text-warning-foreground" />
                <p className="text-sm font-semibold text-warning-foreground">Échéances dépassées</p>
                <span className="num rounded bg-warning/10 px-1.5 py-px text-[11px] text-warning-foreground">
                  {overdueLists.length}
                </span>
              </div>
              <p className="t-meta text-muted-foreground">
                {overdueLists.length} liste{overdueLists.length > 1 ? "s" : ""} dont la livraison est passée.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto w-fit p-0 text-xs font-medium"
                onClick={() => {
                  setAlertsOpen(false);
                  setSearchParams({ dateScope: "overdue" });
                }}
              >
                Filtrer sur les retards
              </Button>
            </div>
          )}
        </section>
      )}
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setSearchParams(value === "retours" ? { tab: "retours" } : {});
        }}
        aria-label="Sections préparation"
      >
        <TabsList variant="line">
          <TabsTrigger value="listes">
            Listes
            <Badge variant={draftListCount > 0 ? "default" : "secondary"} aria-label={`${draftListCount} brouillon${draftListCount > 1 ? "s" : ""}`}>
              {draftListCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="retours">
            Retours
            <Badge variant={returnCount > 0 ? "default" : "secondary"} aria-label={`${returnCount} à traiter`}>
              {returnCount}
            </Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="listes" className="pt-5">
          <PickListQueue onOpenPickLists={openPickLists} />
        </TabsContent>
        <TabsContent value="retours" className="pt-5">
          <ReturnControlPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default PreparationPage;
