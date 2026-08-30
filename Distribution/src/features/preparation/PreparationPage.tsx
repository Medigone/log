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
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarcodeScannerDialog } from "@/components/BarcodeScannerDialog";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { Toolbar, ToolbarSpacer } from "@/components/ui/toolbar";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle,
  ClipboardList,
  Package,
  Printer,
  QrCode,
  RotateCcw,
  ScanBarcode,
  Search,
} from "lucide-react";
import { apiErrorMessage } from "@/shared/api/distribution";
import {
  usePickSession,
  usePreparationMutations,
  usePreparationQueue,
  applyBarcodeScan,
  getPickGroupLocations,
  type DeliveryNoteResult,
  type PickGroup,
  type PickLocation,
  type SalesOrderRow,
} from "@/shared/api/preparation";
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
import { pickLineTone, type StatusTone } from "@/shared/design/statusTone";
import { cn } from "@/lib/utils";
import { formatQuantity, formatShortDate } from "@/shared/format";

function priority(date?: string): { label: string; tone: StatusTone } {
  if (!date) return { label: "Date à confirmer", tone: "neutral" };
  const target = new Date(`${date}T00:00:00`);
  const current = new Date();
  current.setHours(0, 0, 0, 0);
  if (target < current) return { label: "En retard", tone: "danger" };
  if (target.getTime() === current.getTime()) return { label: "Aujourd’hui", tone: "warning" };
  return { label: "Planifiée", tone: "info" };
}

type DateScope = "all" | "today" | "tomorrow" | "overdue";

const PREPARATION_STEPS = ["Sélection", "Prélèvement", "Contrôle"] as const;

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const formatQty = formatQuantity;

type LineFocus = "all" | "remaining" | "complete" | "variance";

function groupPickedQty(group: PickGroup, picked: Record<string, number>) {
  return getPickGroupLocations(group).reduce(
    (sum, location) => sum + (picked[location.name] ?? location.picked_qty ?? 0),
    0,
  );
}

function pickLineLabel(pickedQty: number, requested: number) {
  if (pickedQty === requested) return "Complet";
  if (pickedQty > requested) return "Écart";
  return "Restant";
}

function matchesLineFocus(pickedQty: number, requested: number, focus: LineFocus) {
  if (focus === "remaining") return pickedQty < requested;
  if (focus === "complete") return pickedQty === requested;
  if (focus === "variance") return pickedQty !== requested;
  return true;
}

function matchesLineSearch(group: PickGroup, query: string) {
  if (!query) return true;
  return [
    group.item_code,
    group.item_name,
    group.warehouse,
    ...getPickGroupLocations(group).map((location) => location.sales_order),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLocaleLowerCase("fr").includes(query));
}

function PickSessionSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[92px] w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-14 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}

function stockShortages(order: SalesOrderRow) {
  return order.stock_shortages || [];
}

function orderCanCreate(order: SalesOrderRow) {
  return order.can_create_pick_list !== false;
}

