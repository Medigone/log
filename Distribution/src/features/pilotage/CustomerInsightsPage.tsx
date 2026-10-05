import { Globe, Megaphone, UserMinus, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatPercent } from "@/features/analytics/analyticsShared";
import { BarList, ErrorNote, Panel, PeriodToolbar, RefreshButton } from "@/features/pilotage/PilotageParts";
import { usePeriod } from "@/features/pilotage/usePeriod";
import { useCustomerInsights, type CustomerAtRisk, type CustomerInsights, type SalesRepPerformance } from "@/shared/api/pilotage";
import { formatMoney, formatShortDate } from "@/shared/format";

type CampaignRow = CustomerInsights["campaigns"][number];

const riskColumns: Array<DataTableColumn<CustomerAtRisk>> = [
  {
    id: "customer",
    header: "Client",
    sortValue: (row) => row.customer_name,
    cell: (row) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{row.customer_name}</p>
        <p className="t-meta text-subtle">{row.orders} commandes sur 12 mois</p>
      </div>
    ),
  },
  { id: "revenue", header: "CA 12 mois", width: "130px", align: "right", numeric: true, sortValue: (row) => row.revenue, cell: (row) => formatMoney(row.revenue) },
  { id: "rhythm", header: "Rythme habituel", width: "130px", align: "right", numeric: true, hideBelow: "md", sortValue: (row) => row.rhythm_days, cell: (row) => `tous les ${Math.round(row.rhythm_days)} j` },
  { id: "last", header: "Dernière commande", width: "140px", align: "right", numeric: true, hideBelow: "sm", sortValue: (row) => row.last_order, cell: (row) => formatShortDate(row.last_order) },
  {
    id: "silent",
    header: "Silence",
    width: "130px",
    align: "right",
    sortValue: (row) => row.overdue_ratio,
    cell: (row) => (
      <StatusBadge tone={row.overdue_ratio >= 4 ? "danger" : "warning"} size="sm" dot={false}>
        {row.days_silent} j · ×{row.overdue_ratio.toLocaleString("fr-FR")}
      </StatusBadge>
    ),
  },
];

const repColumns: Array<DataTableColumn<SalesRepPerformance>> = [
  {
    id: "name",
    header: "Commercial",
    sortValue: (row) => row.name,
    cell: (row) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{row.name}</p>
        <p className="t-meta text-subtle">
          {row.orders} commandes · {row.customers} clients
        </p>
      </div>
    ),
  },
  { id: "revenue", header: "CA commandé", width: "130px", align: "right", numeric: true, sortValue: (row) => row.revenue, cell: (row) => formatMoney(row.revenue) },
  { id: "avg", header: "Panier moyen", width: "120px", align: "right", numeric: true, hideBelow: "lg", sortValue: (row) => row.avg_order ?? 0, cell: (row) => (row.avg_order == null ? "—" : formatMoney(row.avg_order)) },
  {
    id: "margin",
    header: "Marge livrée",
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
    id: "discount",
    header: "Remises accordées",
    width: "140px",
    align: "right",
    numeric: true,
    hideBelow: "md",
    sortValue: (row) => row.discount,
    cell: (row) => (
      <div>
        <p>{row.discount ? formatMoney(row.discount) : "—"}</p>
        {row.discount ? <p className="t-meta text-muted-foreground">{formatPercent(row.discount_rate)} du brut</p> : null}
      </div>
    ),
  },
  {
    id: "quota",
    header: "Hors quota",
    width: "100px",
    align: "right",
    numeric: true,
    hideBelow: "lg",
    sortValue: (row) => row.quota_overrides,
    cell: (row) => (row.quota_overrides ? <StatusBadge tone="warning" size="sm" dot={false}>{row.quota_overrides}</StatusBadge> : <span className="text-subtle">—</span>),
  },
];

