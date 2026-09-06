import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Package, Truck } from "lucide-react";
import { Badge } from "@/components/reui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { AlertsChip, AlertsSummary } from "@/features/today/AlertsSummary";
import { PipelineKpis, type PipelineStage } from "@/features/today/PipelineKpis";
import { WorkQueue, buildQueueItems } from "@/features/today/WorkQueue";
import {
  CashierCard,
  DeliveryMapCard,
  NoActiveRoutes,
  TrendCard,
  clusterUnassignedNotes,
} from "@/features/today/SidePanels";
import { getStopVisualStyle } from "@/features/planning/stopStatus";
import { stopProgress } from "@/features/today/fleetProgress";
import { apiErrorMessage, useActivityDashboard } from "@/shared/api/distribution";
import { routeLifecycleTone } from "@/shared/design/statusTone";
import { formatLongDate, formatShortDate } from "@/shared/format";
import type { ActivityAlert, ActivityDashboardData, DistributionRole } from "@/shared/types/distribution";

function localDate() {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, offset: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function operationalAlerts(alerts: ActivityAlert[] = []) {
  return alerts.filter((alert) => alert.id !== "dispatch-ready" && alert.tone !== "info");
}

function planningSelectUrl(ids: string[]) {
  return `/planning?select=${ids.map(encodeURIComponent).join(",")}`;
}

/** Les 4 étapes du flux, dans l’ordre : préparer → planifier → charger → livrer. */
function pipelineStages(data: ActivityDashboardData): PipelineStage[] {
  const toPick = data.preparation?.toPick ?? 0;
  const toPlan = data.planning?.unassigned ?? data.dispatch?.unassigned ?? 0;
  const toLoad = data.fulfillment?.toLoad ?? 0;
  const onRoad = data.fleet?.inProgress ?? 0;
  const total = Math.max(1, toPick + toPlan + toLoad + onRoad);
  const shortage = data.preparation?.shortageOrders ?? 0;
  const ready = data.preparation?.readyToComplete ?? 0;
  const planOverdue = data.planning?.overdue ?? data.dispatch?.overdue ?? 0;

  return [
    {
      step: 1,
      title: "À préparer",
      value: toPick,
      unit: "commandes",
      ratio: toPick / total,
      exception: shortage
        ? { label: `${shortage} bloqué`, tone: "danger" }
        : ready
          ? { label: `${ready} à compléter`, tone: "warning" }
          : undefined,
      icon: Package,
      target: shortage ? "/preparation?shortage=1" : ready ? "/preparation?complete=1" : "/preparation",
    },
    {
      step: 2,
      title: "À planifier",
      value: toPlan,
      unit: "bons sans tournée",
      ratio: toPlan / total,
      exception: planOverdue ? { label: `${planOverdue} en retard`, tone: "danger" } : undefined,
      icon: Package,
      target: "/planning",
    },
    {
      step: 3,
      title: "À charger",
      value: toLoad,
      unit: "tournées au quai",
      ratio: toLoad / total,
      icon: Truck,
      target: "/stock",
    },
    {
      step: 4,
      title: "En tournée",
      value: onRoad,
      unit: "tournées en cours",
      ratio: onRoad / total,
      icon: Truck,
      target: "/deliveries?kpi=live",
    },
  ];
}

function DashboardLoading() {
  return (
    <section role="status" aria-label="Chargement du dashboard" className="flex flex-col gap-5">
      <span className="sr-only">Chargement des opérations…</span>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 w-full" />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.95fr)_minmax(320px,1fr)]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </section>
  );
}

function LiveRoutesList({ data }: { data?: ActivityDashboardData }) {
  const navigate = useNavigate();
  const routes = data?.fleet?.liveRoutes || [];
  return (
    <CardContent className="flex flex-col gap-3">
      {routes.slice(0, 5).map((route) => {
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
                  <span className="truncate">{route.vehicleLabel || route.name}</span>
                </p>
                <p className="truncate t-meta text-muted-foreground">{route.driverName || "Livreur non assigné"}</p>
              </div>
              <StatusBadge tone={routeLifecycleTone(route.lifecycle)} size="sm">{route.lifecycle}</StatusBadge>
            </div>
            <progress aria-label={`Arrêts traités · ${route.vehicleLabel || route.name}`} max={100} value={progress.percent} className="mt-3 h-2 w-full accent-primary" />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{progress.done} / {progress.total} arrêts traités</span>
              <span>· {progress.remaining} restants</span>
              <Badge variant="secondary">{route.stops.filter((stop) => getStopVisualStyle(stop.status).state === "delivered").length} livrés</Badge>
              {progress.failed > 0 && <Badge variant="destructive-light">{progress.failed} échec(s)</Badge>}
            </div>
            {route.nextStop && <p className="mt-2 truncate text-xs text-muted-foreground">Prochain client · {route.nextStop.customerName}</p>}
          </button>
        );
      })}
      {routes.length > 5 && <p className="text-xs text-muted-foreground">+ {routes.length - 5} tournée(s) · Voir Livraisons</p>}
    </CardContent>
  );
}

