import { useEffect, useMemo, useState } from "react"
import { CalendarDays, CalendarPlus, LocateFixed, Pencil, RefreshCw, RotateCcw, Search, Square, SquareCheck } from "lucide-react"
import { DateRangeFilter } from "@/components/DateRangeFilter"
import { FilterSelect } from "@/components/FilterSelect"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { ListPagination, usePagedList } from "@/components/ui/list-pagination"
import { StatusBadge } from "@/components/ui/status-badge"
import { Toolbar, ToolbarSpacer } from "@/components/ui/toolbar"
import { cn } from "@/lib/utils"
import { planningStatusTone } from "@/shared/design/statusTone"
import { formatQuantity } from "@/shared/format"
import type { DeliveryNoteAssignment, DistributionRoute, PlanningResource, PlanningStatus } from "@/shared/types/distribution"
import {
  canReprogramAssignment,
  PLANNING_STATUSES,
  dateKey,
  isoDateWithOffset,
  matchesIndependentDateFilters,
  matchesSearch,
  timePart,
  type DateScope,
} from "@/features/planning/planningHelpers"
import { PlanningSelectionBar } from "@/features/planning/PlanningKanban"

interface DeliveryNotesBoardProps {
  rows: DeliveryNoteAssignment[]
  routes?: DistributionRoute[]
  drivers: PlanningResource[]
  vehicles: PlanningResource[]
  isLoading: boolean
  onEdit: (row: DeliveryNoteAssignment) => void
  onReprepare: (row: DeliveryNoteAssignment) => void
  statusFilter?: string
  selected?: Set<string>
  onSelectedChange?: (next: Set<string>) => void
  onBulkAssign?: (deliveryNotes: string[]) => void
  onCreateRoute?: (deliveryNotes: string[]) => void
  alertsOnly?: boolean
}

