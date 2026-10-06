import { CircleCheck, Clock, Repeat, Timer, Truck } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatPercent } from "@/features/analytics/analyticsShared";
import { BarList, ErrorNote, Panel, PeriodToolbar, RefreshButton } from "@/features/pilotage/PilotageParts";
import { usePeriod } from "@/features/pilotage/usePeriod";
import { useDeliveryPerformance, type DriverPerformance, type OutcomeRow, type VehiclePerformance } from "@/shared/api/pilotage";
import { formatMoney } from "@/shared/format";

const days = (value: number | null) => (value == null ? "—" : `${value.toLocaleString("fr-FR")} j`);

function RateBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-subtle">—</span>;
  const tone = value >= 0.95 ? "success" : value >= 0.85 ? "warning" : "danger";
  return (
    <StatusBadge tone={tone} size="sm" dot={false}>
      {formatPercent(value)}
    </StatusBadge>
  );
}

const outcomeColumns = <T extends OutcomeRow>(label: string, name: (row: T) => string): Array<DataTableColumn<T>> => [
  { id: "name", header: label, sortValue: name, cell: (row) => <span className="font-medium">{name(row)}</span> },
  { id: "closed", header: "BL", width: "70px", align: "right", numeric: true, sortValue: (row) => row.closed, cell: (row) => row.closed },
  { id: "failed", header: "Échecs", width: "80px", align: "right", numeric: true, sortValue: (row) => row.failed + row.partial, cell: (row) => row.failed + row.partial || "—" },
  { id: "success", header: "Réussite", width: "100px", align: "right", sortValue: (row) => row.success_rate ?? -1, cell: (row) => <RateBadge value={row.success_rate} /> },
  {
    id: "first",
    header: "1er passage",
    width: "100px",
    align: "right",
    numeric: true,
    hideBelow: "md",
    sortValue: (row) => row.first_attempt_rate ?? -1,
    cell: (row) => formatPercent(row.first_attempt_rate),
  },
];

const driverColumns: Array<DataTableColumn<DriverPerformance>> = [
  ...outcomeColumns<DriverPerformance>("Livreur", (row) => row.name),
  {
    id: "pace",
    header: "BL / jour",
    width: "90px",
    align: "right",
    numeric: true,
    hideBelow: "lg",
    sortValue: (row) => row.stops_per_day ?? 0,
    cell: (row) => (row.stops_per_day == null ? "—" : row.stops_per_day.toLocaleString("fr-FR")),
  },
  {
    id: "gap",
    header: "Écart caisse",
    width: "120px",
    align: "right",
    numeric: true,
    sortValue: (row) => row.cash_gap,
    cell: (row) => (row.cash_gap ? <span className="font-medium text-red-700">{formatMoney(row.cash_gap)}</span> : <span className="text-subtle">—</span>),
  },
];

const vehicleColumns: Array<DataTableColumn<VehiclePerformance>> = [
  { id: "vehicle", header: "Véhicule", sortValue: (row) => row.vehicle_name, cell: (row) => <span className="font-medium">{row.vehicle_name}</span> },
  { id: "stops", header: "BL", width: "70px", align: "right", numeric: true, sortValue: (row) => row.stops, cell: (row) => row.stops },
  { id: "fuel", header: "Carburant", width: "120px", align: "right", numeric: true, sortValue: (row) => row.fuel, cell: (row) => (row.fuel ? formatMoney(row.fuel) : "—") },
  { id: "km", header: "Km", width: "90px", align: "right", numeric: true, hideBelow: "md", sortValue: (row) => row.km, cell: (row) => (row.km ? row.km.toLocaleString("fr-FR") : "—") },
  { id: "per_km", header: "Coût / km", width: "100px", align: "right", numeric: true, hideBelow: "lg", sortValue: (row) => row.cost_per_km ?? 0, cell: (row) => (row.cost_per_km == null ? "—" : formatMoney(row.cost_per_km)) },
  { id: "per_stop", header: "Coût / BL", width: "100px", align: "right", numeric: true, sortValue: (row) => row.cost_per_stop ?? 0, cell: (row) => (row.cost_per_stop == null ? "—" : formatMoney(row.cost_per_stop)) },
  { id: "maintenance", header: "Entretiens", width: "100px", align: "right", numeric: true, hideBelow: "md", sortValue: (row) => row.maintenance, cell: (row) => row.maintenance || "—" },
];

