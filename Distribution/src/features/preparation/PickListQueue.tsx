import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList } from "lucide-react";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { usePickListQueueStats, useRecentPickLists, type RecentPickList } from "@/shared/api/preparation";
import { formatDateTime, formatQuantity } from "@/shared/format";
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

function joinLabels(values?: string[], empty = "—") {
  return values?.filter(Boolean).join(" · ") || empty;
}

export function PickListQueue({
  onOpenPickLists,
  onGoToOrders,
}: {
  onOpenPickLists: (names: string[]) => void;
  onGoToOrders: () => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ListStatus>("all");
  const [changedOnly, setChangedOnly] = useState(false);
  const [customer, setCustomer] = useState("");
  const [wilaya, setWilaya] = useState("");
  const [selection, setSelection] = useState<Record<string, true>>({});
  const { data, error, isLoading } = useRecentPickLists();
  const { data: statsData } = usePickListQueueStats();
  const lists = useMemo(() => data?.message || [], [data?.message]);

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

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return lists.filter((row) => {
      if (status === "draft" && row.docstatus !== 0) return false;
      if (status === "submitted" && row.docstatus !== 1) return false;
      if (changedOnly && !row.custom_order_changed) return false;
      if (customer && !(row.customer_names || []).includes(customer)) return false;
      if (wilaya && !(row.wilayas || []).includes(wilaya)) return false;
      if (!query) return true;
      return [
        row.name,
        ...(row.sales_orders || []),
        ...(row.customer_names || []),
        ...(row.wilayas || []),
        ...(row.delivery_notes || []),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("fr").includes(query));
    });
  }, [changedOnly, customer, lists, search, status, wilaya]);

  const filtersActive = Boolean(search || status !== "all" || changedOnly || customer || wilaya);
  const stats = statsData?.message;
  const drafts = stats?.drafts ?? lists.filter((list) => list.docstatus !== 1).length;
  const submitted = stats?.submitted ?? lists.filter((list) => list.docstatus === 1).length;
  const remaining =
    stats?.remainingQty ??
    lists.reduce((sum, list) => sum + Math.max(0, (list.requested_qty ?? 0) - (list.picked_qty ?? 0)), 0);
  const changed = stats?.changed ?? lists.filter((list) => list.custom_order_changed).length;
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
        id: "remaining",
        step: 3,
        title: "Articles restants",
        value: formatQuantity(remaining),
        unit: "à prélever",
        ratio: 0,
        exception: changed ? { label: `${changed} modifiée${changed > 1 ? "s" : ""}`, tone: "warning" } : undefined,
      },
    ];
  }, [changed, drafts, listTotal, remaining, submitted]);

  const activeStage = changedOnly ? "remaining" : status === "all" ? null : status;

  const pickStage = (id: string) => {
    if (id === "draft") {
      setStatus((current) => (current === "draft" ? "all" : "draft"));
      setChangedOnly(false);
      return;
    }
    if (id === "submitted") {
      setStatus((current) => (current === "submitted" ? "all" : "submitted"));
      setChangedOnly(false);
      return;
    }
    setChangedOnly((value) => !value);
  };

  const resetFilters = () => {
    setSearch("");
    setStatus("all");
    setChangedOnly(false);
    setCustomer("");
    setWilaya("");
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
      id: "name",
      accessorKey: "name",
      ...namedHeader("Liste · Entrepôt"),
      cell: ({ row }) => (
        <button
          type="button"
          className="flex min-w-0 flex-col text-left"
          onClick={() => onOpenPickLists([row.original.name])}
        >
          <span className="num truncate text-[12.5px] font-medium">{row.original.name}</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {joinLabels(row.original.warehouses, "Entrepôt non défini")}
          </span>
        </button>
      ),
      size: 200,
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
            row.original.docstatus === 1 && (row.original.picked_qty ?? 0) < (row.original.requested_qty ?? 0)
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
      id: "customers",
      accessorFn: (row) => joinLabels(row.customer_names),
      ...namedHeader("Client"),
      cell: ({ row }) => <span className="truncate text-[13px]">{joinLabels(row.original.customer_names)}</span>,
      size: 140,
    },
    {
      id: "wilaya",
      accessorFn: (row) => joinLabels(row.wilayas),
      ...namedHeader("Wilaya"),
      cell: ({ row }) => <span className="truncate text-[13px]">{joinLabels(row.original.wilayas)}</span>,
      size: 110,
    },
    {
      id: "orders",
      accessorFn: (row) => row.sales_order_count || row.sales_orders?.length || 0,
      ...namedHeader("Commandes"),
      cell: ({ row }) => {
        const orders = row.original.sales_orders || [];
        if (!orders.length) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="num truncate text-[12.5px]">
            {orders.slice(0, 2).join(", ")}
            {orders.length > 2 ? ` +${orders.length - 2}` : ""}
          </span>
        );
      },
      size: 150,
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
            <div className="h-1 min-w-[34px] flex-1 overflow-hidden rounded-full bg-muted">
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
    {
      id: "modified",
      accessorKey: "modified",
      header: () => <span className="block pl-3.5">Modifié</span>,
      meta: { headerTitle: "Modifié" },
      cell: ({ row }) => (
        <span className="num block whitespace-nowrap pl-3.5 text-[12.5px] text-muted-foreground">
          {formatDateTime(row.original.modified)}
        </span>
      ),
      size: 128,
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
        columns={3}
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
              onChange={(value) => setWilaya(value === "all" ? "" : value)}
              options={[{ value: "all", label: "Toutes" }, ...wilayas.map((value) => ({ value, label: value }))]}
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
                <EmptyContent>
                  {lists.length ? (
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      Réinitialiser
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={onGoToOrders}>
                      Voir les commandes
                    </Button>
                  )}
                </EmptyContent>
              </Empty>
            }
          />
        )}
      </PreparationQueueShell>
    </div>
  );
}
