import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Package,

  Truck,
  Warehouse,
} from "lucide-react";
import { Badge } from "@/components/reui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { getStopVisualStyle } from "@/features/planning/stopStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionQueue } from "@/features/today/ActionQueue";
import { ActivityKpis, type ActivityKpiItem } from "@/features/today/ActivityKpis";
import { stopProgress } from "@/features/today/fleetProgress";
import { apiErrorMessage, useActivityDashboard } from "@/shared/api/distribution";
import { routeLifecycleTone } from "@/shared/design/statusTone";
import { formatShortDate } from "@/shared/format";
import type { ActivityAlert, ActivityDashboardData, DistributionRole } from "@/shared/types/distribution";

function localDate() {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function operationalAlerts(alerts: ActivityAlert[] = []) {
  return alerts.filter((alert) => alert.id !== "dispatch-ready" && alert.tone !== "info");
}

function preparateurKpis(data?: ActivityDashboardData): ActivityKpiItem[] {
  const prep = data?.preparation;
  const toLoad = data?.fulfillment?.toLoad ?? 0;
  const items: ActivityKpiItem[] = [
    {
      title: "À préparer",
      value: prep?.toPick ?? 0,
      hint: "commandes à prélever",
      icon: Package,
      tone: prep?.toPick ? "info" : "neutral",
      target: "/preparation",
    },
    {
      title: "En retard",
      value: prep?.overdue ?? 0,
      hint: "commandes en retard",
      icon: AlertCircle,
      tone: prep?.overdue ? "danger" : "neutral",
      target: "/preparation?dateScope=overdue",
    },
    {
      title: "Ruptures",
      value: prep?.shortageOrders ?? 0,
      hint: "commandes sans stock",
      icon: Warehouse,
      tone: prep?.shortageOrders ? "danger" : "neutral",
      target: "/preparation?shortage=1",
    },
  ];
  items.push({
      title: "À charger",
      value: toLoad,
      hint: "tournées au quai",
      icon: Truck,
      tone: "warning",
      target: "/stock",
    });
  return items;
}

function ExceptionStrip({ alerts }: { alerts: ActivityAlert[] }) {
  const navigate = useNavigate();
  if (!alerts.length) return null;
  return (
    <section aria-label="Urgences" className="grid gap-3 sm:grid-cols-2">
      {[...alerts].sort((a, b) => Number(b.tone === "danger") - Number(a.tone === "danger")).map((alert) => {
        const open = () => alert.target && navigate(alert.target);
        return (
          <Alert
            key={alert.id}
            variant={alert.tone === "danger" ? "destructive" : "default"}
            className={alert.target ? "cursor-pointer" : undefined}
            tabIndex={alert.target ? 0 : undefined}
            onClick={open}
            onKeyDown={(event) => {
              if (!alert.target) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                open();
              }
            }}
          >
            <AlertTriangle />
            <AlertTitle>{alert.title}</AlertTitle>
            <AlertDescription>{alert.detail}</AlertDescription>
            {alert.target && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  navigate(alert.target!);
                }}
                aria-label={alert.title}
              >
                Traiter
                <ArrowRight data-icon="inline-end" />
              </Button>
            )}
          </Alert>
        );
      })}
    </section>
  );
}

function operationalKpis(data: ActivityDashboardData, role: DistributionRole): ActivityKpiItem[] {
  if (role === "preparateur") return preparateurKpis(data);
  const items: ActivityKpiItem[] = [
    { title: "À planifier", value: data.planning?.unassigned ?? 0, hint: "bons sans tournée", icon: Package, target: "/planning" },
    { title: "À charger", value: data.fulfillment?.toLoad ?? 0, hint: "tournées au quai", icon: Truck, target: "/stock" },
    { title: "En tournée", value: data.fleet?.inProgress ?? 0, hint: "tournées en cours", icon: Truck, target: "/deliveries?kpi=live" },
  ];
  items.unshift(role === "responsable"
    ? { title: "À préparer", value: data.preparation?.toPick ?? 0, hint: "commandes à prélever", icon: Package, target: "/preparation" }
    : { title: "En retard", value: data.planning?.overdue ?? 0, hint: "bons sans tournée en retard", tone: data.planning?.overdue ? "danger" : "neutral", icon: AlertCircle, target: "/planning?status=En%20retard" });
  return items;
}

