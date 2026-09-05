import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Package, Truck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertsChip, AlertsSummary } from "@/features/today/AlertsSummary";
import { PipelineKpis, type PipelineStage } from "@/features/today/PipelineKpis";
import { WorkQueue, buildQueueItems } from "@/features/today/WorkQueue";
import {
  DeliveryMapCard,
  NoActiveRoutes,
  ResourcesCard,
  TrendCard,
} from "@/features/today/SidePanels";
import { ActionQueue } from "@/features/today/ActionQueue";
import { apiErrorMessage, useActivityDashboard } from "@/shared/api/distribution";
import type { ActivityAlert, ActivityDashboardData, DistributionRole } from "@/shared/types/distribution";

function localDate() {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function operationalAlerts(alerts: ActivityAlert[] = []) {
  return alerts.filter((alert) => alert.id !== "dispatch-ready" && alert.tone !== "info");
}

/** Les 4 étapes du flux, dans l’ordre : préparer → planifier → charger → livrer. */
function pipelineStages(data: ActivityDashboardData): PipelineStage[] {
  const toPick = data.preparation?.toPick ?? 0;
  const toPlan = data.planning?.unassigned ?? 0;
  const toLoad = data.fulfillment?.toLoad ?? 0;
  const onRoad = data.fleet?.inProgress ?? 0;
  const total = Math.max(1, toPick + toPlan + toLoad + onRoad);
  const shortage = data.preparation?.shortageOrders ?? 0;
  const planOverdue = data.planning?.overdue ?? 0;

  return [
    {
      step: 1,
      title: "À préparer",
      value: toPick,
      unit: "commandes",
      ratio: toPick / total,
      exception: shortage ? { label: `${shortage} bloqué`, tone: "danger" } : undefined,
      icon: Package,
      target: "/preparation",
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

export function TodayPage({ role }: { role: DistributionRole }) {
  const navigate = useNavigate();
  const today = localDate();
  const { data, error, isLoading, mutate } = useActivityDashboard(today);
  const dashboard = data?.message;

  const [alertsOpen, setAlertsOpen] = useState(false);
  const [presetSelection, setPresetSelection] = useState<string[]>([]);

  const isPreparer = role === "preparateur";
  const alerts = operationalAlerts(dashboard?.alerts);
  const queue = useMemo(() => buildQueueItems(dashboard, today), [dashboard, today]);
  const lateNotes = queue.filter((item) => item.stage === "plan" && item.late);
  const liveRoutes = dashboard?.fleet?.liveRoutes ?? [];

  const description = dashboard
    ? [
        `${queue.length} bon(s) en attente`,
        `${alerts.length} anomalie(s)`,
        liveRoutes.length ? `${liveRoutes.length} tournée(s) en cours` : "aucune tournée lancée",
      ].join(" · ")
    : `Situation au ${new Date().toLocaleDateString("fr-FR")}`;

  return (
    <>
      <PageHeader
        eyebrow="Opérationnel"
        title="Aujourd’hui"
        // nouvelle prop `badge` sur PageHeader : rendue à droite du titre
        badge={
          <AlertsChip
            count={alerts.length}
            open={alertsOpen}
            onToggle={() => setAlertsOpen((open) => !open)}
          />
        }
        description={description}
        actions={
          isPreparer ? (
            <Button onClick={() => navigate("/preparation")}>Préparer</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => navigate("/preparation")}>Préparer</Button>
              <Button onClick={() => navigate("/planning")}>Planifier une tournée</Button>
            </>
          )
        }
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

          {isPreparer ? (
            // le préparateur garde sa file simple, sans planification
            <ActionQueue data={dashboard} showCashier={false} today={today} role={role} />
          ) : (
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1.95fr)_minmax(320px,1fr)]">
              <WorkQueue
                data={dashboard}
                today={today}
                presetSelection={presetSelection}
                onCreateRoute={(ids) => {
                  // TODO brancher la création de tournée puis rediriger
                  console.info("créer une tournée avec", ids);
                }}
              />

              <div className="flex min-w-0 flex-col gap-4">
                <DeliveryMapCard
                  clusters={[
                    { city: "Lille", count: 3, x: 0.18, y: 0.22 },
                    { city: "Douai", count: 2, late: true, x: 0.52, y: 0.41 },
                    { city: "Arras", count: 1, x: 0.3, y: 0.66 },
                    { city: "Valenciennes", count: 1, x: 0.7, y: 0.2 },
                  ]}
                  totalKm={139}
                  onOpen={() => navigate("/deliveries?view=map")}
                />

                <Card className="overflow-hidden">
                  <CardHeader className="flex-row items-center gap-2 border-b border-hairline">
                    <CardTitle>Tournées du jour</CardTitle>
                  </CardHeader>
                  {liveRoutes.length === 0 ? (
                    <NoActiveRoutes
                      unassigned={queue.filter((item) => item.stage === "plan").length}
                      lateCount={lateNotes.length}
                      suggestions={[]} // à alimenter côté API (regroupement par ville)
                      onPlanLate={() => setPresetSelection(lateNotes.map((item) => item.id))}
                      onCreate={(suggestion) => setPresetSelection(suggestion.noteIds)}
                    />
                  ) : null /* conserver le rendu existant de LiveRoutesList ici */}
                </Card>

                <TrendCard
                  values={dashboard.shippedTrend ?? []}
                  labels={["-14 j", "-7 j", "auj."]}
                  delta="+8 %"
                />

                <ResourcesCard vehicles={[]} /* alimenter depuis /fleet */ />
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
