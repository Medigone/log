import { useMemo, useState } from "react";
import { ClipboardList, RotateCcw, Search } from "lucide-react";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toolbar, ToolbarSpacer } from "@/components/ui/toolbar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRecentPickLists, type RecentPickList } from "@/shared/api/preparation";
import { pickListStatusTone } from "@/shared/design/statusTone";
import { formatDateTime, formatQuantity } from "@/shared/format";

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

  const columns: Array<DataTableColumn<RecentPickList>> = [
    {
      id: "name",
      header: "Liste",
      sortValue: (row) => row.name,
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-medium">{row.name}</p>
          <p className="truncate t-meta text-muted-foreground">
            {joinLabels(row.warehouses, "Entrepôt non défini")}
          </p>
        </div>
      ),
    },
    {
      id: "status",
      header: "État",
      width: "120px",
      sortValue: (row) => row.docstatus,
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <StatusBadge tone={pickListStatusTone(row.docstatus)} size="sm">
            {statusLabel(row.docstatus)}
          </StatusBadge>
          {row.custom_order_changed ? (
            <StatusBadge tone="warning" size="sm">Commande modifiée</StatusBadge>
          ) : null}
        </div>
      ),
    },
    {
      id: "customers",
      header: "Client",
      hideBelow: "md",
      sortValue: (row) => joinLabels(row.customer_names),
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate">{joinLabels(row.customer_names)}</p>
          {row.wilayas?.length ? (
            <p className="truncate t-meta text-muted-foreground">{joinLabels(row.wilayas)}</p>
          ) : null}
        </div>
      ),
    },
    {
      id: "orders",
      header: "Commandes",
      hideBelow: "lg",
      sortValue: (row) => row.sales_order_count || row.sales_orders?.length || 0,
      cell: (row) => {
        const orders = row.sales_orders || [];
        if (!orders.length) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="truncate">
            {orders.slice(0, 2).join(", ")}
            {orders.length > 2 ? ` +${orders.length - 2}` : ""}
          </span>
        );
      },
    },
    {
      id: "progress",
      header: "Prélevé",
      numeric: true,
      width: "120px",
      sortValue: (row) => row.picked_qty ?? 0,
      cell: (row) => (
        <span className="num">
          {formatQuantity(row.picked_qty ?? 0)} / {formatQuantity(row.requested_qty ?? 0)}
        </span>
      ),
    },
    {
      id: "modified",
      header: "Modifié",
      hideBelow: "md",
      width: "160px",
      sortValue: (row) => row.modified || "",
      cell: (row) => <span className="num t-meta text-muted-foreground">{formatDateTime(row.modified)}</span>,
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

      <DataTable
        label="Listes de prélèvement"
        columns={columns}
        rows={filtered}
        rowKey={(row) => row.name}
        onRowClick={(row) => onOpenPickList(row.name)}
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