function orderExistingPickList(order: SalesOrderRow) {
  return order.existing_pick_list || order.draft_pick_list;
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

function SalesOrderPicker({ onOpenPickLists }: { onOpenPickLists: (names: string[], created?: boolean) => void }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [dateScope, setDateScope] = useState<DateScope>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [wilaya, setWilaya] = useState("");
  const [commune, setCommune] = useState("");
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const { data, mutate, error, isLoading } = usePreparationQueue();
  const { createPickList, creating } = usePreparationMutations();

  const orders = useMemo(() => data?.message || [], [data?.message]);
  const selectedOrders = useMemo(
    () => orders.filter((order) => selected.has(order.name) && orderCanCreate(order)),
    [orders, selected],
  );
  const wilayas = useMemo(
    () => Array.from(new Set(orders.map((order) => order.custom_wilaya).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "fr")),
    [orders],
  );
  const communes = useMemo(
    () => Array.from(orders
      .filter((order) => (!wilaya || order.custom_wilaya === wilaya) && order.custom_commune)
      .reduce((values, order) => {
        const value = order.custom_commune as string;
        values.set(value, order.custom_commune_nom || value);
        return values;
      }, new Map<string, string>()))
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr")),
    [orders, wilaya],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = isoDateWithOffset(0);
    const tomorrow = isoDateWithOffset(1);
    return orders.filter((row) => {
      const matchesSearch = !q || [row.name, row.customer, row.customer_name, row.custom_commune, row.custom_commune_nom, row.custom_wilaya]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
      if (!matchesSearch) return false;
      if (wilaya && row.custom_wilaya !== wilaya) return false;
      if (commune && row.custom_commune !== commune) return false;

      const orderDate = row.delivery_date || row.transaction_date || "";
      if (dateScope === "today" && orderDate !== today) return false;
      if (dateScope === "tomorrow" && orderDate !== tomorrow) return false;
      if (dateScope === "overdue" && (!orderDate || orderDate >= today)) return false;
      if (dateFrom && (!orderDate || orderDate < dateFrom)) return false;
      if (dateTo && (!orderDate || orderDate > dateTo)) return false;
      return true;
    });
  }, [commune, dateFrom, dateScope, dateTo, orders, search, wilaya]);

  const creatableFiltered = filtered.filter(orderCanCreate);
  const allSelected = creatableFiltered.length > 0 && creatableFiltered.every((row) => selected.has(row.name));
  const someSelected = !allSelected && creatableFiltered.some((row) => selected.has(row.name));
  const filtersActive = Boolean(search || dateScope !== "all" || dateFrom || dateTo || wilaya || commune);
  const insufficientOrders = selectedOrders.filter((order) => stockShortages(order).length > 0);

  // Le Dialog gère Échap et le piège de focus ; on force seulement le focus initial
  // sur l'action de confirmation plutôt que sur « Annuler ».
  useEffect(() => {
    if (confirming) confirmButtonRef.current?.focus();
  }, [confirming]);

  const toggle = (order: SalesOrderRow) => {
    if (!orderCanCreate(order)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(order.name)) next.delete(order.name);
      else next.add(order.name);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    handleSelectAll(!allSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      creatableFiltered.forEach((order) => {
        if (checked) next.add(order.name);
        else next.delete(order.name);
      });
      return next;
    });
  };

  const handleSelectRow = (order: SalesOrderRow, checked: boolean) => {
    if (!orderCanCreate(order)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(order.name);
      else next.delete(order.name);
      return next;
    });
  };

  const resetFilters = () => {
    setSearch("");
    setDateScope("all");
    setDateFrom("");
    setDateTo("");
    setWilaya("");
    setCommune("");
  };

  const handleCreate = async () => {
    const names = selectedOrders.map((order) => order.name);
    if (!names.length || insufficientOrders.length) return;
    setErrorMessage("");
    try {
      const session = await createPickList(names);
      const pickLists = (session?.pick_lists || [])
        .map((pickList) => pickList?.name)
        .filter((name): name is string => Boolean(name));
      if (!pickLists.length) {
        throw new Error("La création n’a retourné aucune liste de prélèvement. Rechargez la page puis réessayez.");
      }
      onOpenPickLists(pickLists, true);
      mutate();
    } catch (mutationError) {
      setConfirming(false);
      setErrorMessage(apiErrorMessage(mutationError));
    }
  };

  const openExisting = (order: SalesOrderRow) => {
    const name = orderExistingPickList(order);
    if (name) onOpenPickLists([name]);
  };

  const emptyOrders = (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Package />
        </EmptyMedia>
        <EmptyTitle>Aucune commande ne correspond</EmptyTitle>
        <EmptyDescription>Modifiez ou réinitialisez les filtres.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" size="sm" onClick={resetFilters}>
          Réinitialiser
        </Button>
      </EmptyContent>
    </Empty>
  );

  return (
    <div className="flex flex-col gap-5">
      {(error || errorMessage) && (
        <Alert>
          <AlertDescription>
            {errorMessage || "Impossible de charger les commandes à préparer."}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">Commandes à prélever ({filtered.length})</h2>
          {selectedOrders.length > 0 && (
            <Badge aria-live="polite" className="bg-brand-100 text-brand-800 hover:bg-brand-100">
              {selectedOrders.length} sélectionnée{selectedOrders.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={toggleAllFiltered} disabled={!creatableFiltered.length}>
            {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
          </Button>
          <Button size="sm" onClick={() => setConfirming(true)} disabled={!selectedOrders.length || creating}>
            <ClipboardList data-icon="inline-start" />
            {creating ? "Création…" : "Créer la liste de prélèvement"}
          </Button>
        </div>
      </div>

      <Toolbar>
        <InputGroup className="min-w-48 flex-1 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une commande…"
            aria-label="Rechercher une commande"
          />
        </InputGroup>
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
        <DateRangeFilter
          from={dateFrom}
          to={dateTo}
          onChange={(range) => {
            setDateFrom(range.from);
            setDateTo(range.to);
            setDateScope("all");
          }}
        />
        {filtersActive ? (
          <>
            <ToolbarSpacer />
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw data-icon="inline-start" />
              Réinitialiser
            </Button>
          </>
        ) : null}
      </Toolbar>

      {isLoading && !orders.length ? (
        <Skeleton className="h-72 w-full rounded-lg" aria-hidden="true" />
      ) : !filtered.length ? (
        emptyOrders
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border md:block">
            <Table aria-label="Commandes à prélever">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      aria-label="Tout sélectionner"
                      checked={allSelected}
                      indeterminate={someSelected}
                      disabled={!creatableFiltered.length}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Commande</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Lieu</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="text-right">Liste</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const existing = orderExistingPickList(row);
                  const creatable = orderCanCreate(row);
                  const isSelected = selected.has(row.name);
                  return (
                    <TableRow
                      key={row.name}
                      data-state={isSelected ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => {
                        if (creatable) toggle(row);
                        else openExisting(row);
                      }}
                    >
                      <TableCell
                        onClick={(event) => event.stopPropagation()}
                      >
                        {creatable ? (
                          <Checkbox
                            aria-label={`Sélectionner ${row.name}`}
                            checked={isSelected}
                            onCheckedChange={(checked) => handleSelectRow(row, checked)}
                          />
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="font-medium">{row.name}</span>
                          <span className="text-muted-foreground">{row.total_qty || 0} art.</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="truncate">{row.customer_name || row.customer || "—"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="truncate">
                          {[row.custom_commune_nom || row.custom_commune, row.custom_wilaya].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-col gap-1">
                          <StatusBadge tone={priority(row.delivery_date).tone} size="sm">
                            {priority(row.delivery_date).label}
                          </StatusBadge>
                          <span className="text-muted-foreground">{formatShortDate(row.delivery_date || row.transaction_date)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {stockShortages(row).length > 0 ? (
                          <StatusBadge tone="danger" size="sm">Stock insuffisant</StatusBadge>
                        ) : (
                          <span className="text-muted-foreground">OK</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {existing && !creatable ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              openExisting(row);
                            }}
                          >
                            Ouvrir {existing}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">{Math.round(row.per_picked || 0)}% prélevé</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-2 md:hidden">
            {filtered.map((row) => {
              const existing = orderExistingPickList(row);
              const creatable = orderCanCreate(row);
              return (
                <div key={row.name} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {creatable ? (
                      <Checkbox
                        aria-label={`Sélectionner ${row.name}`}
                        checked={selected.has(row.name)}
                        onCheckedChange={(checked) => handleSelectRow(row, checked)}
                      />
                    ) : null}
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{row.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {row.customer_name || row.customer} · {row.custom_commune_nom || row.custom_commune || "—"} ·{" "}
                        {formatShortDate(row.delivery_date || row.transaction_date)} · {row.total_qty || 0} art.
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {stockShortages(row).length > 0 && <StatusBadge tone="danger" size="sm">Stock insuffisant</StatusBadge>}
                    <StatusBadge tone={priority(row.delivery_date).tone} size="sm">{priority(row.delivery_date).label}</StatusBadge>
                    {existing && !creatable ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => openExisting(row)}>
                        Ouvrir {existing}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={confirming} onOpenChange={(open) => !open && !creating && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div
                className={`shrink-0 rounded-md p-2 ${insufficientOrders.length ? "bg-red-50 text-red-700" : "bg-brand-50 text-brand-700"}`}
              >
                {insufficientOrders.length ? <AlertTriangle className="size-5" /> : <ClipboardList className="size-5" />}
              </div>
              <div>
                <DialogTitle>{insufficientOrders.length ? "Stock insuffisant" : "Confirmer la création"}</DialogTitle>
                <DialogDescription className="mt-1">
                  {insufficientOrders.length
                    ? "Réapprovisionnez l’entrepôt avant de créer la liste. ERPNext ne peut pas prélever un article sans stock disponible."
                    : `${selectedOrders.length} ${selectedOrders.length > 1 ? "listes de prélèvement seront créées" : "liste de prélèvement sera créée"}, une par commande sélectionnée.`}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <DialogBody>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-hairline bg-surface-subtle p-3">
              {selectedOrders.map((order) => {
                const shortages = stockShortages(order);
                return (
                  <div key={order.name} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <strong className="text-foreground">{order.name}</strong>
                      <span className="truncate text-muted-foreground">{order.customer_name || order.customer || "Client non renseigné"}</span>
                    </div>
                    {shortages.map((shortage) => (
                      <p key={`${order.name}-${shortage.item_code}`} className="text-xs text-red-700">
                        {shortage.item_name || shortage.item_code} : {formatQty(shortage.required)} demandé, {formatQty(shortage.available)} disponible
                        {shortage.warehouse ? ` · ${shortage.warehouse}` : ""}
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>

            <p className="mt-4 t-meta text-muted-foreground">
              {insufficientOrders.length
                ? "Désélectionnez les commandes en rupture ou réceptionnez le stock, puis réessayez."
                : "Les listes seront créées en brouillon et pourront être contrôlées avant la génération des bons de livraison."}
            </p>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={creating}>
              Annuler
            </Button>
            <Button
              ref={confirmButtonRef}
              type="button"
              onClick={handleCreate}
              disabled={creating || insufficientOrders.length > 0}
            >
              <ClipboardList />
              {creating ? "Création…" : "Confirmer la création"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const [cameraOpen, setCameraOpen] = useState(false);
  const [lastScan, setLastScan] = useState<ScanSnapshot | null>(null);
  const [lastScannedKey, setLastScannedKey] = useState("");
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState<LineFocus>("all");
  const scanInputRef = useRef<HTMLInputElement>(null);
  const confirmBlButtonRef = useRef<HTMLButtonElement>(null);
  const groupRefs = useRef<Record<string, HTMLElement | null>>({});
  const pickedRef = useRef<Record<string, number>>({});

  const isMobile = useIsMobile();
  const { data, mutate, error, isLoading } = usePickSession(pickListNames);
  const { updateQuantities, submitPickList, scanPickItem, saving, submitting, scanning } = usePreparationMutations();

  const session = data?.message;
  const pickLists = session?.pick_lists || [];
  const draftOpen = pickLists.some((item) => item.docstatus === 0);
  const floorMode = isMobile && draftOpen && !reviewing;

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
  const query = search.trim().toLocaleLowerCase("fr");
  const varianceGroups = grouped.filter((group) => groupPickedQty(group, picked) !== group.stock_qty);
  const totals = {
    requested: grouped.reduce((sum, group) => sum + group.stock_qty, 0),
    picked: grouped.reduce((sum, group) => sum + groupPickedQty(group, picked), 0),
    remaining: grouped.reduce((sum, group) => sum + Math.max(0, group.stock_qty - groupPickedQty(group, picked)), 0),
    variance: varianceGroups.length,
  };
  const filteredGroups = grouped.filter((group) => {
    const pickedQty = groupPickedQty(group, picked);
    return matchesLineFocus(pickedQty, group.stock_qty, focus) && matchesLineSearch(group, query);
  });
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
    for (const pickList of pickLists.filter((item) => item.docstatus === 0)) {
      await updateQuantities(
        pickList.name,
        (pickList.locations || []).map((location) => ({ name: location.name, picked_qty: picked[location.name] ?? 0 })),
      );
    }
    mutate();
  };

  const fillRequested = () => {
    if (!session) return;
    const next: Record<string, number> = {};
    pickLists.flatMap((pickList) => pickList.locations || []).forEach((loc) => {
      next[loc.name] = loc.stock_qty || loc.qty || 0;
    });
    pickedRef.current = next;
    setPicked(next);
  };

  const handleSubmit = async () => {
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

  const applyScan = async (raw: string, restoreFocus = true) => {
    const value = raw.trim();
    if (!value || reviewing || scanning || !draftOpen) return;
    setScanMessage("");
    setScanError("");
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
      const locations = pickLists.flatMap((pickList) => pickList.locations || []);
      const increment = result.increment || 1;
      const applied = applyBarcodeScan(locations, pickedRef.current, result.item_code, increment);
      const itemName = result.item_name || result.item_code;
      if (!applied.ok) {
        if (applied.reason === "already_complete") {
          setLastScan(snapshotFor(result.item_code, itemName, undefined, pickedRef.current, increment));
        }
        setScanError(
          applied.reason === "already_complete"
            ? `Quantité demandée déjà atteinte pour ${itemName}.`
            : "Cet article n'est pas dans la session de préparation.",
        );
        return;
      }
      const next = { ...pickedRef.current, [applied.locationName]: applied.nextQty };
      pickedRef.current = next;
      setPicked(next);
      const groupKey = `${applied.itemCode}-${applied.warehouse || ""}`;
      setLastScannedKey(groupKey);
      const snapshot = snapshotFor(applied.itemCode, itemName, applied.warehouse, next, increment);
      setLastScan(snapshot);
      setScanMessage(`${itemName} · +${increment}`);
      groupRefs.current[groupKey]?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (scanException) {
      setScanError(apiErrorMessage(scanException));
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

  const pickLineRows = filteredGroups.flatMap((group) => {
    const groupKey = `${group.item_code}-${group.warehouse || ""}`;
    return getPickGroupLocations(group).map((location) => ({ groupKey, group, location }));
  });

  const setLocationQty = (name: string, value: number) => {
    setPicked((prev) => {
      const next = { ...prev, [name]: value };
      pickedRef.current = next;
      return next;
    });
  };

  const renderPickedQtyControl = (loc: PickLocation) => {
    const locationDraft = pickLists.find((item) => item.name === loc.pick_list)?.docstatus === 0;
    const locationQty = picked[loc.name] ?? loc.picked_qty ?? 0;
    return (
      <div key={loc.name} className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate text-muted-foreground">{loc.sales_order}</span>
        <div className="flex items-center gap-2">
          <span className="num text-xs text-muted-foreground">
            {formatQty(loc.stock_qty)} {loc.stock_uom || loc.uom}
          </span>
          {locationDraft ? (
            <Input
              type="number"
              min={0}
              max={loc.stock_qty}
              step="any"
              className="h-8 w-24"
              aria-label={`Quantité prélevée ${loc.item_code}`}
              value={locationQty}
              onChange={(event) => setLocationQty(loc.name, Number(event.target.value))}
            />
          ) : (
            <span className="num w-24 text-right font-semibold">{formatQty(locationQty)}</span>
          )}
        </div>
      </div>
    );
  };

  const pickLineColumns: Array<DataTableColumn<(typeof pickLineRows)[number]>> = [
    {
      id: "item",
      header: "Article",
      sortValue: (row) => row.location.item_code,
      cell: (row) => (
        <span
          ref={(node) => {
            groupRefs.current[row.groupKey] = node;
          }}
          className="font-medium"
        >
          {row.location.item_code} · {row.location.item_name}
        </span>
      ),
    },
    {
      id: "warehouse",
      header: "Entrepôt",
      hideBelow: "md",
      sortValue: (row) => row.location.warehouse || "",
      cell: (row) => row.location.warehouse || "—",
    },
    {
      id: "order",
      header: "Commande",
      hideBelow: "md",
      sortValue: (row) => row.location.sales_order || "",
      cell: (row) => row.location.sales_order || "—",
    },
    {
      id: "requested",
      header: "Demandé",
      numeric: true,
      width: "100px",
      sortValue: (row) => row.location.stock_qty,
      cell: (row) => `${formatQty(row.location.stock_qty)} ${row.location.stock_uom || row.location.uom || ""}`,
    },
    {
      id: "picked",
      header: "Prélevé",
      width: "120px",
      cell: (row) => {
        const locationDraft = pickLists.find((item) => item.name === row.location.pick_list)?.docstatus === 0;
        const locationQty = picked[row.location.name] ?? row.location.picked_qty ?? 0;
        if (!locationDraft) return <span className="num font-semibold">{formatQty(locationQty)}</span>;
        return (
          <Input
            type="number"
            min={0}
            max={row.location.stock_qty}
            step="any"
            className="h-8 w-24"
            aria-label={`Quantité prélevée ${row.location.item_code}`}
            value={locationQty}
            onChange={(event) => setLocationQty(row.location.name, Number(event.target.value))}
            onClick={(event) => event.stopPropagation()}
          />
        );
      },
    },
    {
      id: "status",
      header: "État",
      width: "110px",
      cell: (row) => {
        const locationQty = picked[row.location.name] ?? row.location.picked_qty ?? 0;
        return (
          <StatusBadge tone={pickLineTone(locationQty, row.location.stock_qty)} size="sm">
            {pickLineLabel(locationQty, row.location.stock_qty)}
          </StatusBadge>
        );
      },
    },
  ];

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
            onReview={() => setReviewing(true)}
            onFillRequested={fillRequested}
            busy={scanning || submitting || saving}
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
              <Button variant="outline" size="sm" onClick={fillRequested}>
                Tout prélever
              </Button>
              <Button size="sm" onClick={() => setReviewing(true)} disabled={submitting || saving || isLoading}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Contrôle final
              </Button>
            </div>
          ) : undefined
        }
      />

      <Tabs value={currentStep} aria-label="Étapes de préparation">
        <TabsList variant="segmented" className="grid w-full grid-cols-3">
          {PREPARATION_STEPS.map((step, index) => (
            <TabsTrigger key={step} value={step} variant="segmented" disabled className="disabled:opacity-100">
              <span className="num mr-1 text-muted-foreground">{index + 1}.</span>
              {step}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {creationConfirmed && (
        <Alert role="status" className="border-emerald-200 bg-emerald-50 text-emerald-900">
          <CheckCircle className="text-emerald-700" />
          <AlertDescription className="text-emerald-800">
            <strong>Liste de prélèvement créée avec succès.</strong>
            <span>{pickListNames.join(", ")}</span>
          </AlertDescription>
        </Alert>
      )}

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
          <section aria-label="Progression du prélèvement" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile
              icon={Package}
              tone="neutral"
              label="Demandé"
              value={isLoading && !grouped.length ? "—" : formatQty(totals.requested)}
              hint="Quantité à prélever →"
              onClick={() => setFocus("all")}
              className={focus === "all" ? "border-brand-300 bg-brand-50/50" : undefined}
            />
            <KpiTile
              icon={CheckCircle}
              tone={totals.picked > 0 ? "success" : "neutral"}
              label="Prélevé"
              value={isLoading && !grouped.length ? "—" : formatQty(totals.picked)}
              hint="Déjà scannée →"
              onClick={() => setFocus("complete")}
              className={focus === "complete" ? "border-brand-300 bg-brand-50/50" : undefined}
            />
            <KpiTile
              icon={ScanBarcode}
              tone={totals.remaining > 0 ? "warning" : "neutral"}
              label="Restant"
              value={isLoading && !grouped.length ? "—" : formatQty(totals.remaining)}
              hint="Encore à scanner →"
              onClick={() => setFocus("remaining")}
              className={focus === "remaining" ? "border-brand-300 bg-brand-50/50" : undefined}
            />
            <KpiTile
              icon={AlertTriangle}
              tone={totals.variance ? "warning" : "neutral"}
              label="Écarts"
              value={isLoading && !grouped.length ? "—" : totals.variance}
              hint={totals.variance ? "Lignes à vérifier →" : "Aucun écart →"}
              onClick={() => setFocus("variance")}
              className={focus === "variance" ? "border-brand-300 bg-brand-50/50" : undefined}
            />
          </section>

          <Toolbar>
            <InputGroup className="min-w-48 flex-1 bg-background">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Article, entrepôt ou commande…"
                aria-label="Rechercher un article"
              />
            </InputGroup>
            <FilterSelect
              label="État"
              value={focus}
              onChange={(value) => setFocus(value as LineFocus)}
              options={[
                { value: "all", label: "Tous" },
                { value: "remaining", label: "Restant" },
                { value: "complete", label: "Complet" },
                { value: "variance", label: "Écart" },
              ]}
            />
          </Toolbar>

          <h2 className="text-base font-semibold">
            {submitted ? "Lignes prélevées" : "Lignes à prélever"} ({session?.sales_orders?.length || 0} commande
            {(session?.sales_orders?.length || 0) > 1 ? "s" : ""})
          </h2>
          {!reviewing && draftOpen && (
            <form onSubmit={handleScan} className="sticky top-0 z-10 flex flex-col gap-2 rounded-lg border border-brand-200 bg-brand-50/80 p-3 backdrop-blur">
              <label htmlFor="pick-scan-barcode" className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <ScanBarcode className="h-4 w-4" />
                Code-barres article
              </label>
              <InputGroup className="h-10 bg-background">
                <InputGroupInput
                  id="pick-scan-barcode"
                  ref={scanInputRef}
                  value={scanValue}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  disabled={scanning || submitting || saving}
                  placeholder="Scanner puis Entrée"
                  onChange={(event) => setScanValue(event.target.value)}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    type="button"
                    size="icon-sm"
                    aria-label="Ouvrir la caméra"
                    disabled={scanning || submitting || saving}
                    onClick={openCamera}
                  >
                    <Camera />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <p className={`text-xs ${scanError ? "text-red-700" : "text-slate-600"}`} aria-live="polite">
                {scanning ? "Lecture…" : scanError || scanMessage || "Chaque scan ajoute une unité (ou le pack) jusqu’à la quantité demandée."}
              </p>
              <BarcodeScannerDialog
                open={cameraOpen}
                onOpenChange={setCameraOpen}
                onScan={(text) => void applyScan(text, false)}
                feedback={scanning ? "Lecture…" : scanError || scanMessage}
                feedbackTone={scanError ? "error" : scanMessage ? "success" : undefined}
                scanResult={lastScan}
              />
            </form>
          )}
          {!isLoading && grouped.length === 0 && (
            <EmptyState
              icon={Package}
              title="Aucune ligne"
              description="Cette liste de prélèvement ne contient aucun article."
            />
          )}
          {!reviewing && !filteredGroups.length && grouped.length > 0 && (
            <p className="rounded-lg border border-dashed border-hairline-strong bg-card p-4 t-body text-muted-foreground">
              Aucun article ne correspond à la recherche.
            </p>
          )}
          {!reviewing && filteredGroups.length > 0 && (
            <>
              <div className="hidden md:block">
                <DataTable
                  label="Lignes à prélever"
                  columns={pickLineColumns}
                  rows={pickLineRows}
                  rowKey={(row) => row.location.name}
                  isRowActive={(row) => lastScannedKey === row.groupKey}
                  rowClassName={(row) =>
                    lastScannedKey === row.groupKey
                      ? "bg-emerald-50 ring-inset ring-1 ring-emerald-300"
                      : undefined
                  }
                />
              </div>
              <div className="space-y-2 md:hidden">
                {filteredGroups.map((group) => {
                  const pickedQty = groupPickedQty(group, picked);
                  const groupKey = `${group.item_code}-${group.warehouse || ""}`;
                  return (
                    <div
                      key={`${group.item_code}-${group.warehouse}`}
                      ref={(node) => {
                        groupRefs.current[groupKey] = node;
                      }}
                      className={cn(
                        "space-y-2 rounded-lg border p-3",
                        lastScannedKey === groupKey && "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-300",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-sm">
                            {group.item_code} · {group.item_name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {group.warehouse || "Entrepôt non défini"} · {formatQty(pickedQty)} / {formatQty(group.stock_qty)} {group.uom || ""}
                          </div>
                        </div>
                        <StatusBadge tone={pickLineTone(pickedQty, group.stock_qty)} size="sm">
                          {pickLineLabel(pickedQty, group.stock_qty)}
                        </StatusBadge>
                      </div>
                      {getPickGroupLocations(group).map((loc) => renderPickedQtyControl(loc))}
                    </div>
                  );
                })}
              </div>
            </>
          )}
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
                <Button onClick={() => setConfirmingBl(true)} disabled={submitting || saving}>
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
  const tab = searchParams.get("tab") === "retours" ? "retours" : "commandes";
  const { routes: pendingReturns } = usePendingReturnRoutes();
  const returnCount = pendingReturns.length;

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
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Entrepôt"
        title="Préparation"
        description={
          tab === "retours"
            ? "Recomptage et retour du véhicule vers l’entrepôt, indépendant du contrôle de caisse."
            : "Commande client → Liste de prélèvement → Bon de livraison. Sélectionnez les commandes à prélever."
        }
      />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setSearchParams(value === "retours" ? { tab: "retours" } : {});
        }}
        aria-label="Sections préparation"
      >
        <TabsList variant="line">
          <TabsTrigger value="commandes">Commandes</TabsTrigger>
          <TabsTrigger value="retours">
            Retours
            <Badge variant={returnCount > 0 ? "default" : "secondary"} aria-label={`${returnCount} à traiter`}>
              {returnCount}
            </Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="commandes" className="pt-5">
          <SalesOrderPicker
            onOpenPickLists={(names, created = false) => {
              setSearchParams({ pick_lists: names.join(","), ...(created ? { created: "1" } : {}) });
            }}
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
