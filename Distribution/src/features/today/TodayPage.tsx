import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  ClipboardList,
  Package,
  Route,
  Truck,
  Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActivityKpis, type ActivityKpiItem } from "@/features/today/ActivityKpis";
import { FleetMap } from "@/features/today/FleetMap";
import { NowFeed } from "@/features/today/NowFeed";
import { PaymentsSnapshot } from "@/features/today/PaymentsSnapshot";
import { PipelineStrip } from "@/features/today/PipelineStrip";
import { StockAlertList, StockSnapshot } from "@/features/today/StockSnapshot";
import { fleetColor, stopProgress } from "@/features/today/fleetProgress";
import { apiErrorMessage, useActivityDashboard } from "@/shared/api/distribution";
import { routeLifecycleTone } from "@/shared/design/statusTone";
import { formatQuantity, formatShortDate } from "@/shared/format";
import type { ActivityDashboardData, DistributionRole } from "@/shared/types/distribution";

function localDate() {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function preparateurKpis(data?: ActivityDashboardData): ActivityKpiItem[] {
  const prep = data?.preparation;
  const fulfillment = data?.fulfillment;
  return [
    {
      title: "À préparer",
      value: prep?.toPick ?? 0,
      hint: "File de prélèvement",
      icon: Package,
      tone: prep?.toPick ? "info" : "neutral",
      target: "/preparation",
    },
    {
      title: "En retard",
      value: prep?.overdue ?? 0,
      hint: "Date de livraison dépassée",
      icon: AlertCircle,
      tone: prep?.overdue ? "danger" : "neutral",
      target: "/preparation",
    },
    {
      title: "En cours",
      value: prep?.inProgressPickLists ?? 0,
      hint: "Sessions de pick ouvertes",
      icon: ClipboardList,
      tone: prep?.inProgressPickLists ? "warning" : "neutral",
      target: "/preparation",
    },
    {
      title: "Restant",
      value: formatQuantity(prep?.remainingQty ?? 0),
      hint: "Quantité encore à prélever",
      icon: ClipboardCheck,
      tone: "info",
      target: "/preparation",
    },
    {
      title: "À charger",
      value: fulfillment?.toLoad ?? 0,
      hint: "Tournées prêtes au quai",
      icon: Truck,
      tone: fulfillment?.toLoad ? "warning" : "neutral",
      target: "/stock",
    },
    {
      title: "Ruptures",
      value: prep?.shortageOrders ?? 0,
      hint: "Commandes sans stock",
      icon: Warehouse,
      tone: prep?.shortageOrders ? "danger" : "neutral",
      target: "/preparation",
    },
  ];
}

function managerKpis(data?: ActivityDashboardData, showCashier = false): ActivityKpiItem[] {
  const items: ActivityKpiItem[] = [
    {
      title: "Préparation en retard",
      value: data?.preparation?.overdue ?? 0,
      hint: "Commandes hors délai",
      icon: Package,
      tone: data?.preparation?.overdue ? "danger" : "success",
      target: "/preparation",
    },
    {
      title: "Prêts à expédier",
      value: data?.dispatch?.ready ?? 0,
      hint: data?.dispatch?.overdue
        ? `${data.dispatch.overdue} en retard`
        : "BL préparés, toutes dates",
      icon: Truck,
      tone: data?.dispatch?.overdue ? "warning" : data?.dispatch?.ready ? "info" : "neutral",
      target: "/planning",
    },
    {
      title: "BL en retard",
      value: data?.planning?.overdue ?? 0,
      hint: "Prêts, non planifiés",
      icon: ClipboardCheck,
      tone: data?.planning?.overdue ? "warning" : "neutral",
      target: "/planning",
    },
    {
      title: "Arrêts restants",
      value: data?.fleet?.remainingStops ?? 0,
      hint: `${data?.fleet?.doneStops ?? 0} déjà traités`,
      icon: Truck,
      tone: "info",
      target: "/deliveries",
    },
    {
      title: "Alertes",
      value: data?.alerts?.length ?? 0,
      hint: data?.fleet?.failedStops ? `${data.fleet.failedStops} échecs terrain` : "Exceptions et retards",
      icon: AlertCircle,
      tone: data?.alerts?.length ? "warning" : "neutral",
      target: "/deliveries",
    },
  ];
  if (showCashier) {
    items.push({
      title: "Caisse à contrôler",
      value: data?.payments?.toControl ?? 0,
      hint: data?.payments?.discrepancies ? `${data.payments.discrepancies} écart(s)` : "Retours à compter",
      icon: AlertCircle,
      tone: data?.payments?.discrepancies ? "danger" : data?.payments?.toControl ? "warning" : "neutral",
      target: "/cashier",
    });
  }
  return items;
}

function AlertList({ alerts }: { alerts: NonNullable<ActivityDashboardData["alerts"]> }) {
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Alertes</CardTitle>
        <p className="t-body text-muted-foreground">Retards, ruptures, échecs et exceptions.</p>
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
  );
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
  const loads = data?.fulfillment?.toLoadRoutes || [];
  const returns = data?.fulfillment?.returnRoutes || [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ensuite</CardTitle>
        <p className="t-body text-muted-foreground">Chargements et retours à traiter.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {!loads.length && !returns.length && (
          <p className="rounded-md border border-hairline bg-surface-subtle p-3 t-body text-muted-foreground">
            Aucune action de quai en attente.
          </p>
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

function ReadyToShip({ data }: { data?: ActivityDashboardData }) {
  const navigate = useNavigate();
  const dispatch = data?.dispatch;
  const notes = dispatch?.notes || [];
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Prêts à expédier</CardTitle>
          <p className="t-body text-muted-foreground">
            Bons préparés en attente de départ, y compris les dates passées.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/planning")}>
          Planning
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {!notes.length && (
          <p className="rounded-md border border-hairline bg-surface-subtle p-3 t-body text-muted-foreground">
            Aucun bon préparé en attente d’expédition.
          </p>
        )}
        {notes.map((note) => (
          <button
            key={note.deliveryNote}
            type="button"
            onClick={() => navigate(note.routeId ? `/planning/routes/${note.routeId}` : "/planning")}
            className="w-full rounded-md border border-hairline p-3 text-left hover:border-brand-300 hover:bg-brand-50/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{note.deliveryNote}</p>
                <p className="truncate t-meta text-muted-foreground">
                  {[
                    note.customerName,
                    note.requestedDate || note.routeDate
                      ? formatShortDate(note.requestedDate || note.routeDate || undefined)
                      : null,
                    note.routeId || "Sans tournée",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <StatusBadge tone={note.routeId ? "info" : "warning"} size="sm">
                {note.loadingStatus || note.lifecycle}
              </StatusBadge>
            </div>
          </button>
        ))}
        {(dispatch?.ready ?? 0) > notes.length && (
          <p className="t-meta text-muted-foreground">
            + {(dispatch?.ready ?? 0) - notes.length} autre(s) bon(s) prêts.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function FleetProgress({ data }: { data?: ActivityDashboardData }) {
  const navigate = useNavigate();
  const routes = data?.fleet?.liveRoutes || [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Avancement flotte</CardTitle>
        <p className="t-body text-muted-foreground">Arrêts traités par véhicule.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!routes.length && (
          <p className="rounded-md border border-hairline bg-surface-subtle p-3 t-body text-muted-foreground">
            Aucune tournée active.
          </p>
        )}
        {routes.map((route, index) => {
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
  );
}

export function TodayPage({ role }: { role: DistributionRole }) {
  const navigate = useNavigate();
  const today = localDate();
  const { data, error, isLoading } = useActivityDashboard(today);
  const dashboard = data?.message;
  const isPreparer = role === "preparateur";
  const showCashier = role === "responsable";
  const liveRoutes = dashboard?.fleet?.liveRoutes || [];

  return (
    <>
      <PageHeader
        eyebrow="Activité logistique"
        title="Tableau de bord"
        description={`Vue ${isPreparer ? "de charge" : "globale"} du ${new Date().toLocaleDateString("fr-FR")} — stock, livraisons${showCashier ? " et paiements" : ""}.`}
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

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {apiErrorMessage(error)}
        </div>
      )}

      {isPreparer ? (
        <>
          <ActivityKpis items={preparateurKpis(dashboard)} loading={isLoading} onNavigate={navigate} />
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <PriorityQueue data={dashboard} />
            <NowFeed items={(dashboard?.now || []).filter((item) => item.kind === "pick")} />
          </section>
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <NextActions data={dashboard} />
            <Card>
              <CardHeader>
                <CardTitle>Alertes stock</CardTitle>
                <p className="t-body text-muted-foreground">Ruptures et entrepôts à corriger.</p>
              </CardHeader>
              <CardContent>
                <StockAlertList
                  shortageOrders={dashboard?.preparation?.shortageOrders}
                  missingWarehouse={dashboard?.stock?.missingWarehouse}
                />
              </CardContent>
            </Card>
          </section>
          <ReadyToShip data={dashboard} />
        </>
      ) : (
        <>
          {dashboard?.pipeline && (
            <PipelineStrip pipeline={dashboard.pipeline} showCashier={showCashier} />
          )}
          <ActivityKpis items={managerKpis(dashboard, showCashier)} loading={isLoading} onNavigate={navigate} />
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="overflow-hidden">
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>Suivi des livraisons</CardTitle>
                  <p className="t-body text-muted-foreground">Tournées publiées ou en cours, toutes dates.</p>
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
                    description="Les tournées publiées ou en cours, y compris les départs en attente, apparaissent ici."
                    action={<Button variant="outline" onClick={() => navigate("/planning")}>Ouvrir le planning</Button>}
                  />
                )}
              </CardContent>
            </Card>
            <NowFeed items={dashboard?.now || []} />
          </section>
          <ReadyToShip data={dashboard} />
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <FleetProgress data={dashboard} />
            <AlertList alerts={dashboard?.alerts || []} />
          </section>
          <section className={`grid gap-5 ${showCashier ? "xl:grid-cols-2" : ""}`}>
            {dashboard?.stock && <StockSnapshot stock={dashboard.stock} />}
            {showCashier && dashboard?.payments && <PaymentsSnapshot payments={dashboard.payments} />}
          </section>
        </>
      )}
    </>
  );
}
