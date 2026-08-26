import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  Package,
  Route,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Money } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { FleetMap } from "@/features/today/FleetMap";
import {
  collectDashboardAlerts,
  fleetColor,
  isLiveRoute,
  stopProgress,
} from "@/features/today/fleetProgress";
import { apiErrorMessage, usePlanningBoard } from "@/shared/api/distribution";
import { usePreparationQueue, type SalesOrderRow } from "@/shared/api/preparation";
import { routeLifecycleTone, type StatusTone } from "@/shared/design/statusTone";
import { formatQuantity, formatShortDate } from "@/shared/format";

function localDate() {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function orderPriority(date?: string): { label: string; tone: StatusTone } {
  if (!date) return { label: "À confirmer", tone: "neutral" };
  const target = new Date(`${date}T00:00:00`);
  const current = new Date();
  current.setHours(0, 0, 0, 0);
  if (target < current) return { label: "En retard", tone: "danger" };
  if (target.getTime() === current.getTime()) return { label: "Aujourd’hui", tone: "warning" };
  return { label: "Planifiée", tone: "info" };
}

export function TodayPage() {
  const navigate = useNavigate();
  const today = localDate();
  const { data, error, isLoading } = usePlanningBoard(today, today, {}, { live: true });
  const { data: prepData, error: prepError, isLoading: prepLoading } = usePreparationQueue({ live: true });
  const board = data?.message;
  const orders = prepData?.message || [];
  const liveRoutes = useMemo(() => (board?.routes || []).filter(isLiveRoute), [board?.routes]);
  const alerts = useMemo(
    () => collectDashboardAlerts(board?.routes || [], board?.exceptions || []),
    [board?.exceptions, board?.routes],
  );
  const failedStops = (board?.routes || []).flatMap((route) => route.stops).filter((stop) => ["Partiellement Livré", "Non Livré"].includes(stop.status)).length;
  const overdueOrders = orders.filter((order) => orderPriority(order.delivery_date).tone === "danger").length;

  const indicators = [
    {
      title: "Commandes à préparer",
      value: orders.length,
      hint: overdueOrders ? `${overdueOrders} en retard` : "File de prélèvement",
      icon: Package,
      tone: overdueOrders ? "warning" : "info",
      target: "/preparation",
    },
    {
      title: "BL prêts à planifier",
      value: board?.unassigned.length || 0,
      hint: "Affecter aux tournées",
      icon: ClipboardCheck,
      tone: "info",
      target: "/planning",
    },
    {
      title: "Tournées en cours",
      value: liveRoutes.length,
      hint: "Véhicules sur le terrain",
      icon: Truck,
      tone: "success",
      target: "/deliveries",
    },
    {
      title: "Alertes",
      value: alerts.length || failedStops,
      hint: failedStops ? `${failedStops} arrêts en échec` : "RAS",
      icon: AlertCircle,
      tone: alerts.length || failedStops ? "warning" : "neutral",
      target: "/deliveries",
    },
  ] as const;

  const orderColumns: Array<DataTableColumn<SalesOrderRow>> = [
    {
      id: "name",
      header: "Commande",
      sortValue: (order) => order.name,
      cell: (order) => (
        <div className="min-w-0">
          <p className="font-medium">{order.name}</p>
          <p className="truncate t-meta text-muted-foreground">{order.customer_name || order.customer}</p>
        </div>
      ),
    },
    {
      id: "delivery",
      header: "Livraison",
      width: "140px",
      sortValue: (order) => order.delivery_date || "",
      cell: (order) => {
        const priority = orderPriority(order.delivery_date);
        return (
          <div>
            <p className="num">{formatShortDate(order.delivery_date)}</p>
            <StatusBadge tone={priority.tone} size="sm">{priority.label}</StatusBadge>
          </div>
        );
      },
    },
    {
      id: "qty",
      header: "Qté",
      width: "80px",
      align: "right",
      numeric: true,
      hideBelow: "md",
      sortValue: (order) => order.total_qty || 0,
      cell: (order) => formatQuantity(order.total_qty || 0),
    },
    {
      id: "picked",
      header: "Prélèvement",
      width: "110px",
      align: "right",
      numeric: true,
      hideBelow: "lg",
      sortValue: (order) => order.per_picked || 0,
      cell: (order) => `${Math.round(order.per_picked || 0)} %`,
    },
    {
      id: "amount",
      header: "Montant",
      width: "130px",
      align: "right",
      numeric: true,
      sortValue: (order) => order.grand_total || 0,
      cell: (order) => <Money value={order.grand_total || 0} />,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Vue opérationnelle"
        title="Tableau de bord"
        description={`Priorités du ${new Date().toLocaleDateString("fr-FR")} — préparation, tournées et suivi terrain.`}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/preparation")}>
              Préparer
            </Button>
            <Button onClick={() => navigate("/planning")}>
              Planifier
              <ArrowRight />
            </Button>
          </>
        }
      />

      {(error || prepError) && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {apiErrorMessage(error || prepError)}
        </div>
      )}

      <section aria-label="Indicateurs du jour" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {indicators.map((item) => (
          <KpiTile
            key={item.title}
            icon={item.icon}
            tone={item.tone}
            label={item.title}
            value={isLoading || prepLoading ? "—" : item.value}
            hint={<span className="font-medium text-brand-700">{item.hint} →</span>}
            onClick={() => navigate(item.target)}
          />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Suivi des livraisons</CardTitle>
              <p className="t-body text-muted-foreground">Avancement temps réel de tous les véhicules du jour.</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
              Live 10 s
            </span>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {liveRoutes.length ? (
              <FleetMap routes={liveRoutes} />
            ) : (
              <EmptyState
                icon={Truck}
                title="Aucun véhicule en tournée"
                description="Les tournées publiées ou en cours apparaissent ici avec leurs arrêts."
                action={<Button variant="outline" onClick={() => navigate("/planning")}>Ouvrir le planning</Button>}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alertes</CardTitle>
            <p className="t-body text-muted-foreground">Exceptions, échecs terrain et conflits.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {!alerts.length && (
              <p className="rounded-md border border-hairline bg-surface-subtle p-3 t-body text-muted-foreground">
                Aucune alerte en cours.
              </p>
            )}
            {alerts.map((alert) => (
              <button
                key={alert.id}
                type="button"
                onClick={() => alert.target && navigate(alert.target)}
                className={`w-full rounded-md border p-3 text-left ${
                  alert.tone === "danger"
                    ? "border-red-200 bg-red-50"
                    : alert.tone === "warning"
                      ? "border-amber-200 bg-amber-50"
                      : "border-brand-200 bg-brand-50"
                }`}
              >
                <p className="flex items-start gap-2 text-sm font-medium text-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {alert.title}
                </p>
                <p className="mt-1 t-meta text-muted-foreground">{alert.detail}</p>
              </button>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Commandes à préparer</CardTitle>
              <p className="t-body text-muted-foreground">Commandes clients encore à prélever aujourd’hui.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/preparation")}>
              Voir tout
            </Button>
          </CardHeader>
          <CardContent>
            <DataTable
              label="Commandes à préparer"
              columns={orderColumns}
              rows={orders.slice(0, 12)}
              rowKey={(order) => order.name}
              rowTone={(order) => orderPriority(order.delivery_date).tone}
              onRowClick={(order) => navigate("/preparation")}
              isLoading={prepLoading}
              maxHeight="360px"
              empty={
                <EmptyState
                  icon={Package}
                  title="Rien à préparer"
                  description="Les nouvelles commandes à prélever apparaîtront ici."
                />
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Avancement flotte</CardTitle>
            <p className="t-body text-muted-foreground">Arrêts traités par véhicule.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {!liveRoutes.length && (
              <p className="rounded-md border border-hairline bg-surface-subtle p-3 t-body text-muted-foreground">
                Aucune tournée active.
              </p>
            )}
            {liveRoutes.map((route, index) => {
              const progress = stopProgress(route);
              return (
                <button
                  key={route.name}
                  type="button"
                  onClick={() => navigate(`/planning/routes/${route.name}`)}
                  className="w-full rounded-md border border-hairline p-3 text-left hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: fleetColor(index) }} />
                        <span className="truncate">{route.vehicleLabel || route.name}</span>
                      </p>
                      <p className="truncate t-meta text-muted-foreground">{route.driverName || "Livreur non assigné"}</p>
                    </div>
                    <StatusBadge tone={routeLifecycleTone(route.lifecycle)} size="sm">{route.lifecycle}</StatusBadge>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${progress.percent}%` }} />
                  </div>
                  <p className="mt-1.5 flex items-center justify-between t-meta text-muted-foreground">
                    <span className="num">{progress.done} / {progress.total} arrêts</span>
                    <span className="inline-flex items-center gap-1">
                      <Route className="size-3" />
                      {progress.percent} %
                    </span>
                  </p>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
