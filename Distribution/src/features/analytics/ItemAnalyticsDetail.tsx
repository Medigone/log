import { LoaderCircle } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KpiTile } from "@/components/ui/kpi-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiErrorMessage } from "@/shared/api/distribution";
import { useItemAnalyticsDetail, type ItemAnalyticsRow } from "@/shared/api/analytics";
import { formatMoney, formatQuantity, formatShortDate } from "@/shared/format";
import {
  ABC_HINTS,
  ALERT_LABELS,
  alertDetail,
  deltaTone,
  formatDays,
  formatDelta,
  formatPercent,
  formatRatio,
  primaryAction,
  QUADRANTS,
} from "@/features/analytics/analyticsShared";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const ABC_TONE = { A: "success", B: "info", C: "neutral" } as const;

function monthLabel(value: string) {
  const [year, month] = value.split("-");
  return `${MONTHS[Number(month) - 1] ?? month} ${year?.slice(2)}`;
}

/** Fiche d'analyse d'un article, en fenêtre : chiffres clés, action, prix, marge mensuelle, stock et clients. */
export function ItemAnalyticsDetail({
  row,
  fromDate,
  toDate,
  onClose,
}: {
  row: ItemAnalyticsRow;
  fromDate: string;
  toDate: string;
  onClose: () => void;
}) {
  const { data, error, isLoading } = useItemAnalyticsDetail(row.item_code, fromDate, toDate);
  const detail = data?.message;
  const action = primaryAction(row);
  const delta = formatDelta(row.revenue_delta);
  const uom = detail?.stock_uom ?? row.stock_uom ?? "";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm:max-w-6xl" className="sm:p-6">
        <DialogHeader className="pr-8">
          <div className="flex flex-wrap items-center gap-2">
            {row.quadrant && (
              <StatusBadge tone={QUADRANTS[row.quadrant].tone} size="sm">
                {QUADRANTS[row.quadrant].label}
              </StatusBadge>
            )}
            {row.abc && (
              <StatusBadge tone={ABC_TONE[row.abc]} size="sm" dot={false}>
                Classe {row.abc} · {ABC_HINTS[row.abc]}
              </StatusBadge>
            )}
            {row.disabled && <StatusBadge tone="neutral" size="sm">Désactivé</StatusBadge>}
          </div>
          <DialogTitle className="text-xl">{row.item_name}</DialogTitle>
          <DialogDescription>
            {[row.item_code, row.item_group, row.brand].filter(Boolean).join(" · ")} — du {formatShortDate(fromDate)} au{" "}
            {formatShortDate(toDate)}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="-mx-1 flex flex-col gap-5 px-1">
          <section aria-label="Chiffres clés" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiTile
              label="CA HT"
              value={formatMoney(row.revenue)}
              hint={delta ? <StatusBadge tone={deltaTone(row.revenue_delta)} size="sm" dot={false}>{delta} vs période préc.</StatusBadge> : "Pas d'historique"}
            />
            <KpiTile
              label="Marge"
              value={formatMoney(row.margin)}
              tone={row.margin < 0 ? "danger" : "neutral"}
              hint={`Marque ${formatPercent(row.margin_rate)} · ${formatPercent(row.margin_share)} de la marge totale`}
            />
            <KpiTile label="Quantité vendue" value={formatQuantity(row.qty)} hint={`${row.customers} clients · ${row.deliveries} BL`} />
            <KpiTile label="Stock" value={formatMoney(row.stock_value)} hint={`${formatQuantity(row.stock_qty)} ${uom} · ${formatDays(row.cover_days)} de couverture`} />
            <KpiTile label="Rotation" value={formatRatio(row.rotation)} hint="Stock écoulé par an" />
            <KpiTile label="GMROI" value={formatRatio(row.gmroi)} hint="Marge annuelle par DA de stock" />
          </section>

          {(action || row.alerts.length > 0) && (
            <section aria-label="Recommandation" className="grid gap-3 rounded-lg border bg-surface-subtle/60 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              {action && (
                <div>
                  <p className="t-micro text-muted-foreground">Action recommandée</p>
                  <p className="mt-1 text-base font-semibold">{action}</p>
                  {row.quadrant && <p className="t-meta text-muted-foreground">{QUADRANTS[row.quadrant].axes}</p>}
                </div>
              )}
              {row.alerts.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {row.alerts.map((alert) => (
                    <li key={alert.code} className="flex flex-wrap items-center gap-2 text-sm">
                      <StatusBadge tone={alert.tone} size="sm">{ALERT_LABELS[alert.code]}</StatusBadge>
                      <span className="text-muted-foreground">{alertDetail(alert)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="flex flex-col gap-5">
              <Panel title="Prix et marge">
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
                  <Fact label="Prix moyen vendu" value={row.avg_price == null ? "—" : formatMoney(row.avg_price, { precise: true })} />
                  <Fact label="Prix tarif" value={row.list_price == null ? "—" : formatMoney(row.list_price, { precise: true })} />
                  <Fact label="Remise moyenne" value={formatPercent(row.discount)} />
                  <Fact label="Manque à gagner (remises)" value={formatMoney(row.discount_loss)} />
                  <Fact label="Coût unitaire actuel" value={row.unit_cost == null ? "—" : formatMoney(row.unit_cost, { precise: true })} />
                  <Fact label="Taux de marge / marque" value={`${formatPercent(row.markup)} / ${formatPercent(row.margin_rate)}`} />
                  <Fact label="Dernière vente" value={formatShortDate(row.last_sale ?? undefined)} />
                </dl>
              </Panel>

              <Panel title="Marge par mois">
                {isLoading && !detail ? <Loading /> : detail ? <MonthlyBars series={detail.series} /> : null}
              </Panel>
            </div>

            <div className="flex flex-col gap-5">
              {error ? (
                <p role="alert" className="text-sm text-red-700">{apiErrorMessage(error)}</p>
              ) : isLoading && !detail ? (
                <Loading />
              ) : detail ? (
                <>
                  <Panel
                    title={`Meilleurs clients${detail.customer_count > detail.customers.length ? ` (${detail.customers.length} sur ${detail.customer_count})` : ""}`}
                  >
                    {detail.customers.length ? (
                      <table className="w-full text-sm">
                        <thead className="text-muted-foreground">
                          <tr className="border-b">
                            <th className="pb-1.5 text-left font-medium">Client</th>
                            <th className="pb-1.5 text-right font-medium">CA HT</th>
                            <th className="pb-1.5 text-right font-medium">Marque</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.customers.map((customer) => (
                            <tr key={customer.customer} className="border-b border-hairline last:border-0">
                              <td className="py-1.5 pr-3">{customer.customer_name}</td>
                              <td className="num py-1.5 text-right whitespace-nowrap">{formatMoney(customer.revenue)}</td>
                              <td className={`num py-1.5 pl-3 text-right ${customer.margin < 0 ? "text-red-700" : ""}`}>
                                {formatPercent(customer.margin_rate)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-sm text-muted-foreground">Aucune vente sur la période.</p>
                    )}
                  </Panel>

                  <Panel title="Stock par dépôt">
                    {detail.warehouses.length ? (
                      <ul className="flex flex-col gap-1 text-sm">
                        {detail.warehouses.map((entry) => (
                          <li key={entry.warehouse} className="flex justify-between gap-3">
                            <span className="text-muted-foreground">{entry.warehouse}</span>
                            <span className="num shrink-0">{formatQuantity(entry.qty)} {uom}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Aucun stock.</p>
                    )}
                  </Panel>

                  {detail.batches.length > 0 && (
                    <Panel title="Lots en stock">
                      <table className="w-full text-sm">
                        <thead className="text-muted-foreground">
                          <tr className="border-b">
                            <th className="pb-1.5 text-left font-medium">Lot</th>
                            <th className="pb-1.5 text-right font-medium">Quantité</th>
                            <th className="pb-1.5 text-right font-medium">DLC</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.batches.map((batch) => (
                            <tr key={batch.batch_no} className="border-b border-hairline last:border-0">
                              <td className="py-1.5 pr-3 text-muted-foreground">{batch.batch_no}</td>
                              <td className="num py-1.5 text-right">{formatQuantity(batch.qty)}</td>
                              <td className="num py-1.5 pl-3 text-right">{formatShortDate(batch.expiry_date ?? undefined)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Panel>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="t-micro text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Loading() {
  return (
    <div className="grid min-h-24 place-items-center">
      <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
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
  if (!series.length) return <p className="text-sm text-muted-foreground">Aucune vente sur la période.</p>;
  const max = Math.max(1, ...series.map((entry) => Math.abs(entry.margin)));
  return (
    <div className="flex h-44 items-end gap-2">
      {series.map((entry) => (
        <div
          key={entry.month}
          className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
          title={`${monthLabel(entry.month)} : marge ${formatMoney(entry.margin)} · CA ${formatMoney(entry.revenue)}`}
        >
          <span className="num truncate text-[11px] text-muted-foreground">{formatMoney(entry.margin)}</span>
          <div
            className={`w-full max-w-16 rounded-t-sm ${entry.margin < 0 ? "bg-red-400" : "bg-foreground/70"}`}
            style={{ height: `${Math.max(3, Math.round((Math.abs(entry.margin) / max) * 110))}px` }}
          />
          <span className="num text-[11px] text-muted-foreground">{monthLabel(entry.month)}</span>
        </div>
      ))}
    </div>
  );
}
