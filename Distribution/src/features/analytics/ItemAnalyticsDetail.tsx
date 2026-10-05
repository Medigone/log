import { LoaderCircle } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiErrorMessage } from "@/shared/api/distribution";
import { useItemAnalyticsDetail, type ItemAnalyticsRow } from "@/shared/api/analytics";
import { formatMoney, formatQuantity, formatShortDate } from "@/shared/format";
import { ALERT_LABELS, alertDetail, formatDays, formatPercent, formatRatio, primaryAction, QUADRANTS } from "@/features/analytics/analyticsShared";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function monthLabel(value: string) {
  const [year, month] = value.split("-");
  return `${MONTHS[Number(month) - 1] ?? month} ${year?.slice(2)}`;
}

/** Détail d'un article dans la ligne dépliée : chiffres clés, alertes, marge mensuelle, clients, stock. */
export function ItemAnalyticsDetail({ row, fromDate, toDate }: { row: ItemAnalyticsRow; fromDate: string; toDate: string }) {
  const { data, error, isLoading } = useItemAnalyticsDetail(row.item_code, fromDate, toDate);
  const detail = data?.message;
  const action = primaryAction(row);

  return (
    <div className="grid gap-4 bg-surface-subtle/60 p-4 lg:grid-cols-3">
      <section aria-label="Chiffres clés" className="flex flex-col gap-3">
        {action && (
          <p className="rounded-md border bg-card px-3 py-2 text-sm">
            <span className="t-micro text-muted-foreground">Action recommandée</span>
            <span className="mt-0.5 block font-medium">{action}</span>
            {row.quadrant && <span className="t-meta text-muted-foreground">{QUADRANTS[row.quadrant].label} · {QUADRANTS[row.quadrant].axes}</span>}
          </p>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <Fact label="Prix moyen vendu" value={row.avg_price == null ? "—" : formatMoney(row.avg_price, { precise: true })} />
          <Fact label="Prix tarif" value={row.list_price == null ? "—" : formatMoney(row.list_price, { precise: true })} />
          <Fact label="Coût unitaire actuel" value={row.unit_cost == null ? "—" : formatMoney(row.unit_cost, { precise: true })} />
          <Fact label="Taux de marge / marque" value={`${formatPercent(row.markup)} / ${formatPercent(row.margin_rate)}`} />
          <Fact label="Rotation · GMROI" value={`${formatRatio(row.rotation)} · ${formatRatio(row.gmroi)}`} />
          <Fact label="Couverture" value={formatDays(row.cover_days)} />
          <Fact label="Clients · BL" value={`${row.customers} · ${row.deliveries}`} />
          <Fact label="Dernière vente" value={formatShortDate(row.last_sale ?? undefined)} />
        </dl>
        {row.alerts.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {row.alerts.map((alert) => (
              <li key={alert.code} className="flex flex-wrap items-center gap-2 text-xs">
                <StatusBadge tone={alert.tone} size="sm">{ALERT_LABELS[alert.code]}</StatusBadge>
                <span className="text-muted-foreground">{alertDetail(alert)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isLoading && !detail ? (
        <div className="grid place-items-center lg:col-span-2">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p role="alert" className="text-sm text-red-700 lg:col-span-2">{apiErrorMessage(error)}</p>
      ) : detail ? (
        <>
          <section aria-label="Marge par mois" className="flex flex-col gap-2">
            <h3 className="t-micro text-muted-foreground">Marge par mois</h3>
            <MonthlyBars series={detail.series} />
            <h3 className="mt-2 t-micro text-muted-foreground">Stock par dépôt</h3>
            {detail.warehouses.length ? (
              <ul className="flex flex-col gap-0.5 text-xs">
                {detail.warehouses.map((entry) => (
                  <li key={entry.warehouse} className="flex justify-between gap-3">
                    <span className="truncate text-muted-foreground">{entry.warehouse}</span>
                    <span className="num shrink-0">{formatQuantity(entry.qty)} {detail.stock_uom}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Aucun stock.</p>
            )}
            {detail.batches.length > 0 && (
              <>
                <h3 className="mt-2 t-micro text-muted-foreground">Lots en stock</h3>
                <ul className="flex flex-col gap-0.5 text-xs">
                  {detail.batches.map((batch) => (
                    <li key={batch.batch_no} className="flex justify-between gap-3">
                      <span className="truncate text-muted-foreground">{batch.batch_no}</span>
                      <span className="num shrink-0">
                        {formatQuantity(batch.qty)} · DLC {formatShortDate(batch.expiry_date ?? undefined)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section aria-label="Meilleurs clients" className="flex flex-col gap-2">
            <h3 className="t-micro text-muted-foreground">
              Meilleurs clients {detail.customer_count > detail.customers.length ? `(${detail.customers.length} sur ${detail.customer_count})` : ""}
            </h3>
            {detail.customers.length ? (
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="pb-1 text-left font-medium">Client</th>
                    <th className="pb-1 text-right font-medium">CA HT</th>
                    <th className="pb-1 text-right font-medium">Marque</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.customers.map((customer) => (
                    <tr key={customer.customer}>
                      <td className="max-w-0 truncate py-0.5 pr-2">{customer.customer_name}</td>
                      <td className="num py-0.5 text-right">{formatMoney(customer.revenue)}</td>
                      <td className={`num py-0.5 text-right ${customer.margin < 0 ? "text-red-700" : ""}`}>{formatPercent(customer.margin_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-muted-foreground">Aucune vente sur la période.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="num text-right">{value}</dd>
    </>
  );
}

function MonthlyBars({ series }: { series: Array<{ month: string; margin: number; revenue: number }> }) {
  if (!series.length) return <p className="text-xs text-muted-foreground">Aucune vente sur la période.</p>;
  const max = Math.max(1, ...series.map((entry) => Math.abs(entry.margin)));
  return (
    <div>
      <div className="flex h-24 items-end gap-1">
        {series.map((entry) => (
          <div
            key={entry.month}
            className="flex h-full flex-1 flex-col justify-end"
            title={`${monthLabel(entry.month)} : marge ${formatMoney(entry.margin)} · CA ${formatMoney(entry.revenue)}`}
          >
            <div
              className={entry.margin < 0 ? "rounded-t-sm bg-red-400" : "rounded-t-sm bg-foreground/70"}
              style={{ height: `${Math.max(3, Math.round((Math.abs(entry.margin) / max) * 88))}px` }}
            />
          </div>
        ))}
      </div>
      <div className="num mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{monthLabel(series[0].month)}</span>
        {series.length > 1 && <span>{monthLabel(series[series.length - 1].month)}</span>}
      </div>
    </div>
  );
}
