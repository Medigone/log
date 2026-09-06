import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, ChevronsUpDown, Lock, Search, Trash2, Truck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanItem,
  KanbanOverlay,
  useKanbanContext,
  type KanbanCommit,
  type KanbanValue,
} from "@/components/reui/kanban";
import { FilterSelect } from "@/components/FilterSelect";
import { PreparationMoreFilters, preparationChipClass } from "@/features/preparation/PreparationQueueShell";
import { BLCard } from "@/features/planning/BLCard";
import {
  BacklogEmptyState,
  BacklogGroupLabel,
  BacklogHeader,
  useBacklogGrouping,
  useBacklogGroups,
} from "@/features/planning/BacklogColumn";
import { DriverColumnHeader, NewRouteDropZoneBody } from "@/features/planning/DriverColumnHeader";
import { routeLifecycleTone } from "@/shared/design/statusTone";
import { formatQuantity } from "@/shared/format";
import { cn } from "@/lib/utils";
import type { DeliveryNoteAssignment, DistributionRoute, PlanningResource } from "@/shared/types/distribution";
import {
  BACKLOG_COLUMN_ID,
  buildKanbanValue,
  canDeleteDraftRoute,
  columnLoad,
  isRouteLocked,
  listActiveDrivers,
  newRouteColumnId,
  notesToMoveOnDrag,
  planningCollisionDetection,
  routeColumnId,
  routesForDriver,
  type KanbanBLItem,
} from "./kanbanHelpers";
import { canReprogramAssignment, isoDateWithOffset, timePart, matchesSearch, PLANNING_STATUSES } from "./planningHelpers";

interface PlanningKanbanProps {
  date: string;
  onDateChange: (date: string) => void;
  blDate: string;
  onBlDateChange: (date: string) => void;
  assignments: DeliveryNoteAssignment[];
  routes: DistributionRoute[];
  drivers: PlanningResource[];
  vehicles: PlanningResource[];
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  lateOnly: boolean;
  onLateOnlyChange: (value: boolean) => void;
  gpsOnly: boolean;
  onGpsOnlyChange: (value: boolean) => void;
  onMoveItem: (
    deliveryNotes: string[],
    toColumnId: string | null,
    position: number,
    fromColumnId: string | null,
  ) => Promise<"assigned" | "dialog" | "noop">;
  onBulkAssign: (deliveryNotes: string[], driverId?: string) => void;
  onCreateRoute: (deliveryNotes: string[]) => void;
  onUnassign: (deliveryNote: string, routeRevision: number) => Promise<void>;
  onReprogrammer: (assignment: DeliveryNoteAssignment) => void;
  onDeleteRoute?: (route: DistributionRoute) => void;
  statusFilter?: string;
  onStatusFilterChange?: (status: string) => void;
}

function isLateUnplanned(assignment: DeliveryNoteAssignment, today: string) {
  return !assignment.route && assignment.requestedDate != null && assignment.requestedDate < today;
}

