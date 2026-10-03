import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ClipboardCheck, Globe, LoaderCircle, Plus, Printer, ReceiptText, RefreshCw, Search, TrendingUp, Truck, X } from "lucide-react";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toolbar } from "@/components/ui/toolbar";
import { orderStatusTone } from "@/features/orders/orderStatus";
import { apiErrorMessage } from "@/shared/api/distribution";
import { openOrdersPdf, orderStatusLabel, useOrders, type OrderListFilter, type OrderSummary } from "@/shared/api/orders";
import { formatMoney, formatQuantity, formatShortDate } from "@/shared/format";

const STATUS_OPTIONS: Array<{ value: OrderListFilter; label: string }> = [
  { value: "all", label: "Toutes" },
  { value: "brouillon", label: "À valider" },
  { value: "a_livrer", label: "À livrer" },
  { value: "partielle", label: "Partiellement livrées" },
  { value: "soumise", label: "Validées" },
  { value: "annulee", label: "Annulées" },
];

const ORIGIN_OPTIONS = [
  { value: "all", label: "Toutes origines" },
  { value: "Interne", label: "Saisie interne" },
  { value: "Portail client", label: "Portail client" },
];

export function OrdersPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<OrderListFilter>("all");
  const [origin, setOrigin] = useState("all");
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const { data, error, isLoading, mutate } = useOrders(status, origin, mine);
  const orders = useMemo(() => data?.message?.orders ?? [], [data]);
  const counts = data?.message?.counts;

  const rows = useMemo(() => {
    const haystack = search.trim().toLocaleLowerCase("fr");
    if (!haystack) return orders;
    return orders.filter((row) =>
      [row.name, row.customer_name, row.customer, row.wilaya, row.owner_name]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("fr").includes(haystack)),
    );
  }, [orders, search]);

  const visibleNames = rows.map((row) => row.name);
  const allVisibleSelected = visibleNames.length > 0 && visibleNames.every((name) => selected.includes(name));
  const someVisibleSelected = visibleNames.some((name) => selected.includes(name));
  const toggle = (name: string, checked: boolean) =>
    setSelected((current) => (checked ? [...current.filter((item) => item !== name), name] : current.filter((item) => item !== name)));
  const toggleVisible = (checked: boolean) =>
    setSelected((current) =>
      checked ? [...current, ...visibleNames.filter((name) => !current.includes(name))] : current.filter((name) => !visibleNames.includes(name)),
    );

  const columns: Array<DataTableColumn<OrderSummary>> = [
    {
      id: "select",
      header: (
        <Checkbox
          aria-label="Sélectionner toutes les commandes affichées"
          checked={allVisibleSelected}
          indeterminate={!allVisibleSelected && someVisibleSelected}
          onCheckedChange={(checked) => toggleVisible(Boolean(checked))}
        />
      ),
      width: "40px",
      cell: (row) => (
        <span onClick={(event) => event.stopPropagation()} className="inline-flex">
          <Checkbox
            aria-label={`Sélectionner ${row.name}`}
            checked={selected.includes(row.name)}
            onCheckedChange={(checked) => toggle(row.name, Boolean(checked))}
          />
        </span>
      ),
    },
    {
      id: "customer",
      header: "Client",
      sortValue: (row) => row.customer_name,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.customer_name}</p>
          <p className="truncate t-meta text-subtle">
            {row.name}
            {row.wilaya ? ` · ${row.wilaya}` : ""}
            {row.origin === "Portail client" ? " · Portail" : ""}
          </p>
        </div>
      ),
    },
    {
      id: "date",
      header: "Date",
      width: "100px",
      hideBelow: "md",
      sortValue: (row) => row.transaction_date,
      cell: (row) => <span className="num">{formatShortDate(row.transaction_date)}</span>,
    },
    {
      id: "delivery",
      header: "Livraison",
      width: "100px",
      sortValue: (row) => row.delivery_date,
      cell: (row) => <span className="num">{formatShortDate(row.delivery_date)}</span>,
    },
    {
      id: "owner",
      header: "Saisie par",
      width: "150px",
      hideBelow: "lg",
      cell: (row) => <span className="truncate text-muted-foreground">{row.origin === "Portail client" ? "Client" : row.owner_name}</span>,
    },
    {
      id: "qty",
      header: "Unités",
      width: "80px",
      align: "right",
      numeric: true,
      hideBelow: "md",
      sortValue: (row) => row.total_qty,
      cell: (row) => formatQuantity(row.total_qty),
    },
    {
      id: "total",
      header: "Total TTC",
      width: "130px",
      align: "right",
      numeric: true,
      sortValue: (row) => row.total,
      cell: (row) => <span className="font-medium">{formatMoney(row.total)}</span>,
    },
    {
      id: "delivery",
      header: "Livraison",
      width: "110px",
      hideBelow: "md",
      sortValue: (row) => row.per_delivered,
      cell: (row) =>
        row.docstatus === 1 ? (
          <span className="flex items-center gap-2" title={`${Math.round(row.per_delivered)} % livré`}>
            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
              <span
                className={`block h-full ${row.per_delivered >= 100 ? "bg-emerald-600" : "bg-foreground"}`}
                style={{ width: `${Math.min(100, Math.max(0, row.per_delivered))}%` }}
              />
            </span>
            <span className="num text-[12px] text-muted-foreground">{Math.round(row.per_delivered)} %</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "status",
      header: "Statut",
      width: "150px",
      sortValue: (row) => row.docstatus,
      cell: (row) => (
        <StatusBadge tone={orderStatusTone(row.status, row.docstatus)}>
          {orderStatusLabel(row.status, row.docstatus, row.per_delivered)}
        </StatusBadge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Ventes"
        title="Commandes client"
        description="Saisie rapide des commandes : le responsable valide les brouillons avant la préparation."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void mutate()} disabled={isLoading}>
              {isLoading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Actualiser
            </Button>
            <Button onClick={() => navigate("/commandes/nouvelle")}>
              <Plus /> Nouvelle commande
            </Button>
          </div>
        }
      />

      <section aria-label="Indicateurs des commandes" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={ClipboardCheck}
          tone={counts?.brouillons ? "warning" : "neutral"}
          label="À valider"
          value={counts ? counts.brouillons : "—"}
          hint={counts?.brouillons_portail ? `dont ${counts.brouillons_portail} du portail` : "Brouillons en attente"}
          onClick={() => setStatus("brouillon")}
          className={status === "brouillon" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
        <KpiTile
          icon={Truck}
          tone={counts?.a_livrer ? "info" : "neutral"}
          label="À livrer"
          value={counts ? counts.a_livrer : "—"}
          hint="Validées, pas encore entièrement livrées"
          onClick={() => setStatus("a_livrer")}
          className={status === "a_livrer" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
        <KpiTile
          icon={ReceiptText}
          tone="info"
          label="Validées aujourd’hui"
          value={counts ? counts.soumises_aujourdhui : "—"}
          onClick={() => setStatus("soumise")}
          className={status === "soumise" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
        <KpiTile
          icon={TrendingUp}
          tone="success"
          label="Montant validé aujourd’hui"
          value={counts ? formatMoney(counts.montant_aujourdhui) : "—"}
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
            placeholder="Client, n° de commande, wilaya…"
            aria-label="Rechercher une commande"
          />
        </InputGroup>
        <FilterSelect label="Statut" value={status} onChange={(value) => setStatus(value as OrderListFilter)} options={STATUS_OPTIONS} />
        <FilterSelect label="Origine" value={origin} onChange={setOrigin} options={ORIGIN_OPTIONS} />
        <Button variant={mine ? "default" : "outline"} aria-pressed={mine} onClick={() => setMine((value) => !value)}>
          Mes commandes
        </Button>
      </Toolbar>

      {selected.length ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-300 bg-brand-50/60 px-3 py-2"
          role="region"
          aria-label="Commandes sélectionnées"
        >
          <span className="text-[13px] font-medium">
            {selected.length} commande{selected.length > 1 ? "s" : ""} sélectionnée{selected.length > 1 ? "s" : ""}
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => openOrdersPdf(selected)}>
              <Printer /> Imprimer / PDF
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              <X /> Effacer la sélection
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(error)}
        </p>
      ) : null}

      <DataTable
        label="Commandes"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.name}
        rowTone={(row) => orderStatusTone(row.status, row.docstatus)}
        onRowClick={(row) => navigate(`/commandes/${encodeURIComponent(row.name)}`)}
        isLoading={isLoading && !orders.length}
        empty={
          <EmptyState
            icon={origin === "Portail client" ? Globe : ReceiptText}
            title={search ? "Aucune commande ne correspond" : "Aucune commande"}
            description={search ? "Modifiez la recherche ou les filtres." : "Saisissez la première commande client."}
            action={
              search ? null : (
                <Button onClick={() => navigate("/commandes/nouvelle")}>
                  <Plus /> Nouvelle commande
                </Button>
              )
            }
          />
        }
      />
    </>
  );
}
