import { useMemo, useState } from "react"
import { CalendarDays, CalendarPlus, LocateFixed, Pencil, RefreshCw, RotateCcw, Search } from "lucide-react"
import { DateRangeFilter } from "@/components/DateRangeFilter"
import { FilterSelect } from "@/components/FilterSelect"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { ListPagination, usePagedList } from "@/components/ui/list-pagination"
import { StatusBadge } from "@/components/ui/status-badge"
import { Toolbar, ToolbarSpacer } from "@/components/ui/toolbar"
import { planningStatusTone } from "@/shared/design/statusTone"
import { formatQuantity } from "@/shared/format"
import type { DeliveryNoteAssignment, PlanningResource, PlanningStatus } from "@/shared/types/distribution"
import {
  LOCKED_STATUSES,
  PLANNING_STATUSES,
  dateKey,
  isoDateWithOffset,
  matchesDateRange,
  matchesSearch,
  timePart,
  type DateScope,
} from "@/features/planning/planningHelpers"

interface DeliveryNotesBoardProps {
  rows: DeliveryNoteAssignment[]
  drivers: PlanningResource[]
  vehicles: PlanningResource[]
  isLoading: boolean
  onEdit: (row: DeliveryNoteAssignment) => void
  onReprepare: (row: DeliveryNoteAssignment) => void
}

export function DeliveryNotesBoard({
  rows,
  drivers,
  vehicles,
  isLoading,
  onEdit,
  onReprepare,
}: DeliveryNotesBoardProps) {
  const [search, setSearch] = useState("")
  const [dateScope, setDateScope] = useState<DateScope>("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [status, setStatus] = useState("")
  const [wilaya, setWilaya] = useState("")
  const [driver, setDriver] = useState("")
  const [vehicle, setVehicle] = useState("")
  const [alertsOnly, setAlertsOnly] = useState(false)

  const wilayas = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.wilaya).filter((value): value is string => Boolean(value)))).sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
    [rows],
  )

  const driverLabel = (name?: string) => drivers.find((item) => item.name === name)?.label
  const vehicleLabel = (name?: string) => vehicles.find((item) => item.name === name)?.label

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
      if (dateFrom || dateTo) {
        const inRequested = matchesDateRange(row.requestedDate, dateFrom, dateTo)
        const inPlanned = matchesDateRange(row.plannedDate, dateFrom, dateTo)
        if (!inRequested && !inPlanned) return false
      }
      return true
    })
  }, [alertsOnly, dateFrom, dateScope, dateTo, driver, rows, search, status, vehicle, wilaya])

  const filtersActive = Boolean(
    search || dateScope !== "all" || dateFrom || dateTo || status || wilaya || driver || vehicle || alertsOnly,
  )
  const resetKey = `${search}|${dateScope}|${dateFrom}|${dateTo}|${status}|${wilaya}|${driver}|${vehicle}|${alertsOnly}`
  const page = usePagedList(filtered, resetKey)

  const resetFilters = () => {
    setSearch("")
    setDateScope("all")
    setDateFrom("")
    setDateTo("")
    setStatus("")
    setWilaya("")
    setDriver("")
    setVehicle("")
    setAlertsOnly(false)
  }

  const columns: Array<DataTableColumn<DeliveryNoteAssignment>> = [
    {
      id: "deliveryNote",
      header: "N° BL",
      width: "minmax(0, 1.1fr)",
      sortValue: (row) => row.deliveryNote,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-brand-700">{row.deliveryNote}</p>
          <p className="truncate t-meta text-muted-foreground">{formatQuantity(row.totalQuantity)} article(s) restant(s)</p>
        </div>
      ),
    },
    {
      id: "customer",
      header: "Client",
      width: "minmax(0, 1.3fr)",
      sortValue: (row) => row.customerName,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.customerName}</p>
          <p className="truncate t-meta text-muted-foreground">{row.wilaya || row.commune || "Localisation non renseignée"}</p>
          {row.requiresCustomerGeolocation && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
              <LocateFixed className="size-3" />
              GPS client à collecter
            </span>
          )}
        </div>
      ),
    },
    {
      id: "requestedDate",
      header: "Demandée",
      width: "110px",
      hideBelow: "lg",
      numeric: true,
      sortValue: (row) => row.requestedDate || "",
      cell: (row) => (
        <span className={row.planningStatus === "En retard" ? "font-medium text-red-700" : "text-muted-foreground"}>
          {row.requestedDate || "—"}
        </span>
      ),
    },
    {
      id: "plannedDate",
      header: "Planifiée",
      width: "110px",
      hideBelow: "md",
      numeric: true,
      sortValue: (row) => row.plannedDate || "",
      cell: (row) => row.plannedDate || <span className="text-subtle">—</span>,
    },
    {
      id: "status",
      header: "Statut",
      width: "minmax(0, 1.2fr)",
      sortValue: (row) => row.planningStatus,
      cell: (row) => (
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={planningStatusTone(row.planningStatus)} size="sm">
              {row.planningStatus}
            </StatusBadge>
            {row.route && (
              <span className="truncate t-meta text-slate-600">
                {row.route} · rév. {row.routeRevision}
              </span>
            )}
          </div>
          <p className="truncate t-meta text-muted-foreground">
            {row.route
              ? `${timePart(row.plannedStart) || "—"}–${timePart(row.plannedEnd) || "—"} · ${driverLabel(row.driver) || "Livreur manquant"} · ${vehicleLabel(row.vehicle) || "Véhicule manquant"}`
              : "Aucune tournée affectée"}
          </p>
          {row.planningAlert && <p className="line-clamp-2 t-meta text-amber-800">{row.planningAlert}</p>}
        </div>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      width: "180px",
      align: "right",
      cell: (row) => (
        <span className="flex flex-wrap justify-end gap-2" onClick={(event) => event.stopPropagation()}>
          <Button
            type="button"
            size="sm"
            variant={row.route ? "outline" : "default"}
            onClick={() => onEdit(row)}
            disabled={LOCKED_STATUSES.includes(row.planningStatus)}
          >
            {row.route ? <Pencil /> : <CalendarPlus />}
            {row.route ? "Reprogrammer" : "Planifier"}
          </Button>
          {row.planningStatus === "À repréparer" && (
            <Button type="button" size="sm" onClick={() => onReprepare(row)}>
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
            setDateFrom("")
            setDateTo("")
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
          from={dateFrom}
          to={dateTo}
          onChange={(range) => {
            setDateFrom(range.from)
            setDateTo(range.to)
            setDateScope("all")
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