export function PlanningKanban({
  date,
  onDateChange,
  blDate,
  onBlDateChange,
  assignments,
  routes,
  drivers,
  vehicles,
  selected,
  onSelectedChange,
  lateOnly,
  onLateOnlyChange,
  gpsOnly,
  onGpsOnlyChange,
  onMoveItem,
  onBulkAssign,
  onCreateRoute,
  onUnassign,
  onReprogrammer,
  onDeleteRoute,
  statusFilter = "",
  onStatusFilterChange,
}: PlanningKanbanProps) {
  const today = isoDateWithOffset();
  const [search, setSearch] = useState("");
  const [wilayaFilter, setWilayaFilter] = useState("");
  const [group, setGroup] = useBacklogGrouping();

  const kanbanValue = useMemo(
    () => buildKanbanValue(assignments, routes, drivers),
    [assignments, routes, drivers],
  );

  const [localValue, setLocalValue] = useState<KanbanValue<KanbanBLItem>>(kanbanValue);

  useEffect(() => {
    setLocalValue(kanbanValue);
  }, [kanbanValue]);

  const filtersActive = Boolean(search || statusFilter || wilayaFilter || lateOnly || gpsOnly);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return localValue.items.filter((item) => {
      const assignment = item.assignment;
      if (q && !matchesSearch(q, [assignment.deliveryNote, assignment.customerName, assignment.customer, assignment.commune, assignment.wilaya])) {
        return false;
      }
      if (statusFilter && assignment.planningStatus !== statusFilter) return false;
      if (wilayaFilter && assignment.wilaya !== wilayaFilter) return false;
      if (lateOnly && !isLateUnplanned(assignment, today)) return false;
      if (gpsOnly && !(assignment.planningAlert || assignment.requiresCustomerGeolocation)) return false;
      return true;
    });
  }, [gpsOnly, lateOnly, localValue.items, search, statusFilter, today, wilayaFilter]);

  const displayValue = useMemo(
    () => ({ ...localValue, items: filteredItems }),
    [localValue, filteredItems],
  );

  const wilayas = useMemo(
    () => [...new Set(assignments.map((assignment) => assignment.wilaya).filter(Boolean))].sort() as string[],
    [assignments],
  );

  const handleValueChange = useCallback((next: KanbanValue<KanbanBLItem>) => {
    setLocalValue(next);
  }, []);

  const backlogItems = filteredItems.filter((item) => item.columnId === BACKLOG_COLUMN_ID);
  const backlogGroups = useBacklogGroups(backlogItems, group);
  const activeDrivers = useMemo(() => listActiveDrivers(drivers), [drivers]);
  const allBacklogSelected = backlogItems.length > 0 && backlogItems.every((item) => selected.has(String(item.id)));

  const handleCommit = useCallback(
    async (commit: KanbanCommit<KanbanBLItem>) => {
      if (commit.fromColumnId === commit.toColumnId && commit.toColumnId === BACKLOG_COLUMN_ID) return;
      const toColumnId = commit.toColumnId === BACKLOG_COLUMN_ID ? null : String(commit.toColumnId);
      const fromColumnId = commit.fromColumnId === BACKLOG_COLUMN_ID ? null : String(commit.fromColumnId);
      const notes = notesToMoveOnDrag(
        commit.item.assignment.deliveryNote,
        selected,
        backlogItems.map((item) => String(item.id)),
      );
      if (notes.length > 1 && commit.toColumnId) {
        const targetColumn = String(commit.toColumnId);
        setLocalValue((prev) => ({
          ...prev,
          items: prev.items.map((item) =>
            notes.includes(String(item.id)) ? { ...item, columnId: targetColumn } : item,
          ),
        }));
      }
      const result = await onMoveItem(notes, toColumnId, commit.newIndex + 1, fromColumnId);
      if (result === "assigned") {
        const next = new Set(selected);
        for (const id of notes) next.delete(id);
        onSelectedChange(next);
      }
    },
    [backlogItems, onMoveItem, onSelectedChange, selected],
  );

  const toggleSelection = (deliveryNote: string) => {
    const next = new Set(selected);
    if (next.has(deliveryNote)) next.delete(deliveryNote);
    else next.add(deliveryNote);
    onSelectedChange(next);
  };

  const toggleSelectAllBacklog = () => {
    if (allBacklogSelected) {
      onSelectedChange(new Set());
      return;
    }
    onSelectedChange(new Set(backlogItems.map((item) => String(item.id))));
  };

  const navigateDate = (offset: number) => {
    const next = new Date(`${date}T00:00:00`);
    next.setDate(next.getDate() + offset);
    onDateChange(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`,
    );
  };

  const dateLabel = (() => {
    const [year, month, day] = date.split("-");
    const formatted = `${day}/${month}/${year}`;
    return date === today ? `${formatted} (aujourd’hui)` : formatted;
  })();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-lg border border-hairline bg-card p-0.5">
          <Button variant="ghost" size="icon-sm" onClick={() => navigateDate(-1)} aria-label="Jour précédent">
            <ChevronLeft />
          </Button>
          <Input
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
            className="h-7 w-[9.75rem] border-0 bg-transparent shadow-none"
            aria-label="Date livraison"
            title={dateLabel}
          />
          <Button variant="ghost" size="icon-sm" onClick={() => navigateDate(1)} aria-label="Jour suivant">
            <ChevronRight />
          </Button>
        </div>
        <Button variant="outline" size="sm" className="h-[30px] rounded-lg text-xs" onClick={() => onDateChange(today)}>
          Aujourd'hui
        </Button>
        {blDate ? (
          <span className="flex items-center gap-1">
            <Input type="date" value={blDate} onChange={(event) => onBlDateChange(event.target.value)} className="h-[30px] w-40" aria-label="Date BL" />
            <Button variant="ghost" size="sm" onClick={() => onBlDateChange("")}>
              Toutes
            </Button>
          </span>
        ) : null}
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un BL…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-[30px] pl-8"
            aria-label="Rechercher un BL"
          />
        </div>
        <button type="button" className={preparationChipClass(lateOnly)} onClick={() => onLateOnlyChange(!lateOnly)}>
          <span className="size-1.5 rounded-full bg-destructive" /> En retard
        </button>
        <button type="button" className={preparationChipClass(gpsOnly)} onClick={() => onGpsOnlyChange(!gpsOnly)}>
          <span className="size-1.5 rounded-full bg-amber-500" /> GPS manquant
        </button>
        <PreparationMoreFilters>
          {!blDate ? (
            <label className="flex flex-col gap-1.5 text-xs">
              <span className="text-muted-foreground">Date BL</span>
              <Input type="date" value={blDate} onChange={(event) => onBlDateChange(event.target.value)} aria-label="Date BL" />
            </label>
          ) : null}
          <FilterSelect
            label="Statut"
            value={statusFilter}
            onChange={(value) => onStatusFilterChange?.(value)}
            options={[{ value: "", label: "Tous statuts" }, ...PLANNING_STATUSES.map((item) => ({ value: item, label: item }))]}
          />
          <FilterSelect
            label="Wilaya"
            value={wilayaFilter}
            onChange={setWilayaFilter}
            options={[{ value: "", label: "Toutes wilayas" }, ...wilayas.map((wilaya) => ({ value: wilaya, label: wilaya }))]}
          />
        </PreparationMoreFilters>
      </div>

      <PlanningSelectionBar
        count={selected.size}
        onAssign={() => onBulkAssign(Array.from(selected))}
        onCreate={() => onCreateRoute(Array.from(selected))}
        onClear={() => onSelectedChange(new Set())}
      />

      <Kanban
        value={displayValue}
        onValueChange={handleValueChange}
        onValueCommit={handleCommit}
        collisionDetection={planningCollisionDetection}
        restoreOnCancel
        className="overflow-x-auto p-0.5"
      >
        <KanbanBoard className="flex items-start gap-3 pb-4">
          <KanbanColumn id={BACKLOG_COLUMN_ID} className="flex w-[268px] shrink-0 flex-col rounded-lg border bg-card">
            <BacklogHeader
              count={backlogItems.length}
              allSelected={allBacklogSelected}
              onToggleSelectAll={toggleSelectAllBacklog}
              group={group}
              onGroupChange={setGroup}
            />
            <div className="flex flex-col gap-2 p-2">
              {backlogItems.length === 0 ? (
                <BacklogEmptyState filtered={filtersActive} />
              ) : (
                backlogGroups.map((entry) => (
                  <div key={entry.key} className="flex flex-col gap-1.5">
                    {entry.label ? <BacklogGroupLabel label={entry.label} count={entry.items.length} /> : null}
                    {entry.items.map((item) => (
                      <KanbanItem key={item.id} id={item.id} asHandle className="p-0">
                        <BLCard
                          item={item}
                          today={today}
                          selectable
                          selected={selected.has(item.id as string)}
                          onToggleSelect={() => toggleSelection(item.id as string)}
                        />
                      </KanbanItem>
                    ))}
                  </div>
                ))
              )}
            </div>
          </KanbanColumn>

          {activeDrivers.map((driver) => {
            const driverRoutes = routesForDriver(routes, driver.name, date);
            const routeIds = new Set(driverRoutes.map((route) => routeColumnId(route.name)));
            return (
              <DriverColumn
                key={driver.name}
                driver={driver}
                items={filteredItems.filter((item) => routeIds.has(item.columnId))}
                routes={driverRoutes}
                vehicles={vehicles}
                today={today}
                onReprogrammer={onReprogrammer}
                onUnassign={onUnassign}
                onDeleteRoute={onDeleteRoute}
              />
            );
          })}
        </KanbanBoard>
        <DragCardOverlay today={today} selected={selected} />
      </Kanban>
    </div>
  );
}

export function PlanningSelectionBar({
  count,
  onAssign,
  onCreate,
  onClear,
}: {
  count: number;
  onAssign: () => void;
  onCreate: () => void;
  onClear: () => void;
}) {
  if (!count) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-muted/40 px-3 py-2">
      <span className="text-sm font-medium">
        {count} BL sélectionné{count > 1 ? "s" : ""}
      </span>
      <div className="flex-1" />
      <Button size="sm" variant="outline" onClick={onAssign}>
        Affecter à une tournée
      </Button>
      <Button size="sm" onClick={onCreate}>
        Créer une tournée
      </Button>
      <Button variant="ghost" size="sm" onClick={onClear}>
        <X className="size-4" /> Effacer
      </Button>
    </div>
  );
}

function DragCardOverlay({ today, selected }: { today: string; selected: Set<string> }) {
  const { activeItem } = useKanbanContext<KanbanBLItem>();
  const stacked = Boolean(activeItem && selected.size > 1 && selected.has(String(activeItem.id)));
  return (
    <KanbanOverlay>
      {activeItem ? (
        <div className="relative">
          <BLCard item={activeItem} today={today} />
          {stacked ? (
            <Badge className="absolute -top-1 -right-1" variant="default">
              {selected.size}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </KanbanOverlay>
  );
}

function DriverColumn({
  driver,
  items,
  routes,
  vehicles,
  today,
  onReprogrammer,
  onUnassign,
  onDeleteRoute,
}: {
  driver: PlanningResource;
  items: KanbanBLItem[];
  routes: DistributionRoute[];
  vehicles: PlanningResource[];
  today: string;
  onReprogrammer: (assignment: DeliveryNoteAssignment) => void;
  onUnassign: (deliveryNote: string, revision: number) => Promise<void>;
  onDeleteRoute?: (route: DistributionRoute) => void;
}) {
  const { blCount, articleCount } = columnLoad(items);

  return (
    <div
      className="flex w-[268px] shrink-0 flex-col rounded-lg border bg-card"
      aria-label={`${driver.label}, ${blCount} BL, ${formatQuantity(articleCount)} articles`}
    >
      <DriverColumnHeader driver={driver} items={items} vehicles={vehicles} />
      <div className="flex flex-col gap-1.5 p-1.5">
        {routes.map((route) => (
          <DriverRouteCard
            key={route.name}
            route={route}
            routeItems={items.filter((item) => item.columnId === routeColumnId(route.name))}
            today={today}
            onReprogrammer={onReprogrammer}
            onUnassign={onUnassign}
            onDeleteRoute={onDeleteRoute}
          />
        ))}
        <NewRouteDropZone driver={driver} today={today} />
      </div>
    </div>
  );
}

function DriverRouteCard({
  route,
  routeItems,
  today,
  onReprogrammer,
  onUnassign,
  onDeleteRoute,
}: {
  route: DistributionRoute;
  routeItems: KanbanBLItem[];
  today: string;
  onReprogrammer: (assignment: DeliveryNoteAssignment) => void;
  onUnassign: (deliveryNote: string, revision: number) => Promise<void>;
  onDeleteRoute?: (route: DistributionRoute) => void;
}) {
  const load = columnLoad(routeItems);
  const locked = isRouteLocked(route);
  const empty = routeItems.length === 0;
  const [userOpen, setUserOpen] = useState(empty);
  const [isOver, setIsOver] = useState(false);
  const open = empty || isOver || userOpen;

  return (
    <KanbanColumn
      id={routeColumnId(route.name)}
      disabled={locked}
      onOverChange={setIsOver}
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border bg-muted/20 p-1.5",
        locked && "bg-muted/30 opacity-80",
        "data-[over]:border-brand-400 data-[over]:bg-brand-50",
      )}
      aria-label={`${route.name}, ${load.blCount} BL, ${formatQuantity(load.articleCount)} articles`}
    >
      <Collapsible open={open} onOpenChange={setUserOpen}>
        <div className="flex items-start justify-between gap-2 px-0.5">
          <div className="min-w-0">
            <p className="flex items-center gap-1 truncate text-xs font-semibold">
              {locked && <Lock className="size-3.5 shrink-0 text-muted-foreground" />}
              <Link
                to={`/planning/routes/${encodeURIComponent(route.name)}`}
                aria-label={`Ouvrir ${route.name}`}
                className="truncate text-brand-700 hover:underline"
                onPointerDown={(event) => event.stopPropagation()}
              >
                {route.name}
              </Link>
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <StatusBadge tone={routeLifecycleTone(route.lifecycle)} size="sm">
                {route.lifecycle}
              </StatusBadge>
              <span>
                {timePart(route.plannedStart) || "08:00"} – {timePart(route.plannedEnd) || "12:00"}
              </span>
              {route.vehicleLabel && (
                <span className="flex items-center gap-0.5">
                  <Truck className="size-3" /> {route.vehicleLabel}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs">
              <span className="font-semibold tabular-nums">{load.blCount}</span> BL
              <span className="text-muted-foreground"> · </span>
              <span className="font-semibold tabular-nums">{formatQuantity(load.articleCount)}</span> art.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {canDeleteDraftRoute(route) && empty && onDeleteRoute ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Supprimer ${route.name}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onDeleteRoute(route)}
              >
                <Trash2 />
              </Button>
            ) : null}
            {!empty ? (
              <CollapsibleTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Afficher les BL de ${route.name}`}
                  />
                }
                onPointerDown={(event) => event.stopPropagation()}
              >
                <ChevronsUpDown />
              </CollapsibleTrigger>
            ) : null}
          </div>
        </div>
        <CollapsibleContent>
          <div className="flex min-h-10 flex-col gap-1.5 p-0.5">
            {routeItems.map((item, index) => (
              <KanbanItem key={item.id} id={item.id} asHandle={!locked} disabled={locked} className="p-0">
                <BLCard
                  item={item}
                  today={today}
                  locked={locked}
                  sequence={item.assignment.sequence || index + 1}
                  onReprogrammer={
                    locked && canReprogramAssignment(item.assignment.planningStatus)
                      ? () => onReprogrammer(item.assignment)
                      : undefined
                  }
                  onUnassign={!locked ? () => onUnassign(item.assignment.deliveryNote, route.revision) : undefined}
                />
              </KanbanItem>
            ))}
            {!locked && empty ? (
              <div className="flex min-h-8 items-center justify-center rounded-md border border-dashed text-[11px] text-muted-foreground">
                Déposer ici
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </KanbanColumn>
  );
}

