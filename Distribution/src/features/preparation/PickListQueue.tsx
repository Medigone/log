import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList } from "lucide-react";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import {
  pickListDueDate,
  pickListIncomplete,
  pickListRemaining,
  usePickListQueueStats,
  useRecentPickLists,
  type RecentPickList,
} from "@/shared/api/preparation";
import { formatQuantity, formatShortDate } from "@/shared/format";
import {
  PickListItemsSubGrid,
  PreparationSubTableGrid,
  namedHeader,
} from "@/features/preparation/PreparationSubTableGrid";
import { ListStateIcon, listStateFromDocstatus } from "@/features/preparation/ListStateIcon";
import { PreparationStageKpis, type PreparationStage } from "@/features/preparation/PreparationStageKpis";
import {
  PreparationMoreFilters,
  PreparationQueueShell,
  PreparationSelectionBar,
  preparationChipClass,
} from "@/features/preparation/PreparationQueueShell";
import { cn } from "@/lib/utils";

type ListStatus = "all" | "draft" | "submitted";
type DateScope = "all" | "today" | "tomorrow" | "overdue";

function joinLabels(values?: string[], empty = "—") {
  return values?.filter(Boolean).join(" · ") || empty;
}

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoDateWithOffset(days: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

function dateScopeFromParam(value: string | null): DateScope {
  if (value === "today" || value === "tomorrow" || value === "overdue") return value;
  return "all";
}

function completeFromParams(searchParams: URLSearchParams) {
  return searchParams.get("complete") === "1" || searchParams.get("shortage") === "1";
}

export function PickListQueue({ onOpenPickLists }: { onOpenPickLists: (names: string[]) => void }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ListStatus>("all");
  const [changedOnly, setChangedOnly] = useState(false);
  const [completeOnly, setCompleteOnly] = useState(() => completeFromParams(searchParams));
  const [dateScope, setDateScope] = useState<DateScope>(() => dateScopeFromParam(searchParams.get("dateScope")));
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [customer, setCustomer] = useState("");
  const [wilaya, setWilaya] = useState("");
  const [commune, setCommune] = useState("");
  const [selection, setSelection] = useState<Record<string, true>>({});
  const { data, error, isLoading } = useRecentPickLists();
  const { data: statsData } = usePickListQueueStats();
  const lists = useMemo(() => data?.message || [], [data?.message]);
  const today = isoDateWithOffset(0);
  const tomorrow = isoDateWithOffset(1);

  const dateScopeParam = searchParams.get("dateScope");
  const completeParam = searchParams.get("complete");
  const shortageParam = searchParams.get("shortage");

  useEffect(() => {
    if (dateScopeParam) {
      setDateScope(dateScopeFromParam(dateScopeParam));
      setDateFrom("");
      setDateTo("");
    }
    if (completeParam === "1" || shortageParam === "1") setCompleteOnly(true);
  }, [completeParam, dateScopeParam, shortageParam]);

  const customers = useMemo(
    () =>
      Array.from(new Set(lists.flatMap((row) => row.customer_names || []).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
    [lists],
  );
  const wilayas = useMemo(
    () =>
      Array.from(new Set(lists.flatMap((row) => row.wilayas || []).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
    [lists],
  );
  const communes = useMemo(
    () =>
      Array.from(
        lists
          .filter((row) => (!wilaya || (row.wilayas || []).includes(wilaya)) && (row.communes?.length || row.custom_commune))
          .reduce((values, row) => {
            const ids = row.communes?.length ? row.communes : row.custom_commune ? [row.custom_commune] : [];
            const labels = row.commune_noms?.length
              ? row.commune_noms
              : row.custom_commune_nom
                ? [row.custom_commune_nom]
                : ids;
            ids.forEach((id, index) => values.set(id, labels[index] || id));
            return values;
          }, new Map<string, string>()),
      )
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "fr")),
    [lists, wilaya],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return lists.filter((row) => {
      if (status === "draft" && row.docstatus !== 0) return false;
      if (status === "submitted" && row.docstatus !== 1) return false;
      if (changedOnly && !row.custom_order_changed) return false;
      if (completeOnly && !pickListIncomplete(row)) return false;
      if (customer && !(row.customer_names || []).includes(customer)) return false;
      if (wilaya && !(row.wilayas || []).includes(wilaya)) return false;
      if (commune && !(row.communes || []).includes(commune) && row.custom_commune !== commune) return false;
      const orderDate = pickListDueDate(row);
      if (dateScope === "today" && orderDate !== today) return false;
      if (dateScope === "tomorrow" && orderDate !== tomorrow) return false;
      if (dateScope === "overdue" && (!orderDate || orderDate >= today)) return false;
      if (dateFrom && (!orderDate || orderDate < dateFrom)) return false;
      if (dateTo && (!orderDate || orderDate > dateTo)) return false;
      if (!query) return true;
      return [
        row.name,
        ...(row.sales_orders || []),
        ...(row.customer_names || []),
        ...(row.wilayas || []),
        ...(row.commune_noms || []),
        ...(row.communes || []),
        ...(row.delivery_notes || []),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("fr").includes(query));
    });
  }, [
    changedOnly,
    commune,
    completeOnly,
    customer,
    dateFrom,
    dateScope,
    dateTo,
    lists,
    search,
    status,
    today,
    tomorrow,
    wilaya,
  ]);

  const filtersActive = Boolean(
    search ||
      status !== "all" ||
      changedOnly ||
      completeOnly ||
      dateScope !== "all" ||
      dateFrom ||
      dateTo ||
      customer ||
      wilaya ||
      commune,
  );
  const stats = statsData?.message;
  const drafts = stats?.drafts ?? lists.filter((list) => list.docstatus !== 1).length;
  const submitted = stats?.submitted ?? lists.filter((list) => list.docstatus === 1).length;
  const remaining =
    stats?.remainingQty ??
    lists.reduce((sum, list) => sum + pickListRemaining(list), 0);
  const changed = stats?.changed ?? lists.filter((list) => list.custom_order_changed).length;
  const completeCount = lists.filter((list) => pickListIncomplete(list)).length;
  const overdueCount = lists.filter((list) => {
    const due = pickListDueDate(list);
    return Boolean(due && due < today);
  }).length;
  const listTotal = Math.max(1, drafts + submitted);

  const stages = useMemo((): PreparationStage[] => {
    return [
      { id: "draft", step: 1, title: "Brouillons", value: drafts, unit: "listes", ratio: drafts / listTotal },
      {
        id: "submitted",
        step: 2,
        title: "Soumises",
        value: submitted,
        unit: "listes",
        ratio: submitted / listTotal,
        barTone: "success",
      },
      {
        id: "complete",
        step: 3,
        title: "À compléter",
        value: completeCount,
        unit: "reliquats",
        ratio: completeCount / listTotal,
        exception: remaining ? { label: `${formatQuantity(remaining)} restants`, tone: "warning" } : undefined,
        barTone: completeCount ? "danger" : "default",
      },
      {
        id: "overdue",
        step: 4,
        title: "En retard",
        value: overdueCount,
        unit: "échéances",
        ratio: overdueCount / listTotal,
        exception: changed ? { label: `${changed} modifiée${changed > 1 ? "s" : ""}`, tone: "warning" } : undefined,
        barTone: overdueCount ? "danger" : "default",
      },
    ];
  }, [changed, completeCount, drafts, listTotal, overdueCount, remaining, submitted]);

  const activeStage = completeOnly
    ? "complete"
    : dateScope === "overdue"
      ? "overdue"
      : changedOnly
        ? "overdue"
        : status === "all"
          ? null
          : status;

  const writeParams = (next: { dateScope?: DateScope; complete?: boolean }) => {
    const params: Record<string, string> = {};
    if (next.dateScope === "overdue") params.dateScope = "overdue";
    if (next.complete) params.complete = "1";
    setSearchParams(params);
  };

  const pickStage = (id: string) => {
    if (id === "draft") {
      setStatus((current) => (current === "draft" ? "all" : "draft"));
      setChangedOnly(false);
      setCompleteOnly(false);
      setDateScope("all");
      writeParams({});
      return;
    }
    if (id === "submitted") {
      setStatus((current) => (current === "submitted" ? "all" : "submitted"));
      setChangedOnly(false);
      setCompleteOnly(false);
      setDateScope("all");
      writeParams({});
      return;
    }
    if (id === "complete") {
      const next = !completeOnly;
      setCompleteOnly(next);
      setStatus("all");
      setChangedOnly(false);
      setDateScope("all");
      writeParams({ complete: next });
      return;
    }
    const nextOverdue = dateScope !== "overdue";
    setDateScope(nextOverdue ? "overdue" : "all");
    setChangedOnly(false);
    setCompleteOnly(false);
    setStatus("all");
    writeParams({ dateScope: nextOverdue ? "overdue" : "all" });
  };

  const resetFilters = () => {
    setSearch("");
    setStatus("all");
    setChangedOnly(false);
    setCompleteOnly(false);
    setDateScope("all");
    setDateFrom("");
    setDateTo("");
    setCustomer("");
    setWilaya("");
    setCommune("");
    setSearchParams({});
  };

  const selectedIds = Object.keys(selection).filter((id) => filtered.some((row) => row.name === id));
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

  const openList = (row: RecentPickList) => onOpenPickLists([row.name]);

  const columns: Array<ColumnDef<DataGridFeatures, RecentPickList>> = [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={allFilteredSelected}
          onCheckedChange={toggleAll}
          aria-label="Tout sélectionner"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={Boolean(selection[row.original.name])}
          onCheckedChange={() => toggle(row.original.name)}
          aria-label={`Sélectionner ${row.original.name}`}
          onClick={(event) => event.stopPropagation()}
        />
      ),
      size: 36,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "list",
      accessorFn: (row) => row.name,
      ...namedHeader("Liste · Client"),
      cell: ({ row }) => {
        const orders = row.original.sales_orders || [];
        const extra = orders.length > 1 ? ` +${orders.length - 1}` : "";
        const orderLabel = orders[0] ? `${orders[0]}${extra}` : "";
        return (
          <button
            type="button"
            className="flex min-w-0 flex-col text-left"
            onClick={() => openList(row.original)}
          >
            <span className="num truncate text-[12.5px] font-medium">{row.original.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {joinLabels(row.original.customer_names)}
              {orderLabel ? ` · ${orderLabel}` : ""}
              {row.original.warehouses?.length
                ? ` · ${joinLabels(row.original.warehouses, "Entrepôt non défini")}`
                : ""}
            </span>
          </button>
        );
      },
      size: 240,
      enableHiding: false,
    },
    {
      id: "status",
      accessorKey: "docstatus",
      header: () => <span className="block w-full text-center">État</span>,
      meta: { headerTitle: "État" },
      cell: ({ row }) => (
        <ListStateIcon
          state={
            row.original.docstatus === 1 && pickListIncomplete(row.original)
              ? "partial"
              : listStateFromDocstatus(row.original.docstatus)
          }
          orderChanged={Boolean(row.original.custom_order_changed)}
        />
      ),
      size: 72,
      enableSorting: false,
    },
    {
      id: "place",
      accessorFn: (row) => row.custom_commune_nom || row.custom_commune || joinLabels(row.commune_noms, ""),
      ...namedHeader("Lieu"),
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13px]">
            {row.original.custom_commune_nom || joinLabels(row.original.commune_noms) || "—"}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {joinLabels(row.original.wilayas)}
          </span>
        </div>
      ),
      size: 160,
    },
    {
      id: "due",
      accessorFn: (row) => pickListDueDate(row),
      ...namedHeader("Livraison"),
      cell: ({ row }) => {
        const due = pickListDueDate(row.original);
        const late = Boolean(due && due < today);
        return (
          <span
            className={cn(
              "num whitespace-nowrap text-[12.5px]",
              late ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {due ? formatShortDate(due) : "—"}
          </span>
        );
      },
      size: 96,
    },
    {
      id: "progress",
      accessorFn: (row) => row.picked_qty ?? 0,
      ...namedHeader("Prélevé"),
      cell: ({ row }) => {
        const picked = row.original.picked_qty ?? 0;
        const requested = row.original.requested_qty ?? 0;
        const pct = requested ? Math.round((picked / requested) * 100) : 0;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <div
              role="progressbar"
              aria-label={`Prélèvement ${formatQuantity(picked)} sur ${formatQuantity(requested)}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="h-1 min-w-[34px] flex-1 overflow-hidden rounded-full bg-muted"
            >
              <div
                className={cn(
                  "h-full",
                  pct === 100 ? "bg-emerald-600" : pct === 0 ? "bg-border" : "bg-foreground",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span
              className={cn(
                "num shrink-0 whitespace-nowrap text-[11.5px]",
                pct === 0 ? "text-muted-foreground/60" : "text-muted-foreground",
              )}
            >
              {formatQuantity(picked)} / {formatQuantity(requested)}
            </span>
          </div>
        );
      },
      size: 140,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <Alert>
          <AlertDescription>Impossible de charger les listes de prélèvement.</AlertDescription>
        </Alert>
      )}

      <PreparationStageKpis
        stages={stages}
        active={activeStage}
        onPick={pickStage}
        ariaLabel="État des listes"
      />

      <PreparationQueueShell
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Liste, commande, client…"
        searchAriaLabel="Rechercher une liste de prélèvement"
        chips={
          <>
            <button
              type="button"
              className={preparationChipClass(status === "draft")}
              onClick={() => setStatus((current) => (current === "draft" ? "all" : "draft"))}
            >
              <span className="size-1.5 rounded-full bg-muted-foreground/50" /> Brouillon
            </button>
            <button
              type="button"
              className={preparationChipClass(status === "submitted")}
              onClick={() => setStatus((current) => (current === "submitted" ? "all" : "submitted"))}
            >
              <span className="size-1.5 rounded-full bg-emerald-600" /> Soumise
            </button>
            <button
              type="button"
              className={preparationChipClass(changedOnly)}
              onClick={() => setChangedOnly((value) => !value)}
            >
              <span className="size-1.5 rounded-full bg-[#d97706]" /> Modifiée
            </button>
            <button
              type="button"
              className={preparationChipClass(dateScope === "overdue")}
              onClick={() => {
                const next = dateScope === "overdue" ? "all" : "overdue";
                setDateScope(next);
                writeParams({ dateScope: next, complete: completeOnly && next !== "overdue" });
              }}
            >
              <span className="size-1.5 rounded-full bg-destructive" /> Échéance dépassée
            </button>
            <button
              type="button"
              className={preparationChipClass(completeOnly)}
              onClick={() => {
                const next = !completeOnly;
                setCompleteOnly(next);
                writeParams({ complete: next, dateScope });
              }}
            >
              <span className="size-1.5 rounded-full bg-[#d97706]" /> À compléter
            </button>
          </>
        }
        visibleFilters={
          <>
            <FilterSelect
              label="Échéance"
              value={dateScope}
              className="h-[30px] shrink-0"
              onChange={(value) => {
                const next = value as DateScope;
                setDateScope(next);
                setDateFrom("");
                setDateTo("");
                writeParams({ dateScope: next, complete: completeOnly });
              }}
              options={[
                { value: "all", label: "Toutes" },
                { value: "today", label: "Aujourd’hui" },
                { value: "tomorrow", label: "Demain" },
                { value: "overdue", label: "En retard" },
              ]}
            />
            <DateRangeFilter
              label="Période"
              className="h-[30px] shrink-0 rounded-lg text-xs"
              from={dateFrom}
              to={dateTo}
              onChange={(range) => {
                setDateFrom(range.from);
                setDateTo(range.to);
                setDateScope("all");
              }}
            />
          </>
        }
        moreFilters={
          <PreparationMoreFilters>
            <FilterSelect
              label="Client"
              value={customer || "all"}
              onChange={(value) => setCustomer(value === "all" ? "" : value)}
              options={[{ value: "all", label: "Tous" }, ...customers.map((value) => ({ value, label: value }))]}
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
          </PreparationMoreFilters>
        }
        countLabel={`${filtered.length} / ${lists.length} listes`}
        heading={<h2 className="sr-only">Listes de prélèvement ({filtered.length})</h2>}
        filtersActive={filtersActive}
        onReset={resetFilters}
        selectionBar={
          selectedIds.length > 0 ? (
            <PreparationSelectionBar
              summary={`${selectedIds.length} liste${selectedIds.length > 1 ? "s" : ""} sélectionnée${selectedIds.length > 1 ? "s" : ""}`}
              actionLabel={selectedIds.length > 1 ? "Ouvrir les listes" : "Ouvrir la liste"}
              onAction={() => onOpenPickLists(selectedIds)}
              onClear={() => setSelection({})}
            />
          ) : undefined
        }
      >
        {isLoading && !lists.length ? (
          <Skeleton className="h-72 w-full rounded-none" aria-hidden="true" />
        ) : (
          <PreparationSubTableGrid
            label="Listes de prélèvement"
            columns={columns}
            rows={filtered}
            getRowId={(row) => row.name}
            expandContent={(row) => <PickListItemsSubGrid items={row.items || []} />}
            canExpand={(row) => (row.items?.length ?? 0) > 0}
            isLoading={isLoading && !lists.length}
            empty={
              <Empty className="border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ClipboardList />
                  </EmptyMedia>
                  <EmptyTitle>{lists.length ? "Aucune liste ne correspond" : "Aucune liste récente"}</EmptyTitle>
                  <EmptyDescription>
                    {lists.length
                      ? "Modifiez ou réinitialisez les filtres."
                      : "Les listes apparaissent automatiquement à la soumission d’une commande."}
                  </EmptyDescription>
                </EmptyHeader>
                {lists.length ? (
                  <EmptyContent>
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      Réinitialiser
                    </Button>
                  </EmptyContent>
                ) : null}
              </Empty>
            }
          />
        )}
      </PreparationQueueShell>
    </div>
  );
}
