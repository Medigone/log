import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, ClipboardList, RotateCcw, Search } from "lucide-react";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toolbar, ToolbarSpacer } from "@/components/ui/toolbar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { useRecentPickLists, type RecentPickList } from "@/shared/api/preparation";
import { pickListStatusTone } from "@/shared/design/statusTone";
import { formatDateTime, formatQuantity } from "@/shared/format";
import { PickListItemsSubGrid, PreparationSubTableGrid, namedHeader } from "@/features/preparation/PreparationSubTableGrid";

type ListStatus = "all" | "draft" | "submitted";

function statusLabel(docstatus?: number) {
  return docstatus === 1 ? "Soumise" : "Brouillon";
}

function joinLabels(values?: string[], empty = "—") {
  return values?.filter(Boolean).join(" · ") || empty;
}

export function PickListQueue({
  onOpenPickList,
  onGoToOrders,
}: {
  onOpenPickList: (name: string) => void;
  onGoToOrders: () => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ListStatus>("all");
  const [customer, setCustomer] = useState("");
  const [wilaya, setWilaya] = useState("");
  const { data, error, isLoading } = useRecentPickLists();
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
  }, [customer, lists, search, status, wilaya]);

  const filtersActive = Boolean(search || status !== "all" || customer || wilaya);

  const resetFilters = () => {
    setSearch("");
    setStatus("all");
    setCustomer("");
    setWilaya("");
  };

  const columns: Array<ColumnDef<DataGridFeatures, RecentPickList>> = [
    {
      id: "name",
      accessorKey: "name",
      ...namedHeader("Liste"),
      cell: ({ row }) => (
        <button
          type="button"
          className="truncate text-left font-medium hover:underline"
          onClick={() => onOpenPickList(row.original.name)}
        >
          {row.original.name}
        </button>
      ),
      size: 170,
      enableHiding: false,
    },
    {
      id: "warehouse",
      accessorFn: (row) => joinLabels(row.warehouses, ""),
      ...namedHeader("Entrepôt"),
      cell: ({ row }) => (
        <span className="truncate">{joinLabels(row.original.warehouses, "Entrepôt non défini")}</span>
      ),
      size: 140,
    },
    {
      id: "status",
      accessorKey: "docstatus",
      ...namedHeader("État"),
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <StatusBadge tone={pickListStatusTone(row.original.docstatus)} size="sm">
            {statusLabel(row.original.docstatus)}
          </StatusBadge>
          {row.original.custom_order_changed ? (
            <span title="Commande modifiée">
              <AlertTriangle className="size-3.5 shrink-0 text-amber-600" aria-label="Commande modifiée" />
            </span>
          ) : null}
        </div>
      ),
      size: 120,
    },
    {
      id: "customers",
      accessorFn: (row) => joinLabels(row.customer_names),
      ...namedHeader("Client"),
      cell: ({ row }) => <span className="truncate">{joinLabels(row.original.customer_names)}</span>,
      size: 140,
    },
    {
      id: "wilaya",
      accessorFn: (row) => joinLabels(row.wilayas),
      ...namedHeader("Wilaya"),
      cell: ({ row }) => <span className="truncate">{joinLabels(row.original.wilayas)}</span>,
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
          <span className="truncate">
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
      cell: ({ row }) => (
        <span className="num whitespace-nowrap tabular-nums">
          {formatQuantity(row.original.picked_qty ?? 0)} / {formatQuantity(row.original.requested_qty ?? 0)}
        </span>
      ),
      size: 120,
    },
    {
      id: "modified",
      accessorKey: "modified",
      ...namedHeader("Modifié"),
      cell: ({ row }) => (
        <span className="num whitespace-nowrap t-meta text-muted-foreground">{formatDateTime(row.original.modified)}</span>
      ),
      size: 160,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <Alert>
          <AlertDescription>Impossible de charger les listes de prélèvement.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Listes de prélèvement ({filtered.length})</h2>
      </div>

      <Toolbar>
        <InputGroup className="min-w-48 flex-1 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Liste, commande, client…"
            aria-label="Rechercher une liste de prélèvement"
          />
        </InputGroup>
        <FilterSelect
          label="État"
          value={status}
          onChange={(value) => setStatus(value as ListStatus)}
          options={[
            { value: "all", label: "Toutes" },
            { value: "draft", label: "Brouillon" },
            { value: "submitted", label: "Soumise" },
          ]}
        />
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
                  : "Créez une liste depuis l’onglet Commandes."}
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
    </div>
  );
}