/** Livrer du premier coup, à l'heure, au bon coût. */
export function DeliveryPerformancePage() {
  const period = usePeriod("30");
  const { data, error, isValidating, mutate } = useDeliveryPerformance(period.range.from, period.range.to);
  const result = data?.message;
  const totals = result?.totals;
  const failures = (result?.reasons ?? []).reduce((sum, row) => sum + row.count, 0);

  return (
    <>
      <PageHeader
        eyebrow="Pilotage"
        title="Performance livraison"
        description="Taux de réussite, livraisons au premier passage et à l’heure, causes d’échec, et coût de la flotte."
        actions={<RefreshButton onClick={() => void mutate()} busy={isValidating} />}
      />
      <PeriodToolbar period={period} />
      <ErrorNote error={error} />

      <section aria-label="Indicateurs de livraison" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <KpiTile icon={Truck} label="BL clôturés" value={totals ? totals.closed : "—"} hint={totals ? `${totals.delivered} livrés · ${totals.partial} partiels · ${totals.failed} non livrés` : undefined} />
        <KpiTile
          icon={CircleCheck}
          tone={totals?.success_rate != null && totals.success_rate < 0.9 ? "warning" : "neutral"}
          label="Taux de réussite"
          value={totals ? formatPercent(totals.success_rate) : "—"}
          hint="BL livrés en totalité"
        />
        <KpiTile icon={Repeat} label="Au premier passage" value={totals ? formatPercent(totals.first_attempt_rate) : "—"} hint="livrés sans replanification" />
        <KpiTile
          icon={Clock}
          tone={totals?.on_time_rate != null && totals.on_time_rate < 0.9 ? "warning" : "neutral"}
          label="À l’heure"
          value={totals ? formatPercent(totals.on_time_rate) : "—"}
          hint="livrés au plus tard à la date promise"
        />
        <KpiTile
          icon={Timer}
          label="Délai commande → livraison"
          value={totals ? days(totals.lead_time.median) : "—"}
          hint={totals?.lead_time.count ? `médiane · moyenne ${days(totals.lead_time.average)} · 9 sur 10 sous ${days(totals.lead_time.p90)}` : undefined}
        />
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel title="Causes d’échec" hint={failures ? `${failures} motif(s) déclarés` : undefined}>
          <BarList
            empty="Aucun échec sur la période."
            rows={(result?.reasons ?? []).map((row) => ({
              key: row.reason,
              label: row.reason,
              value: row.count,
              display: `${row.count} · ${formatPercent(row.count / (failures || 1))}`,
              tone: "danger",
            }))}
          />
        </Panel>
        <Panel title="Par commune" hint="15 communes les plus livrées">
          <DataTable label="Réussite par commune" columns={outcomeColumns<OutcomeRow>("Commune", (row) => row.name ?? row.key)} rows={result?.communes ?? []} rowKey={(row) => row.key} />
        </Panel>
      </div>

      <Panel title="Par livreur">
        <DataTable label="Performance par livreur" columns={driverColumns} rows={result?.drivers ?? []} rowKey={(row) => row.key} rowTone={(row) => (row.cash_gap ? "danger" : undefined)} />
      </Panel>
      <Panel title="Flotte" hint="carburant et entretiens saisis sur la période">
        <DataTable label="Coût de la flotte" columns={vehicleColumns} rows={result?.vehicles ?? []} rowKey={(row) => row.vehicle} />
      </Panel>
    </>
  );
}
