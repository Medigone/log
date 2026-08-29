import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, LoaderCircle, Package, RefreshCw, Search, Truck, Warehouse } from "lucide-react";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toolbar } from "@/components/ui/toolbar";
import { apiErrorMessage, useVehicleStocks } from "@/shared/api/distribution";
import { routeLifecycleTone, vehicleStatusTone, vehicleStockTone } from "@/shared/design/statusTone";
import { formatQuantity } from "@/shared/format";
import { cn } from "@/lib/utils";
import type { VehicleStock, VehicleStockLine } from "@/shared/types/distribution";

type StockFocus = "all" | "route" | "loaded" | "empty" | "missing" | "inactive";

function isActiveVehicle(vehicle: VehicleStock) {
  return vehicle.active !== false;
}

function onRoute(vehicle: VehicleStock) {
  return vehicle.activeRoutes.length > 0;
}

function isLoaded(vehicle: VehicleStock) {
  return vehicle.totalQuantity > 0;
}

function isEmpty(vehicle: VehicleStock) {
  return vehicle.totalQuantity <= 0 && !vehicle.missingWarehouse;
}

function stockLabel(vehicle: VehicleStock) {
  if (!isActiveVehicle(vehicle)) return "Inactif";
  if (vehicle.missingWarehouse) return "Entrepôt manquant";
  if (onRoute(vehicle)) return "En tournée";
  if (isLoaded(vehicle)) return "Chargé";
  return "Vide";
}

function matchesFocus(vehicle: VehicleStock, focus: StockFocus) {
  if (focus === "route") return onRoute(vehicle);
  if (focus === "loaded") return isLoaded(vehicle);
  if (focus === "empty") return isEmpty(vehicle);
  if (focus === "missing") return vehicle.missingWarehouse;
  if (focus === "inactive") return !isActiveVehicle(vehicle);
  return isActiveVehicle(vehicle);
}

function matchesSearch(vehicle: VehicleStock, query: string) {
  if (!query) return true;
  return [
    vehicle.label,
    vehicle.registration,
    vehicle.warehouse,
    vehicle.status,
    vehicle.name,
    ...vehicle.activeRoutes.flatMap((route) => [route.routeId, route.driver, route.driverName]),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLocaleLowerCase("fr").includes(query));
}

function VehicleStockSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]" aria-hidden="true">
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[108px] w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-lg" />
    </div>
  );
}

