import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, RotateCcw, Route, Search, Truck } from "lucide-react";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DeliveriesAlertsSummary, IncidentChip } from "@/features/deliveries/DeliveriesAlertsSummary";
import { DeliveriesKpis, type KpiFocus } from "@/features/deliveries/DeliveriesKpis";
import { SelectedRouteRail } from "@/features/deliveries/SelectedRouteRail";
import { StopsSubTable } from "@/features/deliveries/StopsSubTable";
import { hasRouteEvents, lastRouteEvent, routeEvents } from "@/features/deliveries/routeEvents";
import { routeProgressColumns } from "@/features/deliveries/routeProgressColumns";
import { getStopVisualStyle } from "@/features/planning/stopStatus";
import { FleetMap } from "@/features/today/FleetMap";
import { fleetColor, isLiveRoute, lateDeparture } from "@/features/today/fleetProgress";
import { preparationChipClass } from "@/features/preparation/PreparationQueueShell";
import { apiErrorMessage, usePlanningBoard } from "@/shared/api/distribution";
import { formatShortDate } from "@/shared/format";
import type { DistributionRoute, RouteLifecycle, RouteStop } from "@/shared/types/distribution";
import { cn } from "@/lib/utils";

const LIFECYCLES: RouteLifecycle[] = ["Publiée", "En cours", "Retour dépôt", "Terminée"];

const LIFECYCLE_DOT: Record<string, string> = {
  Publiée: "bg-blue-500",
  "En cours": "bg-emerald-600",
  "Retour dépôt": "bg-amber-500",
  Terminée: "bg-muted-foreground/40",
};

function kpiFromParam(value: string | null): KpiFocus {
  if (value === "live" || value === "delivered" || value === "failed" || value === "late") return value;
  return "all";
}

