import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Eye, RotateCcw, Route, Search, Trash2 } from "lucide-react"
import { DateRangeFilter } from "@/components/DateRangeFilter"
import { FilterSelect } from "@/components/FilterSelect"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { ListPagination, usePagedList } from "@/components/ui/list-pagination"
import { StatusBadge } from "@/components/ui/status-badge"
import { Toolbar, ToolbarSpacer } from "@/components/ui/toolbar"
import { routeLifecycleTone } from "@/shared/design/statusTone"
import { formatQuantity } from "@/shared/format"
import type { DistributionRoute, PlanningResource, RouteLifecycle } from "@/shared/types/distribution"
import { canDeleteDraftRoute } from "@/features/planning/kanbanHelpers"
import { ROUTE_LIFECYCLES, matchesDateRange, matchesSearch, timePart } from "@/features/planning/planningHelpers"

interface RoutesBoardProps {
  routes: DistributionRoute[]
  drivers: PlanningResource[]
  vehicles: PlanningResource[]
  isLoading: boolean
  onDeleteRoute?: (route: DistributionRoute) => void
}

export function RoutesBoard({ routes, drivers, vehicles, isLoading, onDeleteRoute }: RoutesBoardProps) {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [lifecycle, setLifecycle] = useState("")
  const [driver, setDriver] = useState("")
  const [vehicle, setVehicle] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [alertsOnly, setAlertsOnly] = useState(false)

  const driverNames = useMemo(
    () => Object.fromEntries(drivers.map((item) => [item.name, item.label])),
    [drivers],
  )
  const vehicleNames = useMemo(
    () => Object.fromEntries(vehicles.map((item) => [item.name, item.label])),
    [vehicles],
  )
  const driverLabel = (name?: string) => (name ? driverNames[name] : undefined)
  const vehicleLabel = (name?: string) => (name ? vehicleNames[name] : undefined)

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr")
    return routes.filter((route) => {
      if (
        !matchesSearch(query, [
          route.name,
          route.driver,
          route.driverName,
          route.driver ? driverNames[route.driver] : undefined,
          route.vehicle,
          route.vehicleLabel,
          route.vehicle ? vehicleNames[route.vehicle] : undefined,
        ])
      ) {
        return false
      }
      if (lifecycle && route.lifecycle !== lifecycle) return false
      if (driver && route.driver !== driver) return false
      if (vehicle && route.vehicle !== vehicle) return false
      if ((dateFrom || dateTo) && !matchesDateRange(route.date, dateFrom, dateTo)) return false
      if (alertsOnly && !(route.needsReview || route.alerts.length)) return false
      return true
    })
  }, [alertsOnly, dateFrom, dateTo, driver, driverNames, lifecycle, routes, search, vehicle, vehicleNames])

  const filtersActive = Boolean(search || lifecycle || driver || vehicle || dateFrom || dateTo || alertsOnly)
  const resetKey = `${search}|${lifecycle}|${driver}|${vehicle}|${dateFrom}|${dateTo}|${alertsOnly}`
  const page = usePagedList(filtered, resetKey)

  const resetFilters = () => {
    setSearch("")
    setLifecycle("")
    setDriver("")
    setVehicle("")
    setDateFrom("")
    setDateTo("")
    setAlertsOnly(false)
  }

  const openRoute = (route: DistributionRoute) => {
    navigate(`/planning/routes/${encodeURIComponent(route.name)}`)
  }

  const columns: Array<DataTableColumn<DistributionRoute>> = [
    {
      id: "name",
      header: "Tournée",
      sortValue: (row) => `${row.date}-${row.name}`,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-brand-700">{row.name}</p>
          <p className="truncate t-meta text-muted-foreground">
            {row.date} · {timePart(row.plannedStart) || "créneau manquant"}–{timePart(row.plannedEnd) || "—"}
          </p>
        </div>
      ),
    },
    {
      id: "resources",
      header: "Ressources",
      hideBelow: "md",
      sortValue: (row) => `${row.driverName || row.driver || ""} ${row.vehicleLabel || row.vehicle || ""}`,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate">{row.driverName || driverLabel(row.driver) || "Livreur manquant"}</p>
          <p className="truncate t-meta text-muted-foreground">
            {row.vehicleLabel || vehicleLabel(row.vehicle) || "Véhicule manquant"}
          </p>
        </div>
      ),
    },
    {
      id: "stops",
      header: "Arrêts",
      width: "120px",
      numeric: true,
      hideBelow: "lg",
      sortValue: (row) => row.stops.length,
      cell: (row) => (
        <div className="min-w-0">
          <p className="num">{row.stops.length} arrêt{row.stops.length > 1 ? "s" : ""}</p>
          <p className="num t-meta text-muted-foreground">{formatQuantity(row.totalQuantity)} art.</p>
        </div>
      ),
    },
    {
      id: "status",
      header: "Statut",
      width: "minmax(0, 1.1fr)",
      sortValue: (row) => row.lifecycle,
      cell: (row) => (
        <div className="min-w-0 space-y-1">
          <StatusBadge tone={routeLifecycleTone(row.lifecycle)} size="sm">
            {row.lifecycle}
          </StatusBadge>
          <p className="truncate t-meta text-muted-foreground">
            Révision {row.revision}
            {row.acknowledged ? " · acceptée" : row.lifecycle === "Publiée" ? " · acceptation requise" : ""}
          </p>
        </div>
      ),
    },
    {
      id: "alerts",
      header: "Alertes",
      hideBelow: "md",
      sortValue: (row) => (row.needsReview || row.alerts.length ? 1 : 0),
      cell: (row) => {
        const text = [row.reviewReason, ...row.alerts].filter(Boolean).join(" ")
        if (!text) return <span className="text-muted-foreground">—</span>
        return <p className="line-clamp-2 t-meta text-amber-800">{text}</p>
      },
    },
    {
      id: "actions",
      header: "Actions",
      width: "260px",
      align: "right",
      cell: (row) => (
        <span className="inline-flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
          {canDeleteDraftRoute(row) && onDeleteRoute ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              aria-label={`Supprimer ${row.name}`}
              onClick={() => onDeleteRoute(row)}
            >
              <Trash2 />
              Supprimer
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={row.lifecycle === "Brouillon" ? "default" : "outline"}
            onClick={() => openRoute(row)}
          >
            <Eye />
            {row.lifecycle === "Brouillon" ? "Vérifier avant publication" : "Ouvrir"}
          </Button>
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-base font-semibold">Tournées ({filtered.length})</h2>

      <Toolbar>
        <InputGroup className="min-w-48 flex-1 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Rechercher une tournée"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tournée, livreur, véhicule…"
          />
        </InputGroup>
        <FilterSelect
          label="État"
          value={lifecycle || "all"}
          onChange={(value) => setLifecycle(value === "all" ? "" : (value as RouteLifecycle))}
          options={[{ value: "all", label: "Tous" }, ...ROUTE_LIFECYCLES.map((item) => ({ value: item, label: item }))]}
        />
        <FilterSelect
          label="Livreur"
          value={driver || "all"}
          onChange={(value) => setDriver(value === "all" ? "" : value)}
          options={[{ value: "all", label: "Tous" }, ...drivers.map((item) => ({ value: item.name, label: item.label }))]}
        />
        <FilterSelect
          label="Véhicule"
          value={vehicle || "all"}
          onChange={(value) => setVehicle(value === "all" ? "" : value)}
          options={[{ value: "all", label: "Tous" }, ...vehicles.map((item) => ({ value: item.name, label: item.label }))]}
        />
        <DateRangeFilter
          from={dateFrom}
          to={dateTo}
          onChange={(range) => {
            setDateFrom(range.from)
            setDateTo(range.to)
          }}
        />
        <label className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border bg-background px-2.5 text-sm font-medium">
          <input
            type="checkbox"
            checked={alertsOnly}
            onChange={(event) => setAlertsOnly(event.target.checked)}
            className="size-4 accent-primary"
          />
          Alertes seules
        </label>
        {filtersActive ? (
          <>
            <ToolbarSpacer />
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw data-icon="inline-start" />
              Réinitialiser
            </Button>
          </>
        ) : null}
      </Toolbar>

      <DataTable
        label="Tournées à planifier"
        columns={columns}
        rows={page.paged}
        rowKey={(row) => row.name}
        rowTone={(row) => routeLifecycleTone(row.lifecycle)}
        onRowClick={openRoute}
        isLoading={isLoading && !routes.length}
        empty={
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Route />
              </EmptyMedia>
              <EmptyTitle>{routes.length ? "Aucune tournée ne correspond" : "Aucune tournée"}</EmptyTitle>
              <EmptyDescription>
                {routes.length
                  ? "Modifiez ou réinitialisez les filtres."
                  : "Planifiez un BL pour créer une tournée brouillon."}
              </EmptyDescription>
            </EmptyHeader>
            {routes.length ? (
              <EmptyContent>
                <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
                  Réinitialiser
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        }
      />
      <ListPagination
        page={page.page}
        totalPages={page.totalPages}
        total={page.total}
        from={page.from}
        to={page.to}
        onPageChange={page.setPage}
      />
    </div>
  )
}
