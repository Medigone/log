import { useState } from "react";
import { AlertTriangle, ArrowRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiTile } from "@/components/ui/kpi-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiErrorMessage } from "@/shared/api/distribution";
import { useCustomerAnalytics, type AnalyticsQuery, type CustomerAnalyticsRow } from "@/shared/api/analytics";
import { formatMoney, formatShortDate } from "@/shared/format";
import { deltaTone, formatDelta, formatPercent } from "@/features/analytics/analyticsShared";

const ABC_TONE = { A: "success", B: "info", C: "neutral" } as const;

export function CustomerAnalyticsTable({ query, onShowItems }: { query: AnalyticsQuery; onShowItems: (customer: string) => void }) {
  const { data, error, isLoading } = useCustomerAnalytics(query);
  const [expanded, setExpanded] = useState<string | null>(null);
  const result = data?.message;

  const columns: Array<DataTableColumn<CustomerAnalyticsRow>> = [
    {
      id: "customer",
      header: "Client",
      sortValue: (row) => row.customer_name,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.customer_name}</p>
          <p className="truncate t-meta text-subtle">{row.items} article{row.items > 1 ? "s" : ""}</p>
        </div>
      ),
    },
    {
      id: "abc",
      header: "ABC",
      width: "64px",
      align: "center",
      sortValue: (row) => row.abc ?? "Z",
      cell: (row) => (row.abc ? <StatusBadge tone={ABC_TONE[row.abc]} size="sm" dot={false}>{row.abc}</StatusBadge> : "—"),
    },
    {
      id: "revenue",
      header: "CA HT",
      width: "120px",
      align: "right",
      numeric: true,
      hideBelow: "sm",
      sortValue: (row) => row.revenue,
      cell: (row) => formatMoney(row.revenue),
    },
    {
      id: "margin",
      header: "Marge",
      width: "130px",
      align: "right",
      numeric: true,
      sortValue: (row) => row.margin,
      cell: (row) => (
        <div>
          <p className={row.margin < 0 ? "font-medium text-red-700" : "font-medium"}>{formatMoney(row.margin)}</p>
          <p className="t-meta text-muted-foreground">{formatPercent(row.margin_rate)}</p>
        </div>
      ),
    },
    {
      id: "share",
      header: "Part marge",
      width: "96px",
      align: "right",
      numeric: true,
      hideBelow: "lg",
      sortValue: (row) => row.margin_share ?? -1,
      cell: (row) => formatPercent(row.margin_share),
    },
    {
      id: "basket",
      header: "BL · panier moyen",
      width: "150px",
      align: "right",
      numeric: true,
      hideBelow: "md",
      sortValue: (row) => row.avg_basket ?? 0,
      cell: (row) => `${row.deliveries} · ${row.avg_basket == null ? "—" : formatMoney(row.avg_basket)}`,
    },
    {
      id: "last",
      header: "Dernier achat",
      width: "110px",
      align: "right",
      numeric: true,
      hideBelow: "lg",
      sortValue: (row) => row.last_purchase ?? "",
      cell: (row) => formatShortDate(row.last_purchase ?? undefined),
    },
    {
      id: "trend",
      header: "Évol. marge",
      width: "96px",
      align: "right",
      numeric: true,
      hideBelow: "xl",
      sortValue: (row) => row.margin_delta ?? -Infinity,
      cell: (row) => {
        const delta = formatDelta(row.margin_delta);
        return delta ? <StatusBadge tone={deltaTone(row.margin_delta)} size="sm" dot={false}>{delta}</StatusBadge> : "—";
      },
    },
  ];

  if (error) {
    return (
      <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <AlertTriangle className="size-4 shrink-0" />
        {apiErrorMessage(error)}
      </p>
    );
  }

  const totals = result?.totals;
  return (
    <div className="flex flex-col gap-3">
      <section aria-label="Indicateurs clients" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={Users} label="Clients servis" value={totals ? totals.customers : "—"} />
        <KpiTile label="Marge clients" value={totals ? formatMoney(totals.margin) : "—"} hint={totals ? `Taux de marque ${formatPercent(totals.margin_rate)}` : undefined} />
        <KpiTile
          label="Clients A"
          value={result ? result.customers.filter((row) => row.abc === "A").length : "—"}
          hint="font 80 % de la marge"
        />
        <KpiTile
          tone={totals?.losing_customers ? "danger" : "neutral"}
          label="Clients à marge négative"
          value={totals ? totals.losing_customers : "—"}
        />
      </section>
      <DataTable
        label="Analyse par client"
        columns={columns}
        rows={result?.customers ?? []}
        rowKey={(row) => row.customer}
        rowTone={(row) => (row.margin < 0 ? "danger" : undefined)}
        defaultSort={{ id: "margin", direction: "desc" }}
        isLoading={isLoading && !result}
        onRowClick={(row) => setExpanded((current) => (current === row.customer ? null : row.customer))}
        isRowActive={(row) => row.customer === expanded}
        isRowExpanded={(row) => row.customer === expanded}
        expandedContent={(row) => (
          <div className="flex flex-col gap-3 bg-surface-subtle/60 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="t-micro text-muted-foreground">Articles qui rapportent le plus</h3>
              <ul className="mt-1.5 flex flex-col gap-0.5 text-xs">
                {row.top_items.map((item) => (
                  <li key={item.item_code} className="flex justify-between gap-3">
                    <span className="truncate">{item.item_name}</span>
                    <span className={`num shrink-0 ${item.margin < 0 ? "text-red-700" : ""}`}>
                      {formatMoney(item.margin)} <span className="text-muted-foreground">sur {formatMoney(item.revenue)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <Button variant="outline" size="sm" onClick={() => onShowItems(row.customer)}>
              Analyser ses articles <ArrowRight />
            </Button>
          </div>
        )}
        maxHeight="max-h-[70vh]"
        empty={<EmptyState icon={Users} title="Aucune vente sur la période" description="Élargissez la période ou retirez les filtres." />}
      />
    </div>
  );
}
