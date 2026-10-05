import { CalendarX, ClipboardCheck, ClipboardList, PackageX, ScanSearch, Timer } from "lucide-react";
import { Link } from "react-router-dom";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatPercent } from "@/features/analytics/analyticsShared";
import { BarList, ErrorNote, Panel, PeriodToolbar, RefreshButton } from "@/features/pilotage/PilotageParts";
import { usePeriod } from "@/features/pilotage/usePeriod";
import { useStockOperations, type InventoryGap, type StockOperations } from "@/shared/api/pilotage";
import { formatMoney, formatShortDate } from "@/shared/format";

type ExpiryRow = StockOperations["expiry"]["items"][number];

const hours = (value: number | null) => (value == null ? "—" : value < 24 ? `${value.toLocaleString("fr-FR")} h` : `${(value / 24).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} j`);

const inventoryColumns: Array<DataTableColumn<InventoryGap>> = [
  {
    id: "title",
    header: "Inventaire",
    sortValue: (row) => row.title,
    cell: (row) => (
      <div className="min-w-0">
        <Link to={`/inventaires/${encodeURIComponent(row.name)}`} className="block truncate font-medium hover:underline">
          {row.title}
        </Link>
        <p className="t-meta text-subtle">Validé le {formatShortDate(row.validated_at)}</p>
      </div>
    ),
  },
  { id: "lines", header: "Lignes", width: "80px", align: "right", numeric: true, sortValue: (row) => row.lines, cell: (row) => row.lines },
  { id: "accuracy", header: "Justes", width: "90px", align: "right", numeric: true, sortValue: (row) => row.accuracy ?? -1, cell: (row) => formatPercent(row.accuracy) },
  { id: "shortage", header: "Manquants", width: "120px", align: "right", numeric: true, hideBelow: "md", sortValue: (row) => row.shortage, cell: (row) => (row.shortage ? <span className="text-red-700">−{formatMoney(row.shortage)}</span> : "—") },
  { id: "surplus", header: "Surplus", width: "120px", align: "right", numeric: true, hideBelow: "md", sortValue: (row) => row.surplus, cell: (row) => (row.surplus ? `+${formatMoney(row.surplus)}` : "—") },
  {
    id: "net",
    header: "Écart net",
    width: "130px",
    align: "right",
    numeric: true,
    sortValue: (row) => row.net,
    cell: (row) => <span className={row.net < 0 ? "font-medium text-red-700" : "font-medium"}>{formatMoney(row.net)}</span>,
  },
];

const expiryColumns: Array<DataTableColumn<ExpiryRow>> = [
  {
    id: "item",
    header: "Article",
    sortValue: (row) => row.item_name,
    cell: (row) => (
      <Link to={`/articles/${encodeURIComponent(row.item_code)}?tab=stock`} className="block truncate font-medium hover:underline">
        {row.item_name}
      </Link>
    ),
  },
  { id: "qty", header: "Qté", width: "80px", align: "right", numeric: true, sortValue: (row) => row.qty, cell: (row) => row.qty.toLocaleString("fr-FR") },
  { id: "value", header: "Valeur", width: "120px", align: "right", numeric: true, sortValue: (row) => row.value, cell: (row) => formatMoney(row.value) },
  {
    id: "expiry",
    header: "Péremption",
    width: "150px",
    align: "right",
    sortValue: (row) => row.days,
    cell: (row) => (
      <StatusBadge tone={row.days < 0 ? "danger" : row.days <= 30 ? "warning" : "neutral"} size="sm" dot={false}>
        {row.days < 0 ? `périmé depuis ${-row.days} j` : `${formatShortDate(row.next_expiry)} · ${row.days} j`}
      </StatusBadge>
    ),
  },
];

