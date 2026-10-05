import { AlertTriangle, Banknote, CalendarClock, HandCoins, ShieldCheck, Wallet } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader } from "@/components/ui/page-header";
import { formatPercent } from "@/features/analytics/analyticsShared";
import { BarList, ColumnChart, ErrorNote, Panel, PeriodToolbar, RefreshButton } from "@/features/pilotage/PilotageParts";
import { usePeriod } from "@/features/pilotage/usePeriod";
import { useCashOverview, type CashOverview } from "@/shared/api/pilotage";
import { formatMoney, formatShortDate } from "@/shared/format";

type DriverRow = CashOverview["drivers"][number];

const driverColumns: Array<DataTableColumn<DriverRow>> = [
  { id: "driver", header: "Livreur", sortValue: (row) => row.driver_name, cell: (row) => <span className="font-medium">{row.driver_name}</span> },
  { id: "payments", header: "Règlements", width: "110px", align: "right", numeric: true, sortValue: (row) => row.payments, cell: (row) => row.payments },
  { id: "collected", header: "Encaissé", width: "140px", align: "right", numeric: true, sortValue: (row) => row.collected, cell: (row) => formatMoney(row.collected) },
  {
    id: "gap",
    header: "Écarts de caisse",
    width: "140px",
    align: "right",
    numeric: true,
    sortValue: (row) => row.gap,
    cell: (row) => (row.gap ? <span className="font-medium text-red-700">{formatMoney(row.gap)}</span> : <span className="text-subtle">—</span>),
  },
];

/** Ce qui rentre, ce qui reste dehors, ce qui doit rentrer dans les 4 semaines. */
export function TreasuryPage() {
  const period = usePeriod("30");
  const { data, error, isValidating, mutate } = useCashOverview(period.range.from, period.range.to);
  const result = data?.message;
  const totals = result?.totals;
  const forecastTotal = result?.forecast.reduce((sum, bucket) => sum + bucket.total, 0) ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Pilotage"
        title="Trésorerie & encaissements"
        description="Ce que les livreurs ont encaissé, ce qui reste en caisse ou en écart, et ce qui doit rentrer dans les quatre prochaines semaines."
        actions={<RefreshButton onClick={() => void mutate()} busy={isValidating} />}
      />
      <PeriodToolbar period={period} />
      <ErrorNote error={error} />

      <section aria-label="Indicateurs de trésorerie" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <KpiTile
          icon={Banknote}
          label="Encaissé sur la période"
          value={totals ? formatMoney(totals.collected) : "—"}
          hint={totals ? totals.by_method.map((row) => `${row.method} ${formatMoney(row.amount)}`).join(" · ") || `${totals.payments} règlement(s)` : undefined}
        />
        <KpiTile
          icon={HandCoins}
          tone={totals?.collection_rate != null && totals.collection_rate < 0.9 ? "warning" : "neutral"}
          label="Taux d’encaissement tournées"
          value={totals ? formatPercent(totals.collection_rate) : "—"}
          hint={totals ? `${formatMoney(totals.tour_paid)} sur ${formatMoney(totals.expected)} attendus · ${totals.tours} tournée(s)` : undefined}
        />
        <KpiTile
          icon={Wallet}
          tone={totals?.cash_held ? "warning" : "neutral"}
          label="Caisses livreurs à remettre"
          value={totals ? formatMoney(totals.cash_held) : "—"}
          hint={result ? `${result.cash_boxes.length} livreur(s) avec un solde` : undefined}
        />
        <KpiTile
          icon={ShieldCheck}
          tone={totals?.to_control ? "warning" : "neutral"}
          label="À contrôler"
          value={totals ? formatMoney(totals.to_control) : "—"}
          hint="règlements déclarés, pas encore validés en caisse"
        />
        <KpiTile
          icon={AlertTriangle}
          tone={totals?.gaps ? "danger" : "neutral"}
          label="Écarts de caisse"
          value={totals ? formatMoney(totals.gaps) : "—"}
          hint={totals ? `${totals.gap_count} règlement(s) · ${totals.tours_with_gap} tournée(s) en écart` : undefined}
        />
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Encaissements par jour" hint={result ? `${formatShortDate(result.period.from_date)} – ${formatShortDate(result.period.to_date)}` : undefined}>
          <ColumnChart
            label="Encaissements quotidiens"
            format={(value) => formatMoney(value)}
            points={(result?.series ?? []).map((point) => ({ key: point.date, label: formatShortDate(point.date), value: point.amount }))}
          />
        </Panel>
        <Panel title="Encaissements attendus" hint={`${formatMoney(forecastTotal)} sur 4 semaines`}>
          <BarList
            empty="Aucune échéance à venir."
            rows={(result?.forecast ?? []).map((bucket) => ({
              key: bucket.label,
              label: (
                <span>
                  <span className="font-medium">{bucket.label}</span>{" "}
                  <span className="text-muted-foreground">
                    {bucket.from_date ? `${formatShortDate(bucket.from_date)} – ${formatShortDate(bucket.to_date)}` : "à relancer"}
                  </span>
                </span>
              ),
              value: bucket.total,
              display: bucket.orders ? `${formatMoney(bucket.total)} · dont commandes ${formatMoney(bucket.orders)}` : formatMoney(bucket.total),
              tone: bucket.from_date ? "default" : "danger",
            }))}
          />
          <p className="flex items-center gap-1.5 t-meta text-muted-foreground">
            <CalendarClock className="size-3.5" /> Factures non réglées et échéances des commandes non encore facturées.
          </p>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Encaissements par livreur">
          <DataTable label="Encaissements par livreur" columns={driverColumns} rows={result?.drivers ?? []} rowKey={(row) => row.driver ?? "aucun"} rowTone={(row) => (row.gap ? "danger" : undefined)} />
        </Panel>
        <Panel title="Caisses livreurs" hint="argent encore détenu par les livreurs">
          <BarList
            empty="Toutes les caisses sont remises."
            rows={(result?.cash_boxes ?? []).map((row) => ({
              key: row.driver,
              label: (
                <span>
                  {row.driver_name}
                  {row.updated ? <span className="text-muted-foreground"> · mis à jour le {formatShortDate(row.updated)}</span> : null}
                </span>
              ),
              value: row.balance,
              display: formatMoney(row.balance),
              tone: "warning",
            }))}
          />
        </Panel>
      </div>
    </>
  );
}
