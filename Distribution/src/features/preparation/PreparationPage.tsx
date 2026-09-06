import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FilterSelect } from "@/components/FilterSelect";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  OrderItemsList,
  OrderItemsSubGrid,
  PreparationSubTableGrid,
} from "@/features/preparation/PreparationSubTableGrid";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  ClipboardList,
  Package,
  Printer,
  QrCode,
} from "lucide-react";
import { ScanConsole } from "@/features/preparation/ScanConsole";
import { PickLinesTable } from "@/features/preparation/pickLineRows";
import { ScanJournal } from "@/features/preparation/ScanJournal";
import { scanClock, type PickLine, type ScanLogEntry, type ScanTone } from "@/features/preparation/pickScan";
import { apiErrorMessage } from "@/shared/api/distribution";
import {
  usePickSession,
  usePreparationMutations,
  usePreparationQueue,
  useRecentPickLists,
  applyBarcodeScan,
  getPickGroupLocations,
  orderIsModified,
  orderReadyToComplete,
  usePickListOrderChanged,
  type DeliveryNoteResult,
  type PickGroup,
  type SalesOrderRow,
} from "@/shared/api/preparation";
import { PickListQueue } from "@/features/preparation/PickListQueue";
import { OrderModifiedAlert } from "@/features/preparation/OrderModifiedAlert";
import { ReturnControlPanel, usePendingReturnRoutes } from "@/features/preparation/ReturnControlPanel";
import { PickFloorView, type ScanSnapshot } from "@/features/preparation/PickFloorView";
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
import { ListStateIcon } from "@/features/preparation/ListStateIcon";
import {
  PreparationMoreFilters,
  PreparationQueueShell,
  PreparationSelectionBar,
  preparationChipClass,
} from "@/features/preparation/PreparationQueueShell";
import { PreparationStageKpis, type PreparationStage } from "@/features/preparation/PreparationStageKpis";
import {
  listStateForOrder,
  orderPickListNames,
  orderPickProgress,
  preparationOrderColumns,
  remainingOf,
} from "@/features/preparation/preparationOrderColumns";
import { salesOrderDeskStatus, orderPickListState } from "@/shared/design/statusTone";
import { cn } from "@/lib/utils";
import { formatLongDate, formatQuantity, formatShortDate } from "@/shared/format";

const PREPARATION_STEPS = ["Sélection", "Prélèvement", "Contrôle"] as const;

type DateScope = "all" | "today" | "tomorrow" | "overdue";
type ListFilter = "all" | "none" | "draft" | "submitted";
type StockFilter = "all" | "shortage" | "complete";

function dateScopeFromParam(value: string | null): DateScope {
  if (value === "today" || value === "tomorrow" || value === "overdue") return value;
  return "all";
}

function stockFilterFromParam(searchParams: URLSearchParams): StockFilter {
  if (searchParams.get("complete") === "1") return "complete";
  if (searchParams.get("shortage") === "1") return "shortage";
  return "all";
}

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const formatQty = formatQuantity;