function NewRouteDropZone({ driver, today }: { driver: PlanningResource; today: string }) {
  const { activeItem, value } = useKanbanContext<KanbanBLItem>();
  const columnId = newRouteColumnId(driver.name);
  const pending = value.items.filter((item) => item.columnId === columnId);
  const dragging = Boolean(activeItem);

  return (
    <KanbanColumn
      id={columnId}
      className={cn(
        "group/drop flex w-full flex-col rounded-lg border border-dashed border-hairline text-muted-foreground transition-colors",
        dragging && "border-muted-foreground/70",
        pending.length > 0 && "justify-start",
        "data-[over]:border-foreground/50 data-[over]:bg-muted data-[over]:text-foreground",
      )}
      aria-label={`Nouvelle tournée pour ${driver.label}`}
    >
      <div className="flex flex-col items-center">
        <NewRouteDropZoneBody dragging={dragging} />
        <span className={cn("pb-1.5 text-[10.5px]", dragging ? "block" : "hidden group-hover/drop:block")}>
          Séparé des tournées existantes
        </span>
      </div>
      {pending.map((item) => (
        <KanbanItem key={item.id} id={item.id} asHandle className="w-full p-1">
          <BLCard item={item} today={today} />
        </KanbanItem>
      ))}
    </KanbanColumn>
  );
}