/** Préparer vite et juste, sans rupture, et ne pas laisser périmer le stock. */
export function StockOperationsPage() {
  const period = usePeriod("30");
  const { data, error, isValidating, mutate } = useStockOperations(period.range.from, period.range.to);
  const result = data?.message;
  const prep = result?.preparation;
  const expiry = result?.expiry.buckets;
  const atRisk = expiry ? expiry.expired + expiry.d30 + expiry.d60 + expiry.d90 : 0;

  return (
    <>
      <PageHeader
        eyebrow="Pilotage"
        title="Préparation & stock"
        description="Rythme et fiabilité de la préparation, ruptures qui bloquent les commandes, écarts d’inventaire et risque de péremption."
        actions={<RefreshButton onClick={() => void mutate()} busy={isValidating} />}
      />
      <PeriodToolbar period={period} />
      <ErrorNote error={error} />

      <section aria-label="Indicateurs de préparation et de stock" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiTile icon={ClipboardList} label="Listes de préparation" value={prep ? prep.pick_lists : "—"} hint={prep ? `${prep.completed} terminées · ${formatPercent(prep.completion_rate)}` : undefined} />
        <KpiTile icon={Timer} label="Durée de préparation" value={prep ? hours(prep.hours.median) : "—"} hint={prep?.hours.count ? `médiane · 9 sur 10 sous ${hours(prep.hours.p90)}` : "création → validation de la liste"} />
        <KpiTile
          icon={ClipboardCheck}
          tone={prep?.late_orders ? "danger" : "neutral"}
          label="Commandes en retard"
          value={prep ? prep.late_orders : "—"}
          hint={prep ? `${formatMoney(prep.late_amount)} · date de livraison dépassée, non préparées` : undefined}
        />
        <KpiTile
          icon={ScanSearch}
          tone={prep?.picking_errors ? "warning" : "neutral"}
          label="Écarts de préparation"
          value={prep ? prep.picking_errors : "—"}
          hint={prep ? `${formatPercent(prep.error_rate)} des listes terminées` : undefined}
        />
        <KpiTile
          icon={PackageX}
          tone={result?.shortage.lines ? "warning" : "neutral"}
          label="Lignes non réservées"
          value={result ? result.shortage.lines : "—"}
          hint={result ? `${result.shortage.orders} commande(s) · ${formatMoney(result.shortage.value)} bloqués par la rupture` : undefined}
        />
        <KpiTile
          icon={CalendarX}
          tone={expiry?.expired ? "danger" : atRisk ? "warning" : "neutral"}
          label="Stock à risque de péremption"
          value={expiry ? formatMoney(atRisk) : "—"}
          hint={expiry ? `dont périmé ${formatMoney(expiry.expired)} · 90 prochains jours` : undefined}
        />
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Panel title="Péremption" hint="valeur au coût du stock">
          <BarList
            empty="Aucun lot ne périme dans les 90 jours."
            rows={
              expiry
                ? [
                    { key: "expired", label: "Déjà périmé", value: expiry.expired, display: formatMoney(expiry.expired), tone: "danger" as const },
                    { key: "d30", label: "Sous 30 jours", value: expiry.d30, display: formatMoney(expiry.d30), tone: "warning" as const },
                    { key: "d60", label: "31 à 60 jours", value: expiry.d60, display: formatMoney(expiry.d60), tone: "warning" as const },
                    { key: "d90", label: "61 à 90 jours", value: expiry.d90, display: formatMoney(expiry.d90) },
                  ]
                : []
            }
          />
        </Panel>
        <Panel title="Lots à écouler en priorité" hint="20 plus proches de la péremption">
          <DataTable label="Lots proches de la péremption" columns={expiryColumns} rows={result?.expiry.items ?? []} rowKey={(row) => row.item_code} rowTone={(row) => (row.days < 0 ? "danger" : undefined)} />
        </Panel>
      </div>

      <Panel
        title="Écarts d’inventaire"
        hint={
          result?.inventory_totals.count
            ? `${result.inventory_totals.count} inventaire(s) validé(s) · écart net ${formatMoney(result.inventory_totals.net)}`
            : "inventaires validés sur la période"
        }
      >
        <DataTable label="Écarts d’inventaire" columns={inventoryColumns} rows={result?.inventories ?? []} rowKey={(row) => row.name} rowTone={(row) => (row.net < 0 ? "danger" : undefined)} />
      </Panel>
    </>
  );
}