export function DeliveryNotesBoard({
  rows,
  routes = [],
  drivers,
  vehicles,
  isLoading,
  onEdit,
  onReprepare,
  statusFilter = "",
  selected = new Set(),
  onSelectedChange,
  onBulkAssign,
  onCreateRoute,
  alertsOnly: alertsOnlyProp,
}: DeliveryNotesBoardProps) {
  const [search, setSearch] = useState("")
  const [dateScope, setDateScope] = useState<DateScope>("all")
  const [blDateFrom, setBlDateFrom] = useState("")
  const [blDateTo, setBlDateTo] = useState("")
  const [plannedFrom, setPlannedFrom] = useState("")
  const [plannedTo, setPlannedTo] = useState("")
  const [status, setStatus] = useState(statusFilter)

  useEffect(() => {
    setStatus(statusFilter)
  }, [statusFilter])
  const [wilaya, setWilaya] = useState("")
  const [driver, setDriver] = useState("")
  const [vehicle, setVehicle] = useState("")
  const [alertsOnly, setAlertsOnly] = useState(Boolean(alertsOnlyProp))

  useEffect(() => {
    if (alertsOnlyProp) setAlertsOnly(true)
  }, [alertsOnlyProp])

  const wilayas = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.wilaya).filter((value): value is string => Boolean(value)))).sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
    [rows],
  )

  const driverLabel = (name?: string) => drivers.find((item) => item.name === name)?.label

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr")
    const today = isoDateWithOffset(0)
    const tomorrow = isoDateWithOffset(1)
    return rows.filter((row) => {
      if (
        !matchesSearch(query, [row.deliveryNote, row.customerName, row.customer, row.commune, row.wilaya, row.route])
      ) {
        return false
      }
      if (status && row.planningStatus !== status) return false
      if (wilaya && row.wilaya !== wilaya) return false
      if (driver && row.driver !== driver) return false
      if (vehicle && row.vehicle !== vehicle) return false
      if (alertsOnly && !(row.planningAlert || row.requiresCustomerGeolocation)) return false
      const requested = dateKey(row.requestedDate)
      if (dateScope === "today" && requested !== today) return false
      if (dateScope === "tomorrow" && requested !== tomorrow) return false
      if (dateScope === "overdue" && (!requested || requested >= today)) return false
      if (!matchesIndependentDateFilters(row.requestedDate, row.plannedDate, blDateFrom, blDateTo, plannedFrom, plannedTo)) {
        return false
      }
      return true
    })
  }, [alertsOnly, blDateFrom, blDateTo, dateScope, driver, plannedFrom, plannedTo, rows, search, status, vehicle, wilaya])

  const filtersActive = Boolean(
    search ||
      dateScope !== "all" ||
      blDateFrom ||
      blDateTo ||
      plannedFrom ||
      plannedTo ||
      status ||
      wilaya ||
      driver ||
      vehicle ||
      alertsOnly,
  )
  const resetKey = `${search}|${dateScope}|${blDateFrom}|${blDateTo}|${plannedFrom}|${plannedTo}|${status}|${wilaya}|${driver}|${vehicle}|${alertsOnly}`
  const page = usePagedList(filtered, resetKey)

  const resetFilters = () => {
    setSearch("")
    setDateScope("all")
    setBlDateFrom("")
    setBlDateTo("")
    setPlannedFrom("")
    setPlannedTo("")
    setStatus("")
    setWilaya("")
    setDriver("")
    setVehicle("")
    setAlertsOnly(false)
  }

  const today = isoDateWithOffset(0)
  const allVisibleSelected = filtered.length > 0 && filtered.every((row) => selected.has(row.deliveryNote))
  const routeByName = useMemo(() => new Map(routes.map((route) => [route.name, route])), [routes])

  const toggleRow = (deliveryNote: string) => {
    if (!onSelectedChange) return
    const next = new Set(selected)
    if (next.has(deliveryNote)) next.delete(deliveryNote)
    else next.add(deliveryNote)
    onSelectedChange(next)
  }

  const toggleAllVisible = () => {
    if (!onSelectedChange) return
    const next = new Set(selected)
    if (allVisibleSelected) {
      for (const row of filtered) next.delete(row.deliveryNote)
    } else {
      for (const row of filtered) next.add(row.deliveryNote)
    }
    onSelectedChange(next)
  }

  const columns: Array<DataTableColumn<DeliveryNoteAssignment>> = [
    {
      id: "select",
      header: onSelectedChange ? (
        <button type="button" onClick={toggleAllVisible} aria-label={allVisibleSelected ? "Tout désélectionner" : "Tout sélectionner"} className="text-muted-foreground hover:text-foreground">
          {allVisibleSelected ? <SquareCheck className="size-4 text-foreground" /> : <Square className="size-4" />}
        </button>
      ) : (
        ""
      ),
      width: "36px",
      cell: (row) => {
        const on = selected.has(row.deliveryNote)
        return (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              toggleRow(row.deliveryNote)
            }}
            aria-label={on ? "Désélectionner" : "Sélectionner"}
            className="text-muted-foreground hover:text-foreground"
          >
            {on ? <SquareCheck className="size-4 text-foreground" /> : <Square className="size-4" />}
          </button>
        )
      },
    },
    {
      id: "deliveryNote",
      header: "BL · Client",
      width: "minmax(0, 1.4fr)",
      sortValue: (row) => row.deliveryNote,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-[12.5px] font-medium">{row.deliveryNote}</p>
          <p className="truncate text-[11px] text-muted-foreground">{row.customerName}</p>
        </div>
      ),
    },
    {
      id: "place",
      header: "Lieu",
      width: "minmax(0, 1fr)",
      sortValue: (row) => row.wilaya || row.commune || "",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] text-muted-foreground">
            {[row.commune, row.wilaya].filter(Boolean).join(", ") || "—"}
          </p>
          {row.requiresCustomerGeolocation && (
            <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-800">
              <LocateFixed className="size-3" />
              GPS client à collecter
            </span>
          )}
        </div>
      ),
    },
    {
      id: "requestedDate",
      header: "Livraison souhaitée",
      width: "minmax(0, 1fr)",
      sortValue: (row) => row.requestedDate || "",
      cell: (row) => {
        const late = !row.route && row.requestedDate != null && row.requestedDate < today
        return (
          <span className={cn("whitespace-nowrap font-mono text-xs", late ? "text-destructive" : "text-muted-foreground")}>
            {row.requestedDate || "—"}
          </span>
        )
      },
    },
    {
      id: "status",
      header: "Statut",
      width: "104px",
      sortValue: (row) => row.planningStatus,
      cell: (row) => (
        <StatusBadge tone={planningStatusTone(row.planningStatus)} size="sm">
          {row.planningStatus}
        </StatusBadge>
      ),
    },
    {
      id: "articles",
      header: "Art.",
      width: "74px",
      align: "right",
      numeric: true,
      sortValue: (row) => row.totalQuantity,
      cell: (row) => <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatQuantity(row.totalQuantity)}</span>,
    },
    {
      id: "route",
      header: "Tournée",
      width: "130px",
      sortValue: (row) => row.route || "",
      cell: (row) =>
        row.route ? (
          <span className="truncate font-mono text-[11.5px]">{row.route}</span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        ),
    },
    {
      id: "driver",
      header: "Livreur · Créneau",
      width: "minmax(0, 1fr)",
      hideBelow: "lg",
      cell: (row) => {
        const route = row.route ? routeByName.get(row.route) : undefined
        if (!route && !row.driver) return <span className="text-muted-foreground/50">—</span>
        const slot = [row.plannedStart || route?.plannedStart, row.plannedEnd || route?.plannedEnd]
          .map((value) => (value ? timePart(value) : ""))
          .filter(Boolean)
          .join(" – ")
        return (
          <span className="truncate text-xs text-muted-foreground">
            {[driverLabel(row.driver) || route?.driverName, slot].filter(Boolean).join(" · ") || "—"}
          </span>
        )
      },
    },
    {
      id: "actions",
      header: "",
      width: "120px",
      align: "right",
      cell: (row) => (
        <span className="flex flex-wrap justify-end gap-1" onClick={(event) => event.stopPropagation()}>
          <Button
            type="button"
            size="xs"
            variant={row.route ? "outline" : "default"}
            onClick={() => onEdit(row)}
            disabled={!canReprogramAssignment(row.planningStatus)}
          >
            {row.route ? <Pencil /> : <CalendarPlus />}
            {row.route ? "Reprogrammer" : "Planifier"}
          </Button>
          {row.planningStatus === "À repréparer" && (
            <Button type="button" size="xs" onClick={() => onReprepare(row)}>
              <RefreshCw />
              Reprendre
            </Button>
          )}
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-base font-semibold">Bons de livraison ({filtered.length})</h2>

      <Toolbar>
        <InputGroup className="min-w-48 flex-1 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Recherche"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="BL, client, commune…"
          />
        </InputGroup>
        <FilterSelect
          label="Échéance"
          value={dateScope}
          onChange={(value) => {
            setDateScope(value as DateScope)
            setBlDateFrom("")
            setBlDateTo("")
          }}
          options={[
            { value: "all", label: "Toutes" },
            { value: "today", label: "Aujourd’hui" },
            { value: "tomorrow", label: "Demain" },
            { value: "overdue", label: "En retard" },
          ]}
        />
        <FilterSelect
          label="Statut"
          value={status || "all"}
          onChange={(value) => setStatus(value === "all" ? "" : (value as PlanningStatus))}
          options={[{ value: "all", label: "Tous" }, ...PLANNING_STATUSES.map((item) => ({ value: item, label: item }))]}
        />
        <FilterSelect
          label="Wilaya"
          value={wilaya || "all"}
          onChange={(value) => setWilaya(value === "all" ? "" : value)}
          options={[{ value: "all", label: "Toutes" }, ...wilayas.map((value) => ({ value, label: value }))]}
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
          label="Date BL"
          from={blDateFrom}
          to={blDateTo}
          onChange={(range) => {
            setBlDateFrom(range.from)
            setBlDateTo(range.to)
            setDateScope("all")
          }}
        />
        <DateRangeFilter
          label="Date livraison"
          from={plannedFrom}
          to={plannedTo}
          onChange={(range) => {
            setPlannedFrom(range.from)
            setPlannedTo(range.to)
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

      <PlanningSelectionBar
        count={selected.size}
        onAssign={() => onBulkAssign?.(Array.from(selected))}
        onCreate={() => onCreateRoute?.(Array.from(selected))}
        onClear={() => onSelectedChange?.(new Set())}
      />

      <DataTable
        label="Bons de livraison à planifier"
        columns={columns}
        rows={page.paged}
        rowKey={(row) => row.deliveryNote}
        rowTone={(row) => planningStatusTone(row.planningStatus)}
        isLoading={isLoading && !rows.length}
        empty={
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarDays />
              </EmptyMedia>
              <EmptyTitle>{rows.length ? "Aucun BL ne correspond" : "Aucun BL à afficher"}</EmptyTitle>
              <EmptyDescription>
                {rows.length ? "Modifiez ou réinitialisez les filtres." : "Les bons préparés apparaîtront ici pour planification."}
              </EmptyDescription>
            </EmptyHeader>
            {rows.length ? (
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