export function VehicleStockPage({ canLinkRoutes = false }: { canLinkRoutes?: boolean }) {
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState<StockFocus>("all");
  const [itemSearch, setItemSearch] = useState("");
  const { data, error, isLoading, mutate } = useVehicleStocks();
  const vehicles = useMemo(() => data?.message || [], [data?.message]);
  const query = search.trim().toLocaleLowerCase("fr");

  const totals = useMemo(
    () => ({
      onRoute: vehicles.filter(onRoute).length,
      loaded: vehicles.filter(isLoaded).length,
      empty: vehicles.filter(isEmpty).length,
      missing: vehicles.filter((row) => row.missingWarehouse).length,
    }),
    [vehicles],
  );

  const filtered = useMemo(
    () => vehicles.filter((row) => matchesFocus(row, focus) && matchesSearch(row, query)),
    [focus, query, vehicles],
  );

  useEffect(() => {
    if (filtered.length && !filtered.some((row) => row.name === selected)) setSelected(filtered[0].name);
    if (!filtered.length) setSelected("");
  }, [filtered, selected]);

  const vehicle = filtered.find((row) => row.name === selected) || vehicles.find((row) => row.name === selected);
  const activeRoute = vehicle?.activeRoutes[0];
  const lines = useMemo(() => {
    const haystack = itemSearch.trim().toLocaleLowerCase("fr");
    const source = vehicle?.lines || [];
    if (!haystack) return source;
    return source.filter((line) =>
      [line.itemCode, line.itemName, line.uom].filter(Boolean).some((value) => String(value).toLocaleLowerCase("fr").includes(haystack)),
    );
  }, [itemSearch, vehicle]);

  const columns: Array<DataTableColumn<VehicleStockLine>> = [
    {
      id: "item",
      header: "Article",
      sortValue: (line) => line.itemName || line.itemCode,
      cell: (line) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{line.itemName || line.itemCode}</p>
          <p className="truncate t-meta text-subtle">{line.itemCode}</p>
        </div>
      ),
    },
    {
      id: "uom",
      header: "Unité",
      width: "120px",
      hideBelow: "sm",
      sortValue: (line) => line.uom || "",
      cell: (line) => <span className="text-muted-foreground">{line.uom || "—"}</span>,
    },
    {
      id: "quantity",
      header: "Quantité",
      width: "120px",
      align: "right",
      numeric: true,
      sortValue: (line) => line.quantity,
      cell: (line) => <span className="font-semibold">{formatQuantity(line.quantity)}</span>,
    },
  ];

  const routeChip = (routeId: string, className?: string) =>
    canLinkRoutes ? (
      <Link
        to={`/planning/routes/${encodeURIComponent(routeId)}`}
        className={cn("num font-medium text-brand-700 hover:underline", className)}
        onClick={(event) => event.stopPropagation()}
      >
        {routeId}
      </Link>
    ) : (
      <span className={cn("num text-muted-foreground", className)}>{routeId}</span>
    );

  return (
    <>
      <PageHeader
        eyebrow="Stock physique"
        title="Stock des véhicules"
        description="Stock physique des camions, à jour toutes les 10 secondes."
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
            Live 10 s
          </span>
        }
        actions={
          <Button variant="outline" onClick={() => void mutate()} disabled={isLoading}>
            {isLoading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            Actualiser
          </Button>
        }
      />

      <section aria-label="Indicateurs du stock véhicules" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={Truck}
          tone={totals.onRoute ? "info" : "neutral"}
          label="En tournée"
          value={isLoading && !vehicles.length ? "—" : totals.onRoute}
          hint="Camions sur le terrain →"
          onClick={() => setFocus("route")}
          className={focus === "route" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
        <KpiTile
          icon={Package}
          tone={totals.loaded ? "success" : "neutral"}
          label="Chargés"
          value={isLoading && !vehicles.length ? "—" : totals.loaded}
          hint="Articles dans le camion →"
          onClick={() => setFocus("loaded")}
          className={focus === "loaded" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
        <KpiTile
          icon={Warehouse}
          tone="neutral"
          label="Vides"
          value={isLoading && !vehicles.length ? "—" : totals.empty}
          hint="Entrepôt sans article →"
          onClick={() => setFocus("empty")}
          className={focus === "empty" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
        <KpiTile
          icon={AlertTriangle}
          tone={totals.missing ? "warning" : "neutral"}
          label="Entrepôt manquant"
          value={isLoading && !vehicles.length ? "—" : totals.missing}
          hint={totals.missing ? "À configurer →" : "Tous rattachés →"}
          onClick={() => setFocus("missing")}
          className={focus === "missing" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
      </section>

      <Toolbar>
        <InputGroup className="min-w-48 flex-1 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Véhicule, plaque, livreur ou tournée…"
            aria-label="Rechercher un véhicule"
          />
        </InputGroup>
        <FilterSelect
          label="État"
          value={focus}
          onChange={(value) => setFocus(value as StockFocus)}
          options={[
            { value: "all", label: "Tous (actifs)" },
            { value: "route", label: "En tournée" },
            { value: "loaded", label: "Chargé" },
            { value: "empty", label: "Vide" },
            { value: "missing", label: "Entrepôt manquant" },
            { value: "inactive", label: "Inactifs" },
          ]}
        />
      </Toolbar>

      {error && (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(error)}
        </p>
      )}

      {isLoading && !vehicles.length && <VehicleStockSkeleton />}

      {!isLoading && vehicles.length === 0 && (
        <div className="rounded-lg border border-dashed border-hairline-strong bg-card">
          <EmptyState
            icon={Truck}
            title="Aucun véhicule"
            description="Créez un véhicule pour suivre son stock camion."
          />
        </div>
      )}

      {vehicles.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start">
          <section className="space-y-2 lg:max-h-[calc(100vh-18rem)] lg:overflow-y-auto lg:pr-1">
            {filtered.map((row) => {
              const active = row.name === selected;
              const inactive = !isActiveVehicle(row);
              return (
                <button
                  key={row.name}
                  type="button"
                  onClick={() => setSelected(row.name)}
                  aria-pressed={active}
                  className={cn(
                    "w-full rounded-lg border p-4 text-left shadow-card transition-colors",
                    active ? "border-brand-300 bg-brand-50" : "border-hairline bg-card hover:border-hairline-strong",
                    inactive && "opacity-70",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="t-section text-foreground">{row.label}</p>
                      <p className="truncate t-meta text-muted-foreground">
                        {row.registration || row.name}
                      </p>
                    </div>
                    <StatusBadge tone={vehicleStockTone(row)} size="sm">
                      {stockLabel(row)}
                    </StatusBadge>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium">
                    <span className="num rounded-full bg-surface-subtle px-2.5 py-1 text-slate-700">
                      {formatQuantity(row.totalQuantity)} art. · {row.itemCount} ligne{row.itemCount > 1 ? "s" : ""}
                    </span>
                    {row.activeRoutes[0] && (
                      <span className="num rounded-full bg-brand-50 px-2.5 py-1 text-brand-800">
                        {row.activeRoutes[0].routeId}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
            {!filtered.length && (
              <p className="rounded-lg border border-dashed border-hairline-strong bg-card p-4 t-body text-muted-foreground">
                Aucun véhicule ne correspond à la recherche.
              </p>
            )}
          </section>

          <Card className="p-4 sm:p-5">
            {!vehicle && <p className="t-body text-muted-foreground">Sélectionnez un véhicule pour voir son stock.</p>}
            {vehicle && (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="t-display">{vehicle.label}</h2>
                    <p className="t-body text-muted-foreground">
                      {vehicle.warehouse || "Aucun entrepôt n’est associé à ce véhicule."}
                    </p>
                    {vehicle.status && (
                      <StatusBadge tone={vehicleStatusTone(vehicle.status)} size="sm" className="mt-2">
                        {vehicle.status}
                      </StatusBadge>
                    )}
                  </div>
                  {activeRoute && (
                    <div className="rounded-lg border border-hairline bg-surface-subtle px-3 py-2 text-right">
                      <p className="t-micro text-muted-foreground">Tournée active</p>
                      <p className="mt-0.5">{routeChip(activeRoute.routeId)}</p>
                      <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
                        <StatusBadge tone={routeLifecycleTone(activeRoute.lifecycle)} size="sm">
                          {activeRoute.lifecycle}
                        </StatusBadge>
                        {activeRoute.driverName && (
                          <span className="t-meta text-muted-foreground">{activeRoute.driverName}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {vehicle.missingWarehouse && (
                  <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    L’entrepôt camion n’est pas encore créé. Le stock physique restera vide tant qu’il n’existe pas.
                  </p>
                )}
                <label className="block">
                  <span className="sr-only">Filtrer les articles</span>
                  <Input
                    value={itemSearch}
                    onChange={(event) => setItemSearch(event.target.value)}
                    placeholder="Filtrer un article…"
                    aria-label="Filtrer les articles"
                  />
                </label>
                {!vehicle.lines.length && !vehicle.missingWarehouse && (
                  <div className="rounded-md border border-dashed border-hairline-strong">
                    <EmptyState
                      icon={Package}
                      title="Véhicule vide"
                      description="Aucun article n’est actuellement dans cet entrepôt."
                    />
                  </div>
                )}
                {vehicle.lines.length > 0 && (
                  <DataTable
                    label={`Stock du véhicule ${vehicle.label}`}
                    columns={columns}
                    rows={lines}
                    rowKey={(line) => `${line.itemCode}-${line.uom || ""}`}
                    rowTone={(line) => (line.quantity > 0 ? "success" : "neutral")}
                    maxHeight="max-h-[55vh]"
                    empty={
                      <p className="py-8 text-center t-body text-muted-foreground">
                        Aucun article ne correspond au filtre.
                      </p>
                    }
                  />
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

export default VehicleStockPage;
