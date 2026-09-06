import { useEffect, useMemo, useState } from "react"
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
  lifecycleFilter?: string
}

export function RoutesBoard({ routes, drivers, vehicles, isLoading, onDeleteRoute, lifecycleFilter = "" }: RoutesBoardProps) {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [lifecycle, setLifecycle] = useState(lifecycleFilter)
  const [driver, setDriver] = useState("")
  const [vehicle, setVehicle] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [alertsOnly, setAlertsOnly] = useState(false)

  useEffect(() => {
    setLifecycle(lifecycleFilter)
  }, [lifecycleFilter])

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
          <p className="truncate font-mono text-[12.5px] font-semibold">{row.name}</p>
          <p className="truncate t-meta text-muted-foreground">{row.date}</p>
        </div>
      ),
    },
    {
      id: "driver",
      header: "Livreur",
      hideBelow: "md",
      sortValue: (row) => row.driverName || row.driver || "",
      cell: (row) => <span className="truncate">{row.driverName || driverLabel(row.driver) || "—"}</span>,
    },
    {
      id: "vehicle",
      header: "Véhicule",
      hideBelow: "md",
      sortValue: (row) => row.vehicleLabel || row.vehicle || "",
      cell: (row) => <span className="truncate text-muted-foreground">{row.vehicleLabel || vehicleLabel(row.vehicle) || "—"}</span>,
    },
    {
      id: "slot",
      header: "Créneau",
      hideBelow: "lg",
      cell: (row) => (
        <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
          {timePart(row.plannedStart) || "—"} – {timePart(row.plannedEnd) || "—"}
        </span>
      ),
    },
    {
      id: "stops",
      header: "BL",
      width: "64px",
      numeric: true,
      align: "right",
      sortValue: (row) => row.stops.length,
      cell: (row) => <span className="num">{row.stops.length}</span>,
    },
    {
      id: "articles",
      header: "Art.",
      width: "74px",
      numeric: true,
      align: "right",
      sortValue: (row) => row.totalQuantity,
      cell: (row) => <span className="num text-muted-foreground">{formatQuantity(row.totalQuantity)}</span>,
    },
    {
      id: "status",
      header: "État",
      width: "minmax(0, 1.1fr)",
      sortValue: (row) => row.lifecycle,
      cell: (row) => (
        <div className="min-w-0 space-y-1">
          <StatusBadge tone={routeLifecycleTone(row.lifecycle)} size="sm">
            {row.lifecycle}
          </StatusBadge>
          <p className="truncate t-meta text-muted-foreground">
            {row.acknowledged ? "Acceptée" : row.lifecycle === "Publiée" ? "Acceptation requise" : `Révision ${row.revision}`}
          </p>
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      width: "160px",
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
      <div>
        <h2 className="text-base font-semibold">Tournées ({filtered.length})</h2>
        <p className="t-meta text-muted-foreground">Une tournée publiée exige un motif de reprogrammation.</p>
      </div>

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