function groupPickedQty(group: PickGroup, picked: Record<string, number>) {
  return getPickGroupLocations(group).reduce(
    (sum, location) => sum + (picked[location.name] ?? location.picked_qty ?? 0),
    0,
  );
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

function PickSessionSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <Skeleton className="h-[148px] w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}

function stockShortages(order: SalesOrderRow) {
  return order.stock_shortages || [];
}

function OpenDraftListsButton({
  names,
  onOpen,
  disabled,
  icon,
}: {
  names: string[];
  onOpen: (names: string[]) => void;
  disabled?: boolean;
  icon?: boolean;
}) {
  const many = names.length > 1;
  const label = many
    ? `Ouvrir les ${names.length} listes de prélèvement`
    : `Ouvrir la liste ${names[0]}`;
  return (
    <Button
      type="button"
      size={icon ? "icon-sm" : "sm"}
      variant={icon ? "ghost" : "outline"}
      disabled={disabled}
      aria-label={label}
      title={icon ? label : undefined}
      onClick={() => onOpen(names)}
    >
      {icon ? <ClipboardList /> : many ? "Ouvrir les listes" : "Ouvrir la liste"}
    </Button>
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

function SalesOrderPicker({
  onOpenPickLists,
  onShowPickLists,
  presetSelection,
  requestedDateScope,
}: {
  onOpenPickLists: (names: string[], created?: boolean) => void;
  onShowPickLists: () => void;
  presetSelection?: string[];
  requestedDateScope?: DateScope;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [dateScope, setDateScope] = useState<DateScope>(() => dateScopeFromParam(searchParams.get("dateScope")));
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [wilaya, setWilaya] = useState("");
  const [commune, setCommune] = useState("");
  const [customer, setCustomer] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>(() => stockFilterFromParam(searchParams));
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Record<string, true>>({});
  const [activeStage, setActiveStage] = useState<PreparationStage["id"] | null>(null);

  const { data, error, isLoading } = usePreparationQueue();
  const isMobile = useIsMobile();

  const orders = useMemo(() => data?.message || [], [data?.message]);
  const visible = orders;
  const wilayas = useMemo(
    () => Array.from(new Set(visible.map((order) => order.custom_wilaya).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "fr")),
    [visible],
  );
  const communes = useMemo(
    () => Array.from(visible
      .filter((order) => (!wilaya || order.custom_wilaya === wilaya) && order.custom_commune)
      .reduce((values, order) => {
        const value = order.custom_commune as string;
        values.set(value, order.custom_commune_nom || value);
        return values;
      }, new Map<string, string>()))
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr")),
    [visible, wilaya],
  );
  const customers = useMemo(
    () =>
      Array.from(
        new Set(
          visible
            .map((order) => order.customer_name || order.customer)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [visible],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = isoDateWithOffset(0);
    const tomorrow = isoDateWithOffset(1);
    return visible.filter((row) => {
      const matchesSearch = !q || [row.name, row.customer, row.customer_name, row.custom_commune, row.custom_commune_nom, row.custom_wilaya]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
      if (!matchesSearch) return false;
      if (wilaya && row.custom_wilaya !== wilaya) return false;
      if (commune && row.custom_commune !== commune) return false;
      if (customer && (row.customer_name || row.customer) !== customer) return false;
      if (listFilter !== "all" && orderPickListState(row) !== listFilter) return false;

      const orderDate = row.delivery_date || row.transaction_date || "";
      if (dateScope === "today" && orderDate !== today) return false;
      if (dateScope === "tomorrow" && orderDate !== tomorrow) return false;
      if (dateScope === "overdue" && (!orderDate || orderDate >= today)) return false;
      if (dateFrom && (!orderDate || orderDate < dateFrom)) return false;
      if (dateTo && (!orderDate || orderDate > dateTo)) return false;
      if (stockFilter === "shortage" && !stockShortages(row).length) return false;
      if (stockFilter === "complete" && !orderReadyToComplete(row)) return false;
      return true;
    });
  }, [commune, customer, dateFrom, dateScope, dateTo, listFilter, stockFilter, visible, search, wilaya]);

  const filtersActive = Boolean(
    search ||
      dateScope !== "all" ||
      dateFrom ||
      dateTo ||
      wilaya ||
      commune ||
      customer ||
      listFilter !== "all" ||
      stockFilter !== "all",
  );

  const today = isoDateWithOffset(0);
  const stages = useMemo((): PreparationStage[] => {
    const toPick = visible.filter((row) => orderPickListState(row) === "none").length;
    const inProgress = visible.filter((row) => orderPickListState(row) === "draft").length;
    const toComplete = visible.filter((row) => orderReadyToComplete(row)).length;
    const ready = visible.filter(
      (row) => orderPickListState(row) === "submitted" && !row.pick_incomplete,
    ).length;
    const shortage = visible.filter((row) => stockShortages(row).length > 0).length;
    const total = Math.max(1, toPick + inProgress + toComplete + ready);
    return [
      { id: "toPick", step: 1, title: "Sans liste", value: toPick, unit: "commandes", ratio: toPick / total },
      { id: "inProgress", step: 2, title: "En cours", value: inProgress, unit: "listes brouillon", ratio: inProgress / total },
      {
        id: "toComplete",
        step: 3,
        title: "À compléter",
        value: toComplete,
        unit: "reliquats",
        ratio: toComplete / total,
        exception: shortage ? { label: `${shortage} rupture`, tone: "danger" } : undefined,
        barTone: toComplete ? "danger" : "default",
      },
      {
        id: "ready",
        step: 4,
        title: "Prêtes à livrer",
        value: ready,
        unit: "listes soumises",
        ratio: ready / total,
        barTone: "success",
      },
    ];
  }, [visible]);

  const presetKey = (presetSelection ?? []).join("|");
  useEffect(() => {
    if (!presetSelection?.length) return;
    setSelection(Object.fromEntries(presetSelection.map((id) => [id, true as const])));
    setStockFilter("complete");
    setActiveStage("toComplete");
  }, [presetKey, presetSelection]);

  useEffect(() => {
    if (!requestedDateScope) return;
    setDateScope(requestedDateScope);
    setDateFrom("");
    setDateTo("");
    setActiveStage(null);
  }, [requestedDateScope]);

  const openDetail = (order: SalesOrderRow) => {
    navigate(`/preparation/commandes/${encodeURIComponent(order.name)}`);
  };

  const resetFilters = () => {
    setSearch("");
    setDateScope("all");
    setDateFrom("");
    setDateTo("");
    setWilaya("");
    setCommune("");
    setCustomer("");
    setListFilter("all");
    setStockFilter("all");
    setNotPicked(false);
    setActiveStage(null);
  };

  const emptyOrders = (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Package />
        </EmptyMedia>
        <EmptyTitle>{visible.length ? "Aucune commande ne correspond" : "Aucune commande"}</EmptyTitle>
        <EmptyDescription>
          {visible.length
            ? "Modifiez ou réinitialisez les filtres."
            : "Les commandes soumises apparaîtront ici, qu’une liste de prélèvement existe ou non."}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {visible.length ? (
          <Button variant="outline" size="sm" onClick={resetFilters}>
            Réinitialiser
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onShowPickLists}>
            Voir les listes
          </Button>
        )}
      </EmptyContent>
    </Empty>
  );

  const toggleMobileItems = (name: string) => {
    setExpandedOrders((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectedIds = Object.keys(selection).filter((id) => filtered.some((row) => row.name === id));
  const selectedOrders = filtered.filter((row) => selection[row.name]);
  const remainingSelected = selectedOrders.reduce((sum, row) => sum + remainingOf(row), 0);
  const selectedListNames = Array.from(
    new Set(
      selectedOrders
        .filter((row) => !orderIsModified(row))
        .flatMap((row) => orderPickListNames(row)),
    ),
  );
  const allFilteredSelected = filtered.length > 0 && filtered.every((row) => selection[row.name]);

  const toggle = (id: string) =>
    setSelection((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelection({});
      return;
    }
    setSelection(Object.fromEntries(filtered.map((row) => [row.name, true as const])));
  };

  const pickStage = (id: PreparationStage["id"]) => {
    setDateScope("all");
    setStockFilter("all");
    setListFilter("all");
    setActiveStage(id);
    if (id === "toPick") {
      setListFilter("none");
    } else if (id === "inProgress") {
      setListFilter("draft");
    } else if (id === "toComplete") {
      setStockFilter("complete");
      const names = visible.filter((row) => orderReadyToComplete(row)).map((row) => row.name);
      setSelection(Object.fromEntries(names.map((name) => [name, true as const])));
    } else {
      setListFilter("submitted");
      const names = visible
        .filter((row) => orderPickListState(row) === "submitted" && !row.pick_incomplete)
        .map((row) => row.name);
      setSelection(Object.fromEntries(names.map((name) => [name, true as const])));
    }
  };

  const orderColumns = preparationOrderColumns({
    today,
    selection,
    allFilteredSelected,
    onToggle: toggle,
    onToggleAll: toggleAll,
    onOpenDetail: openDetail,
  });

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <Alert>
          <AlertDescription>Impossible de charger les commandes à préparer.</AlertDescription>
        </Alert>
      )}

      <PreparationStageKpis stages={stages} active={activeStage} onPick={pickStage} />

      <PreparationQueueShell
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Rechercher une commande, un client, une ville…"
        searchAriaLabel="Rechercher une commande"
        chips={
          <>
            <button
              type="button"
              className={preparationChipClass(dateScope === "overdue")}
              onClick={() => {
                setDateScope((current) => (current === "overdue" ? "all" : "overdue"));
                setActiveStage(null);
              }}
            >
              <span className="size-1.5 rounded-full bg-destructive" /> Échéance dépassée
            </button>
            <button
              type="button"
              className={preparationChipClass(stockFilter === "complete")}
              onClick={() => {
                setStockFilter((current) => (current === "complete" ? "all" : "complete"));
                setActiveStage((current) => (current === "toComplete" ? null : current));
              }}
            >
              <span className="size-1.5 rounded-full bg-[#d97706]" /> À compléter
            </button>
          </>
        }
        moreFilters={
          <PreparationMoreFilters>
            <FilterSelect
              label="Échéance"
              value={dateScope}
              onChange={(value) => {
                setDateScope(value as DateScope);
                setDateFrom("");
                setDateTo("");
              }}
              options={[
                { value: "all", label: "Toutes" },
                { value: "today", label: "Aujourd’hui" },
                { value: "tomorrow", label: "Demain" },
                { value: "overdue", label: "En retard" },
              ]}
            />
            <FilterSelect
              label="Stock"
              value={stockFilter}
              onChange={(value) => setStockFilter(value as StockFilter)}
              options={[
                { value: "all", label: "Tous" },
                { value: "shortage", label: "Rupture" },
                { value: "complete", label: "À compléter" },
              ]}
            />
            <FilterSelect
              label="Liste"
              value={listFilter}
              onChange={(value) => setListFilter(value as ListFilter)}
              options={[
                { value: "all", label: "Toutes" },
                { value: "draft", label: "Brouillon" },
                { value: "submitted", label: "Soumise" },
              ]}
            />
            <FilterSelect
              label="Wilaya"
              value={wilaya || "all"}
              onChange={(value) => {
                setWilaya(value === "all" ? "" : value);
                setCommune("");
              }}
              options={[{ value: "all", label: "Toutes" }, ...wilayas.map((value) => ({ value, label: value }))]}
            />
            <FilterSelect
              label="Commune"
              value={commune || "all"}
              onChange={(value) => setCommune(value === "all" ? "" : value)}
              options={[{ value: "all", label: "Toutes" }, ...communes.map((option) => ({ value: option.value, label: option.label }))]}
            />
            <FilterSelect
              label="Client"
              value={customer || "all"}
              onChange={(value) => setCustomer(value === "all" ? "" : value)}
              options={[{ value: "all", label: "Tous" }, ...customers.map((value) => ({ value, label: value }))]}
            />
            <DateRangeFilter
              from={dateFrom}
              to={dateTo}
              onChange={(range) => {
                setDateFrom(range.from);
                setDateTo(range.to);
                setDateScope("all");
              }}
            />
          </PreparationMoreFilters>
        }
        countLabel={`${filtered.length} / ${visible.length} commandes`}
        heading={<h2 className="sr-only">Commandes ({filtered.length})</h2>}
        filtersActive={filtersActive}
        onReset={resetFilters}
        selectionBar={
          selectedIds.length > 0 ? (
            <PreparationSelectionBar
              summary={`${selectedIds.length} commande${selectedIds.length > 1 ? "s" : ""} sélectionnée${selectedIds.length > 1 ? "s" : ""}`}
              hint={
                remainingSelected > 0
                  ? `${formatQuantity(remainingSelected)} article(s) à prélever`
                  : "rien à prélever"
              }
              actionLabel={selectedListNames.length > 1 ? "Ouvrir les listes" : "Ouvrir la liste"}
              actionDisabled={selectedListNames.length === 0}
              onAction={() => onOpenPickLists(selectedListNames)}
              onClear={() => setSelection({})}
            />
          ) : undefined
        }
      >
        {isLoading && !orders.length ? (
          <Skeleton className="h-72 w-full rounded-none" aria-hidden="true" />
        ) : !filtered.length ? (
          <div className="p-4">{emptyOrders}</div>
        ) : (
          <>
            {!isMobile ? (
              <div>
                <PreparationSubTableGrid
                  label="Commandes"
                  columns={orderColumns}
                  rows={filtered}
                  getRowId={(row) => row.name}
                  expandContent={(row) => <OrderItemsSubGrid items={row.items || []} />}
                  canExpand={(row) => (row.items?.length ?? 0) > 0}
                  isLoading={isLoading && !orders.length}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2 p-3">
              {filtered.map((row) => {
                const lists = orderPickListNames(row);
                const desk = salesOrderDeskStatus(row.status);
                const items = row.items || [];
                const itemsOpen = expandedOrders.has(row.name);
                const { picked, requested, percent } = orderPickProgress(row);
                return (
                  <div key={row.name} className="flex flex-col gap-3 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Checkbox
                          checked={Boolean(selection[row.name])}
                          onCheckedChange={() => toggle(row.name)}
                          aria-label={`Sélectionner ${row.name}`}
                        />
                        <button type="button" className="min-w-0 text-left" onClick={() => openDetail(row)}>
                          <div className="num text-sm font-medium">{row.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {row.customer_name || row.customer} · {row.custom_commune_nom || row.custom_commune || "—"} ·{" "}
                            {formatShortDate(row.delivery_date || row.transaction_date)} · {row.total_qty || 0} art.
                          </div>
                        </button>
                      </div>
                      {lists.length ? (
                        <OpenDraftListsButton names={lists} onOpen={onOpenPickLists} disabled={orderIsModified(row)} />
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ListStateIcon state={listStateForOrder(row)} orderChanged={orderIsModified(row)} />
                      <StatusBadge tone={desk.tone} size="sm">{desk.label}</StatusBadge>
                      {stockShortages(row).length > 0 ? (
                        <StatusBadge tone="danger" size="sm">Stock insuffisant</StatusBadge>
                      ) : null}
                      {orderReadyToComplete(row) ? (
                        <StatusBadge tone="warning" size="sm">À compléter</StatusBadge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        role="progressbar"
                        aria-label={`Prélèvement ${formatQuantity(picked)} sur ${formatQuantity(requested)}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                        className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-muted"
                      >
                        <div className="h-full rounded-full bg-foreground" style={{ width: `${percent}%` }} />
                      </div>
                      <span className="num t-meta text-muted-foreground">
                        {formatQuantity(picked)} / {formatQuantity(requested)} · {percent} %
                      </span>
                    </div>
                    {items.length ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-expanded={itemsOpen}
                          onClick={() => toggleMobileItems(row.name)}
                        >
                          {itemsOpen ? "Masquer les articles" : `Afficher les articles (${items.length})`}
                        </Button>
                        {itemsOpen ? <OrderItemsList items={items} /> : null}
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
            )}
          </>
        )}
      </PreparationQueueShell>
    </div>
  );
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
  const scanSeq = useRef(0);

  const isMobile = useIsMobile();
  const { data, mutate, error, isLoading } = usePickSession(pickListNames);
  const { updateQuantities, submitPickList, scanPickItem, saving, submitting, scanning, acknowledgeModification, acknowledging } = usePreparationMutations();

  const session = data?.message;
  const pickLists = session?.pick_lists || [];
  const draftOpen = pickLists.some((item) => item.docstatus === 0);
  const modificationPending = Boolean(session?.modification_pending);
  const floorMode = isMobile && draftOpen && !reviewing;

  usePickListOrderChanged(pickListNames, (reason) => {
    setOrderChangedNotice(reason || "Commande modifiée, la liste a été actualisée.");
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

  useEffect(() => {
    if (!session?.pick_lists) return;
    const next: Record<string, number> = {};
    session.pick_lists.flatMap((pickList) => pickList.locations || []).forEach((loc) => {
      next[loc.name] = loc.picked_qty ?? 0;
    });
    pickedRef.current = next;
    setPicked(next);
  }, [session]);

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

  const persistQty = async () => {
    if (modificationPending) return;
    for (const pickList of pickLists.filter((item) => item.docstatus === 0)) {
      await updateQuantities(
        pickList.name,
        (pickList.locations || []).map((location) => ({ name: location.name, picked_qty: picked[location.name] ?? 0 })),
      );
    }
    mutate();
  };

  const fillRequested = () => {
    if (!session || modificationPending) return;
    const next: Record<string, number> = {};
    pickLists.flatMap((pickList) => pickList.locations || []).forEach((loc) => {
      next[loc.name] = loc.stock_qty || loc.qty || 0;
    });
    pickedRef.current = next;
    setPicked(next);
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

  const applyScan = async (raw: string, restoreFocus = true) => {
    const value = raw.trim();
    if (!value || reviewing || scanning || !draftOpen || modificationPending) return;
    setScanMessage("");
    setScanError("");
    setScanTone("idle");
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
    try {
      const result = await scanPickItem(value, pickListNames);
      const increment = result.increment || 1;
      setScanIncrement(increment);
      const applied = applyBarcodeScan(locations, pickedRef.current, result.item_code, increment);
      const itemName = result.item_name || result.item_code;
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
        code: value,
        label: itemName,
        amount: applied.nextQty - previous,
        tone: "ok",
      });
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
      if (restoreFocus) scanInputRef.current?.focus();
    }
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
            busy={scanning || submitting || saving || modificationPending}
            scanInputRef={scanInputRef}
          />
        )}
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
            Commandes
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
  const tabParam = searchParams.get("tab");
  const tab = tabParam === "listes" || tabParam === "retours" ? tabParam : "commandes";
  const { routes: pendingReturns } = usePendingReturnRoutes();
  const { data: recentPickLists } = useRecentPickLists();
  const { data: queueData } = usePreparationQueue();
  const returnCount = pendingReturns.length;
  const draftListCount = (recentPickLists?.message || []).filter((row) => row.docstatus === 0).length;
  const orders = queueData?.message || [];
  const today = isoDateWithOffset(0);
  const shortageOrders = orders.filter((order) => (order.stock_shortages || []).length > 0);
  const overdueOrders = orders.filter((order) => {
    const due = order.delivery_date || order.transaction_date || "";
    return Boolean(due && due < today);
  });
  const alertCount = (shortageOrders.length ? 1 : 0) + (overdueOrders.length ? 1 : 0);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [presetSelection, setPresetSelection] = useState<string[]>();
  const [requestedDateScope, setRequestedDateScope] = useState<DateScope>();

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

  const description =
    tab === "retours"
      ? "Recomptage et retour du véhicule vers l’entrepôt, indépendant du contrôle de caisse."
      : tab === "listes"
        ? "Rouvrez une liste de prélèvement en brouillon ou consultez les listes déjà soumises."
        : "Les listes se créent à la soumission. Ouvrez-les pour prélever, puis générez les BL.";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={`Entrepôt · ${formatLongDate(today)}`}
        title="Préparation"
        meta={
          tab === "commandes" ? (
            <AlertsChip count={alertCount} open={alertsOpen} onToggle={() => setAlertsOpen((open) => !open)} />
          ) : undefined
        }
        description={description}
      />
      {tab === "commandes" && alertsOpen && alertCount > 0 && (
        <section aria-label="Anomalies" className="grid gap-3 sm:grid-cols-2">
          {shortageOrders.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-destructive/25 bg-destructive/5 p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-3.5 text-destructive" />
                <p className="text-sm font-semibold text-destructive">Stock manquant</p>
                <span className="num rounded bg-destructive/10 px-1.5 py-px text-[11px] text-destructive">
                  {shortageOrders.length}
                </span>
              </div>
              <p className="t-meta text-muted-foreground">
                {shortageOrders.length} commande{shortageOrders.length > 1 ? "s" : ""} avec rupture de stock.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto w-fit p-0 text-xs font-medium text-destructive"
                onClick={() => setPresetSelection(shortageOrders.map((order) => order.name))}
              >
                Sélectionner ces commandes
              </Button>
            </div>
          )}
          {overdueOrders.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-warning/30 bg-warning/5 p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-3.5 text-warning-foreground" />
                <p className="text-sm font-semibold text-warning-foreground">Échéances dépassées</p>
                <span className="num rounded bg-warning/10 px-1.5 py-px text-[11px] text-warning-foreground">
                  {overdueOrders.length}
                </span>
              </div>
              <p className="t-meta text-muted-foreground">
                {overdueOrders.length} commande{overdueOrders.length > 1 ? "s" : ""} dont l’échéance est passée.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto w-fit p-0 text-xs font-medium"
                onClick={() => {
                  setRequestedDateScope("overdue");
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
          setSearchParams(value === "commandes" ? {} : { tab: value });
        }}
        aria-label="Sections préparation"
      >
        <TabsList variant="line">
          <TabsTrigger value="commandes">Commandes</TabsTrigger>
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
        <TabsContent value="commandes" className="pt-5">
          <SalesOrderPicker
            onOpenPickLists={openPickLists}
            onShowPickLists={() => setSearchParams({ tab: "listes" })}
            presetSelection={presetSelection}
            requestedDateScope={requestedDateScope}
          />
        </TabsContent>
        <TabsContent value="listes" className="pt-5">
          <PickListQueue
            onOpenPickLists={openPickLists}
            onGoToOrders={() => setSearchParams({})}
          />
        </TabsContent>
        <TabsContent value="retours" className="pt-5">
          <ReturnControlPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default PreparationPage;
