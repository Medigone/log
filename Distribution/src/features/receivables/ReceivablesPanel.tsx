import { useMemo, useState } from "react";
import { CalendarClock, CircleAlert, Hourglass, Search, ShieldAlert, Wallet, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { KpiTile } from "@/components/ui/kpi-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toolbar } from "@/components/ui/toolbar";
import { formatPercent } from "@/features/analytics/analyticsShared";
import type { ReceivableBucket, ReceivableCustomer, ReceivablesData } from "@/shared/api/receivables";
import { cn } from "@/lib/utils";
import { formatMoney, formatShortDate } from "@/shared/format";

export type ReceivableFilter = "all" | "overdue" | "due_soon" | "d90_plus" | "over_limit";

const FILTER_OPTIONS: Array<{ value: ReceivableFilter; label: string }> = [
  { value: "all", label: "Tous les clients débiteurs" },
  { value: "overdue", label: "Avec des échéances dépassées" },
  { value: "due_soon", label: "Échéances proches" },
  { value: "d90_plus", label: "Retard de plus de 90 jours" },
  { value: "over_limit", label: "Plafond de crédit dépassé" },
];

const BUCKET_COLUMNS: Array<{ bucket: ReceivableBucket; label: string; tone?: string }> = [
  { bucket: "not_due", label: "Non échu" },
  { bucket: "d30", label: "1–30 j" },
  { bucket: "d60", label: "31–60 j", tone: "text-amber-700" },
  { bucket: "d90", label: "61–90 j", tone: "text-orange-700" },
  { bucket: "d90_plus", label: "> 90 j", tone: "text-red-700" },
];

function matches(row: ReceivableCustomer, filter: ReceivableFilter) {
  if (filter === "overdue") return row.overdue > 0;
  if (filter === "due_soon") return row.due_soon > 0;
  if (filter === "d90_plus") return row.d90_plus > 0;
  if (filter === "over_limit") return row.over_limit;
  return true;
}

/** Indicateurs globaux des créances, au jour (indépendants de la période analysée). */
export function ReceivablesKpis({
  data,
  filter,
  onPick,
}: {
  data?: ReceivablesData;
  /** Filtre actif du tableau : la tuile correspondante est mise en avant. */
  filter?: ReceivableFilter;
  onPick: (filter: ReceivableFilter) => void;
}) {
  const totals = data?.totals;
  const active = (value: ReceivableFilter) => (filter === value ? "border-brand-300 bg-brand-50/50" : undefined);
  return (
    <section aria-label="Indicateurs des créances" className="flex flex-col gap-2">
      <p className="t-meta text-muted-foreground">{data ? `Situation au ${formatShortDate(data.as_of)}` : "Situation du jour"}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <KpiTile
          icon={Wallet}
          label="Créance totale"
          value={totals ? formatMoney(totals.net) : "—"}
          hint={
            totals
              ? `${totals.customers} client${totals.customers > 1 ? "s" : ""} · ${totals.invoices} facture${totals.invoices > 1 ? "s" : ""}${
                  totals.credits ? ` · avoirs ${formatMoney(totals.credits)}` : ""
                }`
              : undefined
          }
          onClick={() => onPick("all")}
          className={active("all")}
        />
        <KpiTile
          icon={CircleAlert}
          tone={totals?.overdue ? "danger" : "neutral"}
          label="Échue"
          value={totals ? formatMoney(totals.overdue) : "—"}
          hint={totals ? `${formatPercent(totals.overdue_share)} de la créance · ${totals.overdue_customers} client${totals.overdue_customers > 1 ? "s" : ""}` : undefined}
          onClick={() => onPick("overdue")}
          className={active("overdue")}
        />
        <KpiTile
          icon={CalendarClock}
          tone={totals?.due_soon ? "warning" : "neutral"}
          label={`À échéance sous ${data?.soon_days ?? 7} jours`}
          value={totals ? formatMoney(totals.due_soon) : "—"}
          hint={totals ? `${totals.due_soon_customers} client${totals.due_soon_customers > 1 ? "s" : ""} à relancer` : undefined}
          onClick={() => onPick("due_soon")}
          className={active("due_soon")}
        />
        <KpiTile
          icon={Hourglass}
          tone={totals?.d90_plus ? "danger" : "neutral"}
          label="Retard > 90 jours"
          value={totals ? formatMoney(totals.d90_plus) : "—"}
          hint={totals ? `${totals.d90_customers} client${totals.d90_customers > 1 ? "s" : ""} · risque d’impayé` : undefined}
          onClick={() => onPick("d90_plus")}
          className={active("d90_plus")}
        />
        <KpiTile
          icon={ShieldAlert}
          tone={totals?.over_limit_customers ? "warning" : "neutral"}
          label="Plafond dépassé"
          value={totals ? totals.over_limit_customers : "—"}
          hint="clients au-delà de leur limite de crédit"
          onClick={() => onPick("over_limit")}
          className={active("over_limit")}
        />
      </div>
    </section>
  );
}

/** Balance âgée par client. */
export function ReceivablesTable({
  data,
  isLoading,
  filter,
  onFilterChange,
}: {
  data?: ReceivablesData;
  isLoading?: boolean;
  filter: ReceivableFilter;
  onFilterChange: (filter: ReceivableFilter) => void;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.customers ?? []).filter(
      (row) =>
        matches(row, filter) &&
        (!needle || [row.customer_name, row.customer, row.wilaya, row.customer_group].some((value) => value?.toLowerCase().includes(needle))),
    );
  }, [data, filter, search]);

  const totals = data?.totals;
  const columns: Array<DataTableColumn<ReceivableCustomer>> = [
    {
      id: "customer",
      header: "Client",
      sortValue: (row) => row.customer_name,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.customer_name}</p>
          <p className="truncate t-meta text-subtle">
            {[row.customer_group, row.wilaya, `${row.invoices} facture${row.invoices > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
          </p>
        </div>
      ),
    },
    {
      id: "net",
      header: "Créance",
      width: "130px",
      align: "right",
      numeric: true,
      sortValue: (row) => row.net,
      cell: (row) => (
        <div>
          <p className="font-semibold">{formatMoney(row.net)}</p>
          {row.credits ? <p className="t-meta text-muted-foreground">avoirs {formatMoney(row.credits)}</p> : null}
        </div>
      ),
    },
    ...BUCKET_COLUMNS.map(
      ({ bucket, label, tone }): DataTableColumn<ReceivableCustomer> => ({
        id: bucket,
        header: label,
        width: "110px",
        align: "right",
        numeric: true,
        hideBelow: bucket === "not_due" ? "md" : "lg",
        sortValue: (row) => row[bucket],
        cell: (row) => (row[bucket] ? <span className={cn(tone && "font-medium", tone)}>{formatMoney(row[bucket])}</span> : <span className="text-subtle">—</span>),
      }),
    ),
    {
      id: "late",
      header: "Retard max",
      width: "110px",
      align: "right",
      numeric: true,
      sortValue: (row) => row.max_days_overdue,
      cell: (row) =>
        row.max_days_overdue ? (
          <StatusBadge tone={row.max_days_overdue > 90 ? "danger" : row.max_days_overdue > 30 ? "warning" : "neutral"} size="sm" dot={false}>
            {row.max_days_overdue} j
          </StatusBadge>
        ) : row.due_soon ? (
          <span className="t-meta text-amber-700">échéance proche</span>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    {
      id: "limit",
      header: "Plafond",
      width: "120px",
      align: "right",
      numeric: true,
      hideBelow: "xl",
      sortValue: (row) => row.credit_limit ?? 0,
      cell: (row) =>
        row.credit_limit ? (
          <span className={cn(row.over_limit && "font-medium text-red-700")} title={row.over_limit ? "Plafond de crédit dépassé" : undefined}>
            {formatMoney(row.credit_limit)}
          </span>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    {
      id: "payment",
      header: "Dernier règlement",
      width: "120px",
      align: "right",
      numeric: true,
      hideBelow: "lg",
      sortValue: (row) => row.last_payment ?? "",
      cell: (row) => formatShortDate(row.last_payment ?? undefined),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {totals ? (
        <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3" aria-label="Répartition par ancienneté">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            {BUCKET_COLUMNS.map(({ bucket }, index) =>
              totals.buckets[bucket] > 0 ? (
                <span
                  key={bucket}
                  className={["bg-emerald-500", "bg-sky-500", "bg-amber-500", "bg-orange-500", "bg-red-600"][index]}
                  style={{ width: `${(totals.buckets[bucket] / (totals.gross || 1)) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 t-meta text-muted-foreground">
            {BUCKET_COLUMNS.map(({ bucket, label }, index) => (
              <span key={bucket} className="inline-flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", ["bg-emerald-500", "bg-sky-500", "bg-amber-500", "bg-orange-500", "bg-red-600"][index])} />
                {label} <span className="num font-medium text-foreground">{formatMoney(totals.buckets[bucket])}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <Toolbar>
        <InputGroup className="min-w-48 flex-1 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Client, wilaya ou catégorie"
            aria-label="Rechercher un client débiteur"
          />
        </InputGroup>
        <FilterSelect
          label="Créances"
          value={filter}
          onChange={(value) => onFilterChange((value || "all") as ReceivableFilter)}
          options={FILTER_OPTIONS}
        />
        {filter !== "all" || search ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              onFilterChange("all");
            }}
          >
            <X /> Réinitialiser
          </Button>
        ) : null}
      </Toolbar>
      <DataTable
        label="Créances par client"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.customer}
        rowTone={(row) => (row.d90_plus > 0 ? "danger" : row.overdue > 0 ? "warning" : undefined)}
        onRowClick={(row) => navigate(`/clients/${encodeURIComponent(row.customer)}?tab=activite`)}
        isLoading={isLoading}
        empty={
          <EmptyState
            icon={Wallet}
            title={data?.customers.length ? "Aucun client ne correspond" : "Aucune créance en cours"}
            description={data?.customers.length ? "Modifiez la recherche ou le filtre." : "Toutes les factures clients sont réglées."}
          />
        }
      />
    </div>
  );
}