export function TodayPage({ role }: { role: DistributionRole }) {
  const navigate = useNavigate();
  const today = localDate();
  const { data, error, isLoading, mutate } = useActivityDashboard(today);
  const dashboard = data?.message;

  const [alertsOpen, setAlertsOpen] = useState(false);
  const [presetSelection, setPresetSelection] = useState<string[]>([]);

  const showCashier = role === "responsable";
  const alerts = operationalAlerts(dashboard?.alerts);
  const queue = useMemo(() => buildQueueItems(dashboard, today), [dashboard, today]);
  const lateNotes = queue.filter((item) => item.stage === "plan" && item.late);
  const liveRoutes = dashboard?.fleet?.liveRoutes ?? [];
  const clusters = useMemo(
    () => clusterUnassignedNotes(dashboard?.dispatch?.notes ?? [], today),
    [dashboard?.dispatch?.notes, today],
  );
  const trend = dashboard?.shippedTrend ?? [];

  const description = dashboard
    ? [
        `${queue.length} bon(s) en attente`,
        `${alerts.length} anomalie(s)`,
        liveRoutes.length ? `${liveRoutes.length} tournée(s) en cours` : "aucune tournée lancée",
      ].join(" · ")
    : `Situation au ${new Date().toLocaleDateString("fr-FR")}`;

  const goPlan = (ids: string[]) => {
    if (!ids.length) return;
    navigate(planningSelectUrl(ids));
  };

  return (
    <>
      <PageHeader
        eyebrow={`Opérationnel · ${formatLongDate(today)}`}
        title="Aujourd’hui"
        meta={
          <AlertsChip
            count={alerts.length}
            open={alertsOpen}
            onToggle={() => setAlertsOpen((open) => !open)}
          />
        }
        description={description}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Impossible d’actualiser les opérations</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void mutate()}>Réessayer</Button>
        </Alert>
      ) : isLoading ? (
        <DashboardLoading />
      ) : !dashboard ? (
        <Empty>
          <EmptyHeader><EmptyTitle>Aucune donnée disponible</EmptyTitle></EmptyHeader>
          <Button variant="outline" onClick={() => void mutate()}>Réessayer</Button>
        </Empty>
      ) : (
        <>
          {alertsOpen && <AlertsSummary alerts={alerts} />}

          <PipelineKpis stages={pipelineStages(dashboard)} onNavigate={navigate} />

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.95fr)_minmax(320px,1fr)]">
            <WorkQueue
              data={dashboard}
              today={today}
              presetSelection={presetSelection}
              onCreateRoute={goPlan}
            />

            <div className="flex min-w-0 flex-col gap-4">
              <DeliveryMapCard
                clusters={clusters}
                onOpen={() => navigate("/deliveries")}
              />

              <Card className="overflow-hidden">
                <CardHeader className="flex-row items-center gap-2 border-b border-hairline">
                  <CardTitle>Tournées du jour</CardTitle>
                  <div className="flex-1" />
                  <Button variant="ghost" size="sm" onClick={() => navigate("/deliveries")}>
                    Livraisons
                  </Button>
                </CardHeader>
                {liveRoutes.length === 0 ? (
                  <NoActiveRoutes
                    unassigned={queue.filter((item) => item.stage === "plan").length}
                    lateCount={lateNotes.length}
                    suggestions={dashboard.routeSuggestions ?? []}
                    onPlanLate={() => setPresetSelection(lateNotes.map((item) => item.id))}
                    onCreate={(suggestion) => goPlan(suggestion.noteIds)}
                  />
                ) : (
                  <LiveRoutesList data={dashboard} />
                )}
              </Card>

              <TrendCard
                values={trend}
                labels={[
                  formatShortDate(addDays(today, -13)),
                  formatShortDate(addDays(today, -7)),
                  formatShortDate(today),
                ]}
              />

              {showCashier && (
                <CashierCard
                  payments={dashboard.payments}
                  onOpen={() => navigate("/cashier")}
                />
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
