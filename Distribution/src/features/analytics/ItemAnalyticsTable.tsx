import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ItemAnalyticsRow } from "@/shared/api/analytics";
import { formatMoney, formatQuantity } from "@/shared/format";
import { ItemAnalyticsDetail } from "@/features/analytics/ItemAnalyticsDetail";
import {
  ALERT_LABELS,
  deltaTone,
  formatDays,
  formatDelta,
  formatPercent,
  formatRatio,
  QUADRANTS,
} from "@/features/analytics/analyticsShared";

const ABC_TONE = { A: "success", B: "info", C: "neutral" } as const;

export function ItemAnalyticsTable({
  rows,
  expanded,
  onToggle,
  fromDate,
  toDate,
  empty,
}: {
  rows: ItemAnalyticsRow[];
  expanded: string | null;
  onToggle: (itemCode: string) => void;
  fromDate: string;
  toDate: string;
  empty: React.ReactNode;
}) {
  const columns: Array<DataTableColumn<ItemAnalyticsRow>> = [
    {
      id: "item",
      header: "Article",
      sortValue: (row) => row.item_name,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.item_name}</p>
          <p className="flex min-w-0 items-center gap-1.5 truncate t-meta text-subtle">
            {row.quadrant && (
              <StatusBadge tone={QUADRANTS[row.quadrant].tone} size="sm">
                {QUADRANTS[row.quadrant].label}
              </StatusBadge>
            )}
            <span className="truncate">
              {row.item_code}
              {row.brand ? ` · ${row.brand}` : ""}
            </span>
          </p>
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
      id: "qty",
      header: "Qté vendue",
      width: "100px",
      align: "right",
      numeric: true,
      hideBelow: "xl",
      sortValue: (row) => row.qty,
      cell: (row) => formatQuantity(row.qty),
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
      id: "stock",
      header: "Stock",
      width: "130px",
      align: "right",
      numeric: true,
      hideBelow: "md",
      sortValue: (row) => row.stock_value,
      cell: (row) => (
        <div>
          <p>{formatMoney(row.stock_value)}</p>
          <p className="t-meta text-muted-foreground">{formatDays(row.cover_days)} de couverture</p>
        </div>
      ),
    },
    {
      id: "gmroi",
      header: "Rotation · GMROI",
      width: "120px",
      align: "right",
      numeric: true,
      hideBelow: "lg",
      sortValue: (row) => row.gmroi ?? -1,
      cell: (row) => `${formatRatio(row.rotation)} · ${formatRatio(row.gmroi)}`,
    },
    {
      id: "trend",
      header: "Évol. CA",
      width: "84px",
      align: "right",
      numeric: true,
      hideBelow: "xl",
      sortValue: (row) => row.revenue_delta ?? -Infinity,
      cell: (row) => {
        const delta = formatDelta(row.revenue_delta);
        return delta ? <StatusBadge tone={deltaTone(row.revenue_delta)} size="sm" dot={false}>{delta}</StatusBadge> : "—";
      },
    },
    {
      id: "alerts",
      header: "Alertes",
      width: "170px",
      hideBelow: "md",
      sortValue: (row) => row.impact,
      cell: (row) => {
        const alerts = row.alerts.filter((alert) => alert.code !== "estimated_cost");
        if (!alerts.length) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="flex flex-wrap gap-1">
            {alerts.slice(0, 2).map((alert) => (
              <StatusBadge key={alert.code} tone={alert.tone} size="sm">
                {ALERT_LABELS[alert.code]}
              </StatusBadge>
            ))}
            {alerts.length > 2 && <span className="t-meta text-muted-foreground">+{alerts.length - 2}</span>}
          </span>
        );
      },
    },
  ];

  return (
    <DataTable
      label="Analyse par article"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.item_code}
      rowTone={(row) => (row.margin < 0 ? "danger" : undefined)}
      defaultSort={{ id: "margin", direction: "desc" }}
      onRowClick={(row) => onToggle(row.item_code)}
      isRowActive={(row) => row.item_code === expanded}
      isRowExpanded={(row) => row.item_code === expanded}
      expandedContent={(row) => <ItemAnalyticsDetail row={row} fromDate={fromDate} toDate={toDate} />}
      maxHeight="max-h-[70vh]"
      empty={empty}
    />
  );
}