function DashboardLoading() {
  return <section role="status" aria-label="Chargement du dashboard" className="flex flex-col gap-5">
    <span className="sr-only">Chargement des opérations…</span>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
    <div className="grid gap-5 xl:grid-cols-2">{Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-72 w-full" />)}</div>
  </section>;
}

function PriorityQueue({ data }: { data?: ActivityDashboardData }) {
  const navigate = useNavigate();
  const prep = data?.preparation;
  const rows = [
    { label: "En retard", value: prep?.overdue ?? 0, tone: "danger" as const },
    { label: "Aujourd’hui", value: prep?.today ?? 0, tone: "warning" as const },
    { label: "Plus tard", value: prep?.later ?? 0, tone: "info" as const },
  ];
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>File par priorité</CardTitle>
          <p className="t-body text-muted-foreground">Répartition de ce qu’il reste à prélever.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/preparation")}>
          Ouvrir
        </Button>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-3">
        {rows.map((row) => (
          <button
            key={row.label}
            type="button"
            onClick={() => navigate("/preparation")}
            className="rounded-md border border-hairline p-3 text-left hover:border-brand-300 hover:bg-brand-50/40"
          >
            <StatusBadge tone={row.tone} size="sm">{row.label}</StatusBadge>
            <p className="num mt-2 text-2xl font-semibold">{row.value}</p>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function NextActions({ data }: { data?: ActivityDashboardData }) {
  const navigate = useNavigate();
  const loads = (data?.fulfillment?.toLoadRoutes || []).slice(0, 5);
  const returns = (data?.fulfillment?.returnRoutes || []).slice(0, Math.max(0, 5 - loads.length));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quai et retours</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => navigate("/stock")}>Voir tout</Button>
        <p className="t-body text-muted-foreground">Chargements et retours à traiter.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {!loads.length && !returns.length && (
          <Empty><EmptyHeader><EmptyTitle>Aucune action de quai en attente.</EmptyTitle></EmptyHeader></Empty>
        )}
        {loads.map((route) => (
          <button
            key={`load-${route.name}`}
            type="button"
            onClick={() => navigate("/stock")}
            className="w-full rounded-md border border-hairline p-3 text-left hover:border-brand-300 hover:bg-brand-50/40"
          >
            <p className="font-medium">À charger · {route.vehicleLabel || route.name}</p>
            <p className="t-meta text-muted-foreground">
              {[route.driverName || "Livreur non assigné", route.date ? formatShortDate(route.date) : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </button>
        ))}
        {returns.map((route) => (
          <button
            key={`return-${route.name}`}
            type="button"
            onClick={() => navigate("/stock")}
            className="w-full rounded-md border border-hairline p-3 text-left hover:border-brand-300 hover:bg-brand-50/40"
          >
            <p className="font-medium">Retour · {route.vehicleLabel || route.name}</p>
            <p className="t-meta text-muted-foreground">{route.loadingStatus || "Retour dépôt"}</p>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function LiveRoutesList({ data }: { data?: ActivityDashboardData }) {
  const navigate = useNavigate();
  const routes = data?.fleet?.liveRoutes || [];
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Tournées du jour</CardTitle>
          <p className="t-body text-muted-foreground">Avancement par véhicule.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/deliveries")}>
          Livraisons
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!routes.length && (
          <Empty><EmptyHeader><EmptyTitle>Aucune tournée active.</EmptyTitle></EmptyHeader></Empty>
        )}
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
    </Card>
  );
}

export function TodayPage({ role }: { role: DistributionRole }) {
  const navigate = useNavigate();
  const today = localDate();
  const { data, error, isLoading, mutate } = useActivityDashboard(today);
  const dashboard = data?.message;
  const isPreparer = role === "preparateur";
  const showCashier = role === "responsable";
  const alerts = operationalAlerts(dashboard?.alerts);

  return (
    <>
      <PageHeader
        eyebrow="Opérationnel"
        title="Aujourd’hui"
        description={`Situation au ${new Date().toLocaleDateString("fr-FR")} · Files en attente et tournées du jour.`}
        actions={
          isPreparer ? (
            <Button onClick={() => navigate("/preparation")}>
              Préparer
              <ArrowRight />
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => navigate("/preparation")}>Préparer</Button>
              <Button onClick={() => navigate("/planning")}>
                Planifier
                <ArrowRight />
              </Button>
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
      ) : isLoading ? <DashboardLoading /> : !dashboard ? (
        <Empty><EmptyHeader><EmptyTitle>Aucune donnée disponible</EmptyTitle></EmptyHeader><Button variant="outline" onClick={() => void mutate()}>Réessayer</Button></Empty>
      ) : (
        <>
          <ActivityKpis items={operationalKpis(dashboard, role)} onNavigate={navigate} />
          <ExceptionStrip alerts={alerts} />
          {isPreparer ? (
            <section className="grid gap-5 xl:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-5"><PriorityQueue data={dashboard} /><ActionQueue data={dashboard} showCashier={false} today={today} role={role} /></div>
              <NextActions data={dashboard} />
            </section>
          ) : (
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
              <ActionQueue data={dashboard} showCashier={showCashier} today={today} role={role} />
              <LiveRoutesList data={dashboard} />
            </section>
          )}
        </>
      )}
    </>
  );
}
