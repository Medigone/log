import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, CheckCircle2, MapPin, Route, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { KpiTile } from "@/components/ui/kpi-tile";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toolbar, ToolbarField } from "@/components/ui/toolbar";
import { getStopVisualStyle } from "@/features/planning/stopStatus";
import { FleetMap } from "@/features/today/FleetMap";
import { fleetColor, isLiveRoute, stopProgress } from "@/features/today/fleetProgress";
import { apiErrorMessage, usePlanningBoard } from "@/shared/api/distribution";
import { routeLifecycleTone } from "@/shared/design/statusTone";
import type { DistributionRoute, RouteLifecycle, RouteStop } from "@/shared/types/distribution";

const LIFECYCLES: RouteLifecycle[] = ["Publiée", "En cours", "Retour dépôt", "Terminée"];

type KpiFocus = "all" | "live" | "delivered" | "failed";

function localDate() {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function matchesSearch(route: DistributionRoute, query: string) {
  if (!query) return true;
  const haystack = [
    route.name,
    route.driverName,
    route.vehicleLabel,
    route.vehicle,
    ...route.stops.flatMap((stop) => [stop.customerName, stop.deliveryNote, stop.commune, stop.address]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("fr");
  return haystack.includes(query);
}

function hasDeliveredStop(route: DistributionRoute) {
  return route.stops.some((stop) => getStopVisualStyle(stop.status).state === "delivered");
}

function hasFailedStop(route: DistributionRoute) {
  return route.stops.some((stop) => getStopVisualStyle(stop.status).state === "failed");
}

export function DeliveriesPage() {
  const navigate = useNavigate();
  const today = localDate();
  const [date, setDate] = useState(today);
  const [lifecycle, setLifecycle] = useState<RouteLifecycle | "">("");
  const [driver, setDriver] = useState("");
  const [search, setSearch] = useState("");
  const [kpi, setKpi] = useState<KpiFocus>("all");
  const [selected, setSelected] = useState<string>();
  const live = date === today;
  const { data, error, isLoading } = usePlanningBoard(date, date, {}, { live });
  const routes = data?.message.routes || [];
  const query = search.trim().toLocaleLowerCase("fr");

  const deliveredStops = routes.flatMap((route) => route.stops).filter((stop) => getStopVisualStyle(stop.status).state === "delivered").length;
  const failedStops = routes.flatMap((route) => route.stops).filter((stop) => getStopVisualStyle(stop.status).state === "failed").length;
  const liveCount = routes.filter(isLiveRoute).length;

  const filtered = useMemo(() => {
    return routes.filter((route) => {
      if (lifecycle && route.lifecycle !== lifecycle) return false;
      if (driver && route.driver !== driver) return false;
      if (kpi === "live" && !isLiveRoute(route)) return false;
      if (kpi === "delivered" && !hasDeliveredStop(route)) return false;
      if (kpi === "failed" && !hasFailedStop(route)) return false;
      return matchesSearch(route, query);
    });
  }, [driver, kpi, lifecycle, query, routes]);

  useEffect(() => {
    if (!filtered.some((route) => route.name === selected)) {
      setSelected(filtered[0]?.name);
    }
  }, [filtered, selected]);

  const selectedRoute = filtered.find((route) => route.name === selected);
  const selectedProgress = selectedRoute ? stopProgress(selectedRoute) : undefined;

  const applyKpi = (focus: KpiFocus) => {
    setKpi(focus);
    setLifecycle("");
  };

  const routeColumns: Array<DataTableColumn<DistributionRoute>> = [
    {
      id: "name",
      header: "Tournée",
      sortValue: (route) => route.name,
      cell: (route) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <span className="size-2 shrink-0 rounded-full" style={{ background: fleetColor(filtered.indexOf(route)) }} />
            {route.name}
          </p>
          <p className="truncate t-meta text-muted-foreground">
            {route.driverName || "Livreur non affecté"} · {route.vehicleLabel || "Véhicule non affecté"}
          </p>
        </div>
      ),
    },
    {
      id: "lifecycle",
      header: "État",
      width: "140px",
      sortValue: (route) => route.lifecycle,
      cell: (route) => <StatusBadge tone={routeLifecycleTone(route.lifecycle)} size="sm">{route.lifecycle}</StatusBadge>,
    },
    {
      id: "progress",
      header: "Arrêts",
      width: "110px",
      align: "right",
      numeric: true,
      sortValue: (route) => stopProgress(route).percent,
      cell: (route) => {
        const progress = stopProgress(route);
        return `${progress.done} / ${progress.total}`;
      },
    },
    {
      id: "percent",
      header: "%",
      width: "70px",
      align: "right",
      numeric: true,
      hideBelow: "md",
      sortValue: (route) => stopProgress(route).percent,
      cell: (route) => `${stopProgress(route).percent} %`,
    },
  ];

  const stopColumns: Array<DataTableColumn<RouteStop>> = [
    {
      id: "sequence",
      header: "N°",
      width: "56px",
      numeric: true,
      sortValue: (stop) => stop.sequence,
      cell: (stop) => {
        const visual = getStopVisualStyle(stop.status);
        return (
          <span className={`num grid size-7 place-items-center rounded-full text-xs font-semibold ${visual.sequenceClass}`}>
            {visual.markerSymbol || stop.sequence}
          </span>
        );
      },
    },
    {
      id: "customer",
      header: "Client",
      sortValue: (stop) => stop.customerName,
      cell: (stop) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{stop.customerName}</p>
          <p className="truncate t-meta text-muted-foreground">{stop.deliveryNote}</p>
        </div>
      ),
    },
    {
      id: "place",
      header: "Lieu",
      hideBelow: "md",
      sortValue: (stop) => stop.commune || stop.address || "",
      cell: (stop) => <span className="truncate">{stop.commune || stop.address || "Adresse non renseignée"}</span>,
    },
    {
      id: "status",
      header: "Statut",
      width: "140px",
      sortValue: (stop) => stop.status,
      cell: (stop) => {
        const visual = getStopVisualStyle(stop.status);
        return <StatusBadge tone={visual.tone} size="sm">{stop.status}</StatusBadge>;
      },
    },
    {
      id: "actions",
      header: "",
      width: "88px",
      align: "right",
      cell: (stop) => (
        <span className="inline-flex items-center justify-end gap-1">
          {stop.latitude != null && stop.longitude != null && (
            <a
              aria-label={`Ouvrir la position de ${stop.customerName}`}
              target="_blank"
              rel="noreferrer"
              href={`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`}
              className="rounded-md p-1.5 text-brand-700 hover:bg-brand-50"
              onClick={(event) => event.stopPropagation()}
            >
              <MapPin className="size-4" />
            </a>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Suivi opérationnel"
        title="Livraisons"
        description={`Avancement des tournées du ${new Date(`${date}T00:00:00`).toLocaleDateString("fr-FR")}.`}
        meta={
          live ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
              Live 10 s
            </span>
          ) : undefined
        }
        actions={
          <Button variant="outline" onClick={() => navigate("/planning")}>
            Ouvrir le planning
            <ArrowRight />
          </Button>
        }
      />

      <Toolbar>
        <ToolbarField label="Date" className="w-40">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </ToolbarField>
        <ToolbarField label="Cycle de vie" className="w-44">
          <NativeSelect
            aria-label="Cycle de vie"
            value={lifecycle}
            onChange={(event) => {
              setLifecycle(event.target.value as RouteLifecycle | "");
              setKpi("all");
            }}
          >
            <option value="">Tous</option>
            {LIFECYCLES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </NativeSelect>
        </ToolbarField>
        <ToolbarField label="Livreur" className="w-44">
          <NativeSelect aria-label="Livreur" value={driver} onChange={(event) => setDriver(event.target.value)}>
            <option value="">Tous</option>
            {(data?.message.drivers || []).map((item) => (
              <option key={item.name} value={item.name}>{item.label}</option>
            ))}
          </NativeSelect>
        </ToolbarField>
        <ToolbarField label="Recherche" className="min-w-56 flex-1">
          <Input
            aria-label="Recherche"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tournée, client, BL…"
          />
        </ToolbarField>
      </Toolbar>

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {apiErrorMessage(error)}
        </div>
      )}

      <section aria-label="Indicateurs du jour" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={Route}
          tone="info"
          label="Tournées du jour"
          value={isLoading ? "—" : routes.length}
          hint="Toutes les tournées →"
          onClick={() => applyKpi("all")}
        />
        <KpiTile
          icon={Truck}
          tone="success"
          label="En cours"
          value={isLoading ? "—" : liveCount}
          hint="Véhicules sur le terrain →"
          onClick={() => applyKpi("live")}
        />
        <KpiTile
          icon={CheckCircle2}
          tone="success"
          label="Arrêts livrés"
          value={isLoading ? "—" : deliveredStops}
          hint="Tournées avec livraisons →"
          onClick={() => applyKpi("delivered")}
        />
        <KpiTile
          icon={AlertCircle}
          tone={failedStops ? "warning" : "neutral"}
          label="Échecs"
          value={isLoading ? "—" : failedStops}
          hint={failedStops ? "Tournées en échec →" : "RAS →"}
          onClick={() => applyKpi("failed")}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Carte des tournées</CardTitle>
            <p className="t-body text-muted-foreground">Itinéraires et arrêts des tournées filtrées.</p>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {filtered.length ? (
              <FleetMap routes={filtered} />
            ) : (
              <EmptyState
                icon={Truck}
                title={routes.length ? "Aucune tournée pour ces filtres" : "Aucune tournée ce jour"}
                description={routes.length ? "Élargissez les filtres pour afficher la carte." : "Changez de date ou publiez un planning."}
                action={<Button variant="outline" onClick={() => navigate("/planning")}>Ouvrir le planning</Button>}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tournée sélectionnée</CardTitle>
            <p className="t-body text-muted-foreground">Détail et accès à la fiche.</p>
          </CardHeader>
          <CardContent>
            {selectedRoute && selectedProgress ? (
              <div className="space-y-3">
                <div>
                  <p className="font-medium">{selectedRoute.name}</p>
                  <p className="t-meta text-muted-foreground">
                    {selectedRoute.driverName || "Livreur non affecté"} · {selectedRoute.vehicleLabel || "Véhicule non affecté"}
                  </p>
                </div>
                <StatusBadge tone={routeLifecycleTone(selectedRoute.lifecycle)}>{selectedRoute.lifecycle}</StatusBadge>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${selectedProgress.percent}%` }} />
                </div>
                <p className="num t-meta text-muted-foreground">
                  {selectedProgress.done} / {selectedProgress.total} arrêts · {selectedProgress.percent} %
                </p>
                <Button className="w-full" onClick={() => navigate(`/planning/routes/${selectedRoute.name}`)}>
                  Ouvrir la tournée
                  <ArrowRight />
                </Button>
              </div>
            ) : (
              <p className="rounded-md border border-hairline bg-surface-subtle p-3 t-body text-muted-foreground">
                Sélectionnez une tournée dans le tableau.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Tournées</CardTitle>
          <p className="t-body text-muted-foreground">Cliquez une ligne pour voir les arrêts.</p>
        </CardHeader>
        <CardContent>
          <DataTable
            label="Tournées du jour"
            columns={routeColumns}
            rows={filtered}
            rowKey={(route) => route.name}
            rowTone={(route) => routeLifecycleTone(route.lifecycle)}
            isRowActive={(route) => route.name === selected}
            onRowClick={(route) => setSelected(route.name)}
            isLoading={isLoading}
            empty={
              <EmptyState
                icon={Route}
                title={routes.length ? "Aucune tournée pour ces filtres" : "Aucune tournée ce jour"}
                description={routes.length ? "Modifiez la recherche ou le cycle de vie." : "Changez de date ou préparez un nouveau planning."}
              />
            }
          />
        </CardContent>
      </Card>

      {selectedRoute && (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Arrêts · {selectedRoute.name}</CardTitle>
              <p className="t-body text-muted-foreground">Statut terrain et accès carte.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/planning/routes/${selectedRoute.name}`)}>
              Ouvrir la tournée
            </Button>
          </CardHeader>
          <CardContent>
            <DataTable
              label={`Arrêts de ${selectedRoute.name}`}
              columns={stopColumns}
              rows={[...selectedRoute.stops].sort((left, right) => left.sequence - right.sequence)}
              rowKey={(stop) => stop.deliveryNote}
              rowTone={(stop) => getStopVisualStyle(stop.status).tone}
              onRowClick={() => navigate(`/planning/routes/${selectedRoute.name}`)}
              empty={<p className="py-8 text-center t-body text-muted-foreground">Aucun arrêt sur cette tournée.</p>}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