const campaignColumns: Array<DataTableColumn<CampaignRow>> = [
  { id: "title", header: "Campagne", sortValue: (row) => row.title, cell: (row) => <span className="font-medium">{row.title}</span> },
  { id: "views", header: "Vues", width: "90px", align: "right", numeric: true, sortValue: (row) => row.views, cell: (row) => row.views.toLocaleString("fr-FR") },
  { id: "clicks", header: "Clics", width: "110px", align: "right", numeric: true, sortValue: (row) => row.clicks, cell: (row) => `${row.clicks} · ${formatPercent(row.click_rate)}` },
  { id: "cart", header: "Ajouts panier", width: "130px", align: "right", numeric: true, sortValue: (row) => row.add_to_cart, cell: (row) => `${row.add_to_cart} · ${formatPercent(row.cart_rate)}` },
];

/** Garder les clients, développer le Store, suivre l'équipe commerciale. */
export function CustomerInsightsPage() {
  const navigate = useNavigate();
  const period = usePeriod("90");
  const { data, error, isValidating, mutate } = useCustomerInsights(period.range.from, period.range.to);
  const result = data?.message;
  const portal = result?.origins.find((row) => row.origin === "Portail client");
  const views = (result?.campaigns ?? []).reduce((sum, row) => sum + row.views, 0);
  const carts = (result?.campaigns ?? []).reduce((sum, row) => sum + row.add_to_cart, 0);

  return (
    <>
      <PageHeader
        eyebrow="Pilotage"
        title="Clients & commercial"
        description="Clients réguliers qui ne commandent plus, part du Store, efficacité des campagnes et performance des commerciaux."
        actions={<RefreshButton onClick={() => void mutate()} busy={isValidating} />}
      />
      <PeriodToolbar period={period} />
      <ErrorNote error={error} />

      <section aria-label="Indicateurs clients" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={UserMinus}
          tone={result?.at_risk_totals.customers ? "warning" : "neutral"}
          label="Clients à risque"
          value={result ? result.at_risk_totals.customers : "—"}
          hint={result ? `${formatMoney(result.at_risk_totals.revenue)} de CA sur 12 mois · réguliers devenus silencieux` : undefined}
        />
        <KpiTile
          icon={Globe}
          label="Part du Store"
          value={result ? formatPercent(portal?.revenue_share ?? 0) : "—"}
          hint={result ? `${portal?.orders ?? 0} commande(s) portail · ${formatPercent(portal?.order_share ?? 0)} des commandes` : undefined}
        />
        <KpiTile icon={Megaphone} label="Campagnes" value={result ? `${carts} ajout(s)` : "—"} hint={result ? `${views.toLocaleString("fr-FR")} vues · conversion ${formatPercent(views ? carts / views : null)}` : undefined} />
        <KpiTile icon={Users} label="Commerciaux actifs" value={result ? result.sales_reps.length : "—"} hint="ayant saisi des commandes sur la période" />
      </section>

      <Panel title="Clients à relancer" hint="au moins 3 commandes sur 12 mois, silencieux depuis plus de 2 fois leur rythme habituel">
        <DataTable
          label="Clients à risque"
          columns={riskColumns}
          rows={result?.at_risk ?? []}
          rowKey={(row) => row.customer}
          onRowClick={(row) => navigate(`/clients/${encodeURIComponent(row.customer)}?tab=activite`)}
          empty={<EmptyState icon={UserMinus} title="Aucun client à risque" description="Les clients réguliers commandent à leur rythme habituel." />}
        />
      </Panel>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Panel title="Origine des commandes" hint="part du CA HT">
          <BarList
            rows={(result?.origins ?? []).map((row) => ({
              key: row.origin,
              label: `${row.origin} · ${row.orders} commande(s)`,
              value: row.revenue,
              display: `${formatMoney(row.revenue)} · ${formatPercent(row.revenue_share)}`,
              tone: row.origin === "Portail client" ? ("success" as const) : ("default" as const),
            }))}
          />
        </Panel>
        <Panel title="Campagnes du Store" hint="vues → clics → ajouts au panier">
          <DataTable label="Efficacité des campagnes" columns={campaignColumns} rows={result?.campaigns ?? []} rowKey={(row) => row.campaign} />
        </Panel>
      </div>

      <Panel title="Performance des commerciaux" hint="commandes internes de la période ; marge sur ce qui a été livré">
        <DataTable label="Performance des commerciaux" columns={repColumns} rows={result?.sales_reps ?? []} rowKey={(row) => row.user} />
      </Panel>
    </>
  );
}