function localDate() {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, offset: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayRelative(iso: string, today: string) {
  if (iso === today) return "Aujourd’hui";
  if (iso === addDays(today, -1)) return "Hier";
  if (iso === addDays(today, 1)) return "Demain";
  return "";
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

function toggleLifecycle(current: Set<RouteLifecycle>, value: RouteLifecycle) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function DeliveriesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const today = localDate();
  const [date, setDate] = useState(today);
  const [lifecycle, setLifecycle] = useState<Set<RouteLifecycle>>(new Set());
  const [driver, setDriver] = useState("");
  const [search, setSearch] = useState("");
  const [kpi, setKpi] = useState<KpiFocus>(() => kpiFromParam(searchParams.get("kpi")));
  const [selected, setSelected] = useState<string>(() => searchParams.get("route") || "");
  const [expanded, setExpanded] = useState<string>(() => searchParams.get("route") || "");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const live = date === today;
  const { data, error, isLoading } = usePlanningBoard(date, date, {}, { live });
  const routes = data?.message.routes || [];
  const query = search.trim().toLocaleLowerCase("fr");
  const filtersActive = Boolean(lifecycle.size || driver || search || kpi !== "all" || date !== today);

  const failedStops = routes.flatMap((route) => route.stops).filter((stop) => getStopVisualStyle(stop.status).state === "failed");
  const lateRoutes = routes.filter((route) => lateDeparture(route));
  const incidentCount = failedStops.length + lateRoutes.length;

  const filtered = useMemo(() => {
    return routes.filter((route) => {
      if (lifecycle.size && !lifecycle.has(route.lifecycle)) return false;
      if (driver && route.driver !== driver) return false;
      if (kpi === "live" && !isLiveRoute(route)) return false;
      if (kpi === "delivered" && !hasDeliveredStop(route)) return false;
      if (kpi === "failed" && !hasFailedStop(route)) return false;
      if (kpi === "late" && !lateDeparture(route)) return false;
      return matchesSearch(route, query);
    });
  }, [driver, kpi, lifecycle, query, routes]);
  const focusDn = searchParams.get("dn") || "";

  useEffect(() => {
    if (!focusDn) return;
    const match = filtered.find((route) => route.stops.some((stop) => stop.deliveryNote === focusDn));
    if (match) {
      setSelected(match.name);
      setExpanded(match.name);
    }
  }, [filtered, focusDn]);

  useEffect(() => {
    if (selected && !filtered.some((route) => route.name === selected)) {
      setSelected("");
      setExpanded("");
    }
  }, [filtered, selected]);

  const selectedRoute = filtered.find((route) => route.name === selected);
  const showLastEvent = hasRouteEvents(filtered);

  const applyKpi = (focus: KpiFocus) => {
    setKpi(focus);
    setLifecycle(new Set());
  };

  const selectAndExpand = (name: string, collapseIfSame = false) => {
    if (collapseIfSame && expanded === name && selected === name) {
      setExpanded("");
      return;
    }
    setSelected(name);
    setExpanded(name);
  };

  const clearFilters = () => {
    setDate(today);
    setLifecycle(new Set());
    setDriver("");
    setSearch("");
    setKpi("all");
  };

  const emptyTitle = routes.length ? "Aucune tournée pour ces filtres" : "Aucune tournée ce jour";
  const emptyDescription = routes.length
    ? "Modifiez la recherche ou le cycle de vie."
    : "Changez de date ou préparez un nouveau planning.";
  const emptyMapDescription = routes.length
    ? "Élargissez les filtres pour afficher la carte."
    : "Changez de date ou publiez un planning.";

  const openRoute = (name: string) => navigate(`/planning/routes/${name}`);
  const replanStop = (stop: RouteStop) => navigate(`/planning?select=${encodeURIComponent(stop.deliveryNote)}`);
  const callHref = selectedRoute?.stops.find((stop) => stop.phone)?.phone;

  const columns = useMemo(
    () =>
      routeProgressColumns({
        routes: filtered,
        expanded,
        lastEvent: showLastEvent ? lastRouteEvent : undefined,
      }),
    [expanded, filtered, showLastEvent],
  );

  return (
    <>
      <PageHeader
        eyebrow="Suivi opérationnel"
        title="Livraisons"
        description={`Avancement des tournées du ${formatShortDate(date)}.`}
        meta={
          <>
            {live ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
                Live · 10 s
              </span>
            ) : undefined}
            <IncidentChip count={incidentCount} open={alertsOpen} onToggle={() => setAlertsOpen((open) => !open)} />
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/cashier")}>
              Contrôle de caisse
            </Button>
            <Button onClick={() => navigate("/planning")}>
              Ouvrir le planning
              <ArrowRight />
            </Button>
          </>
        }
      />

      {alertsOpen ? (
        <DeliveriesAlertsSummary
          routes={routes}
          onFocusFailed={(name) => {
            applyKpi("failed");
            if (name) selectAndExpand(name);
            setAlertsOpen(false);
          }}
          onFocusLate={(name) => {
            applyKpi("late");
            if (name) selectAndExpand(name);
            setAlertsOpen(false);
          }}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2.5">
        <div className="flex items-center">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Jour précédent"
            className="rounded-r-none"
            onClick={() => setDate((current) => addDays(current, -1))}
          >
            <ChevronLeft />
          </Button>
          <div className="flex h-8 items-center gap-2 border-y border-input px-3">
            <span className="num whitespace-nowrap text-[12.5px] font-medium">{formatShortDate(date)}</span>
            {dayRelative(date, today) ? (
              <span className="whitespace-nowrap text-[11.5px] text-muted-foreground">{dayRelative(date, today)}</span>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Jour suivant"
            className="rounded-l-none"
            onClick={() => setDate((current) => addDays(current, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-[30px]" onClick={() => setDate(today)}>
          Aujourd’hui
        </Button>
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
        <InputGroup className="h-[30px] w-[220px] min-w-48 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Recherche"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tournée, client, BL…"
          />
        </InputGroup>
        {LIFECYCLES.map((status) => {
          const count = routes.filter((route) => route.lifecycle === status).length;
          const active = lifecycle.has(status);
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              aria-label={status}
              className={preparationChipClass(active)}
              onClick={() => {
                setLifecycle((current) => toggleLifecycle(current, status));
                setKpi("all");
              }}
            >
              <span className={cn("size-1.5 rounded-full", LIFECYCLE_DOT[status])} />
              {status}
              <span className="num text-[11px] opacity-70">{count}</span>
            </button>
          );
        })}
        <FilterSelect
          label="Livreur"
          value={driver || "all"}
          onChange={(value) => setDriver(value === "all" ? "" : value)}
          options={[
            { value: "all", label: "Tous les livreurs" },
            ...(data?.message.drivers || []).map((item) => ({ value: item.name, label: item.label })),
          ]}
        />
        <span className="num ml-auto text-[11px] text-muted-foreground">
          {filtered.length} / {routes.length} tournées
        </span>
        {filtersActive ? (
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            <RotateCcw data-icon="inline-start" />
            Réinitialiser
          </Button>
        ) : null}
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {apiErrorMessage(error)}
        </div>
      )}

      <DeliveriesKpis routes={routes} isLoading={isLoading} focus={kpi} onFocus={applyKpi} />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(272px,336px)]">
        <Card className="overflow-hidden">
          <CardHeader className="flex-row flex-wrap items-center gap-2">
            <CardTitle>Carte des tournées</CardTitle>
            <div className="flex flex-1 flex-wrap items-center gap-2">
              {filtered.map((route, index) => (
                <button
                  key={route.name}
                  type="button"
                  aria-pressed={selected === route.name}
                  className={cn(
                    "inline-flex items-center gap-1.5 text-[11.5px]",
                    selected === route.name ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => selectAndExpand(route.name)}
                >
                  <span className="size-2 rounded-full" style={{ background: fleetColor(index) }} />
                  {route.name}
                </button>
              ))}
              {selected ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => { setSelected(""); setExpanded(""); }}>
                  <RotateCcw data-icon="inline-start" />
                  Réinitialiser
                </Button>
              ) : null}
            </div>
            {live ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
                Positions mises à jour
              </span>
            ) : null}
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {filtered.length ? (
              <FleetMap routes={filtered} focus={selected || undefined} />
            ) : (
              <EmptyState
                icon={Truck}
                title={emptyTitle}
                description={emptyMapDescription}
                action={
                  <Button variant="outline" onClick={() => navigate("/planning")}>
                    Ouvrir le planning
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>

        <SelectedRouteRail
          route={selectedRoute}
          events={selectedRoute ? routeEvents(selectedRoute) : undefined}
          onOpenRoute={openRoute}
          onCall={
            callHref
              ? () => {
                  window.location.href = `tel:${callHref}`;
                }
              : undefined
          }
        />
      </section>

      <Card className="overflow-hidden py-0">
        <CardHeader className="py-2.5">
          <CardTitle>Tournées</CardTitle>
          <CardDescription>Cliquez une ligne pour voir les arrêts.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <p className="border-t px-4 py-2 num text-xs text-muted-foreground">Total : {filtered.length}</p>
          <DataTable
            className="rounded-none border-0 border-t"
            label="Tournées du jour"
            columns={columns}
            rows={filtered}
            rowKey={(route) => route.name}
            isRowActive={(route) => route.name === selected}
            isRowExpanded={(route) => route.name === expanded}
            expandedContent={(route) => (
              <StopsSubTable route={route} onOpenRoute={openRoute} onReplanStop={replanStop} />
            )}
            onRowClick={(route) => selectAndExpand(route.name, true)}
            isLoading={isLoading}
            empty={<EmptyState icon={Route} title={emptyTitle} description={emptyDescription} />}
          />
        </CardContent>
      </Card>
    </>
  );
}
