import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Banknote, ChevronLeft, ChevronRight, RefreshCw, RotateCcw, Search } from "lucide-react";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader } from "@/components/ui/page-header";
import { Toolbar, ToolbarSpacer } from "@/components/ui/toolbar";
import { cashierRouteColumns } from "@/features/cashier/cashierRouteColumns";
import {
  CASH_STATUSES,
  cashierListKpis,
  formatSignedMoney,
  oldestToControlRoute,
  plural,
  routeMatchesQuery,
} from "@/features/cashier/cashTotals";
import { preparationChipClass } from "@/features/preparation/PreparationQueueShell";
import { apiErrorMessage, useCashierRoutes } from "@/shared/api/distribution";
import { cashStatusTone, TONES } from "@/shared/design/statusTone";
import { formatMoney } from "@/shared/format";
import type { DistributionRoute } from "@/shared/types/distribution";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<string, string> = {
  "À contrôler": "bg-amber-500",
  Écart: "bg-red-500",
  Validée: "bg-emerald-500",
  "Sans encaissement": "bg-slate-400",
};

function isoDate(offsetDays = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, offset: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daySpan(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  return Math.max(Math.round((end.getTime() - start.getTime()) / 86_400_000), 0);
}

function dayMonth(iso?: string) {
  if (!iso) return "—";
  const [, month, day] = iso.slice(0, 10).split("-");
  return day && month ? `${day}/${month}` : iso;
}

function parseStatuses(value: string | null) {
  const next = new Set((value || "").split("|").map((item) => item.trim()).filter(Boolean));
  return next;
}

export function CashierPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dateFrom, setDateFrom] = useState(() => searchParams.get("from") || isoDate(-7));
  const [dateTo, setDateTo] = useState(() => searchParams.get("to") || isoDate());
  const [query, setQuery] = useState(() => searchParams.get("q") || "");
  const [driver, setDriver] = useState(() => searchParams.get("driver") || "");
  const [statuses, setStatuses] = useState(() => parseStatuses(searchParams.get("status")));
  const { data, error, isLoading, mutate: refreshRoutes } = useCashierRoutes(dateFrom, dateTo, "");
  const routes = useMemo(() => data?.message || [], [data?.message]);
  const kpis = useMemo(() => cashierListKpis(routes), [routes]);
  const columns = useMemo(() => cashierRouteColumns(), []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    return routes.filter((route) => {
      if (driver && route.driver !== driver) return false;
      if (statuses.size && !statuses.has(route.cash.status)) return false;
      return routeMatchesQuery(route, needle);
    });
  }, [driver, query, routes, statuses]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const status of CASH_STATUSES) counts[status] = 0;
    for (const route of routes) counts[route.cash.status] = (counts[route.cash.status] || 0) + 1;
    return counts;
  }, [routes]);

  const drivers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const route of routes) {
      if (route.driver) seen.set(route.driver, route.driverName || route.driver);
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [routes]);

  const filtersActive = Boolean(query || driver || statuses.size);
  const oldest = oldestToControlRoute(routes);
  const span = daySpan(dateFrom, dateTo);

  const listSearch = (overrides: Record<string, string> = {}) => {
    const params = new URLSearchParams();
    params.set("from", dateFrom);
    params.set("to", dateTo);
    if (query) params.set("q", query);
    if (driver) params.set("driver", driver);
    if (statuses.size) params.set("status", [...statuses].join("|"));
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const encoded = params.toString();
    return encoded ? `?${encoded}` : "";
  };

  const syncParams = (next: { from?: string; to?: string; q?: string; driver?: string; statuses?: Set<string> }) => {
    const from = next.from ?? dateFrom;
    const to = next.to ?? dateTo;
    const q = next.q ?? query;
    const driverValue = next.driver ?? driver;
    const statusSet = next.statuses ?? statuses;
    const params = new URLSearchParams();
    params.set("from", from);
    params.set("to", to);
    if (q) params.set("q", q);
    if (driverValue) params.set("driver", driverValue);
    if (statusSet.size) params.set("status", [...statusSet].join("|"));
    setSearchParams(params, { replace: true });
  };

  const openRoute = (route: DistributionRoute) => {
    navigate(`/cashier/${encodeURIComponent(route.name)}${listSearch()}`);
  };

  const toggleStatus = (status: string) => {
    const next = new Set(statuses);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    setStatuses(next);
    syncParams({ statuses: next });
  };

  const shiftPeriod = (direction: number) => {
    const offset = (span || 7) * direction;
    const from = addDays(dateFrom, offset);
    const to = addDays(dateTo, offset);
    setDateFrom(from);
    setDateTo(to);
    syncParams({ from, to });
  };

  return (
    <>
      <PageHeader
        eyebrow="Contrôle financier"
        title="Caisse des tournées"
        meta={
          kpis.gapCount ? (
            <button
              type="button"
              onClick={() => {
                const next = new Set(["Écart"]);
                setStatuses(next);
                syncParams({ statuses: next });
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700"
            >
              <span className="size-1.5 rounded-full bg-red-500" />
              {kpis.gapCount} en écart
            </button>
          ) : null
        }
        actions={
          <>
            <Button variant="outline" onClick={() => void refreshRoutes()} disabled={isLoading}>
              <RefreshCw />
              Actualiser
            </Button>
            <Button disabled={!oldest} onClick={() => oldest && openRoute(oldest)}>
              Contrôler la plus ancienne →
            </Button>
          </>
        }
      />

      {error ? (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(error)}
        </p>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="À contrôler"
          value={formatMoney(kpis.toControlAmount, { precise: true })}
          hint={
            kpis.toControlCount
              ? `${plural(kpis.toControlCount, "tournée", "tournées")} · plus ancienne ${dayMonth(kpis.oldestToControl)}`
              : "Tout est contrôlé"
          }
        />
        <KpiTile
          label="Écarts"
          value={formatSignedMoney(kpis.gapAmount)}
          hint={
            kpis.gapCount
              ? `${plural(kpis.gapCount, "tournée", "tournées")} en attente de décision responsable`
              : "Aucun écart sur la période"
          }
          tone={kpis.gapCount ? "danger" : "neutral"}
          className={kpis.gapCount ? TONES.danger.surface : undefined}
        />
        <KpiTile
          label="Chèques à vérifier"
          value={formatMoney(kpis.chequesAmount, { precise: true })}
          hint={`${plural(kpis.chequePaymentCount, "chèque", "chèques")} à saisir et vérifier`}
        />
        <KpiTile
          label="Comptabilisé"
          value={formatMoney(kpis.validatedAmount, { precise: true })}
          hint={`${plural(kpis.validatedCount, "tournée", "tournées")} · règlements créés`}
          tone={kpis.validatedCount ? "success" : "neutral"}
          className={kpis.validatedCount ? TONES.success.surface : undefined}
        />
      </section>

      <Toolbar>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border bg-background">
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Période précédente" onClick={() => shiftPeriod(-1)}>
              <ChevronLeft />
            </Button>
            <span className="num px-1 text-sm whitespace-nowrap">
              {dayMonth(dateFrom)} → {dayMonth(dateTo)}
            </span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Période suivante" onClick={() => shiftPeriod(1)}>
              <ChevronRight />
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">{span} jours</span>
        </div>
        <InputGroup className="h-8 w-64 min-w-48 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              syncParams({ q: event.target.value });
            }}
            placeholder="Tournée, livreur, client…"
            aria-label="Rechercher une tournée"
          />
        </InputGroup>
        {CASH_STATUSES.map((status) => {
          const active = statuses.has(status);
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              className={preparationChipClass(active)}
              onClick={() => toggleStatus(status)}
            >
              <span className={cn("size-1.5 rounded-full", STATUS_DOT[status] || TONES[cashStatusTone(status)].dot)} />
              {status}
              <span className="num text-[11px] opacity-70">{statusCounts[status] || 0}</span>
            </button>
          );
        })}
        <FilterSelect
          label="Livreur"
          value={driver || "all"}
          onChange={(value) => {
            const next = value === "all" ? "" : value;
            setDriver(next);
            syncParams({ driver: next });
          }}
          options={[{ value: "all", label: "Tous les livreurs" }, ...drivers]}
        />
        <ToolbarSpacer />
        <span className="num text-[11px] text-muted-foreground">
          {filtered.length} / {routes.length} tournées
        </span>
        {filtersActive ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              setDriver("");
              setStatuses(new Set());
              syncParams({ q: "", driver: "", statuses: new Set() });
            }}
          >
            <RotateCcw />
            Réinitialiser
          </Button>
        ) : null}
      </Toolbar>

      <Card className="overflow-hidden py-0">
        <CardHeader className="flex-row flex-wrap items-center gap-2 py-2.5">
          <CardTitle>Tournées encaissées</CardTitle>
          <span className="num rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{filtered.length}</span>
          <p className="ml-auto t-body text-muted-foreground">Cliquez une ligne pour ouvrir son détail caisse.</p>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <div className="min-w-[856px]">
              <DataTable
                className="rounded-none border-0 border-t"
                label="Tournées encaissées"
                columns={columns}
                rows={filtered}
                rowKey={(route) => route.name}
                rowTone={(route) => (route.cash.status === "Écart" ? "danger" : route.cash.status === "Validée" ? "success" : undefined)}
                onRowClick={openRoute}
                isLoading={isLoading}
                empty={
                  <EmptyState
                    icon={Banknote}
                    title="Aucune tournée à contrôler"
                    description="Élargissez la période ou retirez les filtres. Les encaissements sont contrôlables dès qu'ils sont déclarés, sans attendre le retour stock."
                  />
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

export default CashierPage;
