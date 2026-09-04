import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Lock,
  MapPin,
  Package,
  Plus,
  Search,
  Square,
  SquareCheck,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toolbar, ToolbarSpacer } from "@/components/ui/toolbar";
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
import { planningStatusTone, routeLifecycleTone } from "@/shared/design/statusTone";
import { formatQuantity } from "@/shared/format";
import { cn } from "@/lib/utils";
import type {
  DeliveryNoteAssignment,
  DistributionRoute,
  PlanningResource,
} from "@/shared/types/distribution";
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
  vehicleLabelFor,
  type KanbanBLItem,
} from "./kanbanHelpers";
import { canReprogramAssignment, isoDateWithOffset, timePart, matchesSearch } from "./planningHelpers";
import { FilterSelect } from "@/components/FilterSelect";

interface PlanningKanbanProps {
  date: string;
  onDateChange: (date: string) => void;
  blDate: string;
  onBlDateChange: (date: string) => void;
  assignments: DeliveryNoteAssignment[];
  routes: DistributionRoute[];
  drivers: PlanningResource[];
  vehicles: PlanningResource[];
  onMoveItem: (
    deliveryNotes: string[],
    toColumnId: string | null,
    position: number,
    fromColumnId: string | null,
  ) => Promise<"assigned" | "dialog" | "noop">;
  onBulkAssign: (deliveryNotes: string[], driverId?: string) => void;
  onUnassign: (deliveryNote: string, routeRevision: number) => Promise<void>;
  onReprogrammer: (assignment: DeliveryNoteAssignment) => void;
  onDeleteRoute?: (route: DistributionRoute) => void;
  isLoading?: boolean;
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
  onMoveItem,
  onBulkAssign,
  onUnassign,
  onReprogrammer,
  onDeleteRoute,
}: PlanningKanbanProps) {
  const today = isoDateWithOffset();
  const [search, setSearch] = useState("");
  const [statusFilter] = useState("");
  const [wilayaFilter, setWilayaFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const kanbanValue = useMemo(
    () => buildKanbanValue(assignments, routes, drivers),
    [assignments, routes, drivers],
  );

  const [localValue, setLocalValue] = useState<KanbanValue<KanbanBLItem>>(kanbanValue);

  useEffect(() => {
    setLocalValue(kanbanValue);
  }, [kanbanValue]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return localValue.items.filter((item) => {
      const a = item.assignment;
      if (q && !matchesSearch(q, [a.deliveryNote, a.customerName, a.customer, a.commune, a.wilaya])) return false;
      if (statusFilter && a.planningStatus !== statusFilter) return false;
      if (wilayaFilter && a.wilaya !== wilayaFilter) return false;
      return true;
    });
  }, [localValue.items, search, statusFilter, wilayaFilter]);

  const displayValue = useMemo(
    () => ({ ...localValue, items: filteredItems }),
    [localValue, filteredItems],
  );

  const wilayas = useMemo(
    () => [...new Set(assignments.map((a) => a.wilaya).filter(Boolean))].sort() as string[],
    [assignments],
  );

  const handleValueChange = useCallback((next: KanbanValue<KanbanBLItem>) => {
    setLocalValue(next);
  }, []);

  const backlogItems = filteredItems.filter((i) => i.columnId === BACKLOG_COLUMN_ID);
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
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of notes) next.delete(id);
          return next;
        });
      }
    },
    [backlogItems, onMoveItem, selected],
  );

  const toggleSelection = (dn: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dn)) next.delete(dn);
      else next.add(dn);
      return next;
    });
  };

  const toggleSelectAllBacklog = () => {
    if (allBacklogSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(backlogItems.map((item) => String(item.id))));
  };

  const navigateDate = (offset: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + offset);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    onDateChange(iso);
  };

  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Date BL</span>
            <Input
              type="date"
              value={blDate}
              onChange={(e) => onBlDateChange(e.target.value)}
              className="w-40"
              aria-label="Date BL"
            />
            {blDate ? (
              <Button variant="ghost" size="sm" onClick={() => onBlDateChange("")}>
                Toutes
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Date livraison</span>
            <Button variant="outline" size="icon" onClick={() => navigateDate(-1)} aria-label="Jour précédent">
              <ChevronLeft className="size-4" />
            </Button>
            <Input
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              className="w-40"
              aria-label="Date livraison"
            />
            <Button variant="outline" size="sm" onClick={() => onDateChange(today)}>
              Aujourd'hui
            </Button>
            <Button variant="outline" size="icon" onClick={() => navigateDate(1)} aria-label="Jour suivant">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        <ToolbarSpacer />
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 pl-9"
              aria-label="Rechercher un BL"
            />
          </div>
          <FilterSelect
            label="Wilaya"
            value={wilayaFilter}
            onChange={setWilayaFilter}
            options={[{ value: "", label: "Toutes wilayas" }, ...wilayas.map((w) => ({ value: w, label: w }))]}
          />
        </div>
      </Toolbar>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-brand-200 bg-brand-50 px-4 py-2">
          <span className="text-sm font-medium text-brand-900">
            {selected.size} BL sélectionné{selected.size > 1 ? "s" : ""}
          </span>
          <Button size="sm" onClick={() => onBulkAssign(Array.from(selected))}>
            Affecter à une tournée
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            <X className="size-4" /> Annuler
          </Button>
        </div>
      )}

      <Kanban
        value={displayValue}
        onValueChange={handleValueChange}
        onValueCommit={handleCommit}
        collisionDetection={planningCollisionDetection}
        restoreOnCancel
        className="overflow-x-auto p-0.5"
      >
        <KanbanBoard className="flex min-h-[28rem] gap-3 pb-4">
          <KanbanColumn id={BACKLOG_COLUMN_ID} className="flex w-64 shrink-0 flex-col gap-1.5 rounded-lg border bg-muted/30 p-1.5">
            <div className="flex flex-col gap-1 rounded-lg border bg-muted/50 px-2 py-1.5">
              <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                <Package className="size-4 shrink-0" />
                À planifier
                <Badge variant="secondary">{backlogItems.length}</Badge>
              </h3>
              {backlogItems.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="h-6 w-full text-xs"
                  onClick={toggleSelectAllBacklog}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {allBacklogSelected ? "Tout désélectionner" : "Tout sélectionner"}
                </Button>
              ) : null}
            </div>
            <div className="flex min-h-32 flex-col gap-1.5 p-0.5">
              {backlogItems.map((item) => (
                <KanbanItem key={item.id} id={item.id} asHandle className="p-0.5">
                  <BLCard
                    item={item}
                    selectable
                    selected={selected.has(item.id as string)}
                    onToggleSelect={() => toggleSelection(item.id as string)}
                    routes={routes}
                  />
                </KanbanItem>
              ))}
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
                onReprogrammer={onReprogrammer}
                onUnassign={onUnassign}
                onDeleteRoute={onDeleteRoute}
              />
            );
          })}
        </KanbanBoard>
        <DragCardOverlay routes={routes} selected={selected} />
      </Kanban>
    </div>
  );
}

function DragCardOverlay({ routes, selected }: { routes: DistributionRoute[]; selected: Set<string> }) {
  const { activeItem } = useKanbanContext<KanbanBLItem>();
  const stacked = Boolean(activeItem && selected.size > 1 && selected.has(String(activeItem.id)));
  return (
    <KanbanOverlay>
      {activeItem ? (
        <div className="relative">
          <BLCard item={activeItem} routes={routes} />
          {stacked ? (
            <Badge className="absolute -right-1 -top-1" variant="default">
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
  onReprogrammer,
  onUnassign,
  onDeleteRoute,
}: {
  driver: PlanningResource;
  items: KanbanBLItem[];
  routes: DistributionRoute[];
  vehicles: PlanningResource[];
  onReprogrammer: (a: DeliveryNoteAssignment) => void;
  onUnassign: (dn: string, rev: number) => Promise<void>;
  onDeleteRoute?: (route: DistributionRoute) => void;
}) {
  const { blCount, articleCount } = columnLoad(items);
  const vehicleLabel = vehicleLabelFor(driver.vehicle, vehicles);

  return (
    <div
      className="flex w-64 shrink-0 flex-col gap-1.5 rounded-lg border bg-card p-1.5"
      aria-label={`${driver.label}, ${blCount} BL, ${formatQuantity(articleCount)} articles`}
    >
      <div className="rounded-lg border-b-2 border-brand-300 bg-brand-50/50 px-2 py-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-700">{driver.label}</h3>
        {vehicleLabel && (
          <p className="mt-1 flex items-center gap-0.5 text-xs text-muted-foreground">
            <Truck className="size-3" /> {vehicleLabel}
          </p>
        )}
        <p className="mt-1 flex items-center gap-2 text-xs">
          <span>
            <span className="font-semibold tabular-nums">{blCount}</span> BL
          </span>
          <span className="text-muted-foreground">·</span>
          <span>
            <span className="font-semibold tabular-nums">{formatQuantity(articleCount)}</span> art.
          </span>
        </p>
      </div>

      <NewRouteDropZone driver={driver} routes={routes} />

      {routes.map((route) => (
        <DriverRouteCard
          key={route.name}
          route={route}
          routeItems={items.filter((item) => item.columnId === routeColumnId(route.name))}
          routes={routes}
          onReprogrammer={onReprogrammer}
          onUnassign={onUnassign}
          onDeleteRoute={onDeleteRoute}
        />
      ))}
    </div>
  );
}

function DriverRouteCard({
  route,
  routeItems,
  routes,
  onReprogrammer,
  onUnassign,
  onDeleteRoute,
}: {
  route: DistributionRoute;
  routeItems: KanbanBLItem[];
  routes: DistributionRoute[];
  onReprogrammer: (a: DeliveryNoteAssignment) => void;
  onUnassign: (dn: string, rev: number) => Promise<void>;
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
        "flex flex-col gap-1.5 rounded-lg border-2 border-border bg-muted/20 p-1.5",
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
            {routeItems.map((item) => (
              <KanbanItem key={item.id} id={item.id} asHandle={!locked} disabled={locked} className="p-0.5">
                <BLCard
                  item={item}
                  routes={routes}
                  locked={locked}
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
              <div className="flex min-h-12 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                Déposer ici
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </KanbanColumn>
  );
}

function NewRouteDropZone({
  driver,
  routes,
}: {
  driver: PlanningResource;
  routes: DistributionRoute[];
}) {
  const { activeItem, value } = useKanbanContext<KanbanBLItem>();
  const columnId = newRouteColumnId(driver.name);
  const pending = value.items.filter((item) => item.columnId === columnId);
  const dragging = Boolean(activeItem);

  return (
    <KanbanColumn
      id={columnId}
      className={cn(
        "flex min-h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-muted-foreground/40 bg-muted p-2 text-center text-xs text-muted-foreground transition-colors",
        dragging && "min-h-24 border-muted-foreground/70 bg-muted",
        pending.length > 0 && "justify-start",
        "data-[over]:border-foreground/50 data-[over]:bg-muted data-[over]:text-foreground data-[over]:shadow-inner",
      )}
      aria-label={`Nouvelle tournée pour ${driver.label}`}
    >
      <div className="flex flex-col items-center gap-1">
        <Plus className="size-4" />
        <span className="font-medium">{dragging ? "Déposer pour créer une tournée" : "Nouvelle tournée"}</span>
        <span className="text-xs">Séparé des tournées existantes</span>
      </div>
      {pending.map((item) => (
        <KanbanItem key={item.id} id={item.id} asHandle className="w-full p-0.5">
          <BLCard item={item} routes={routes} />
        </KanbanItem>
      ))}
    </KanbanColumn>
  );
}

function BLCard({
  item,
  selectable,
  selected,
  onToggleSelect,
  locked,
  onReprogrammer,
  onUnassign,
}: {
  item: KanbanBLItem;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  routes: DistributionRoute[];
  locked?: boolean;
  onReprogrammer?: () => void;
  onUnassign?: () => void;
}) {
  const a = item.assignment;
  const tone = planningStatusTone(a.planningStatus);

  return (
    <Card
      className={`overflow-visible border border-border text-xs shadow-none ring-0 transition-shadow hover:shadow-sm ${selected ? "border-brand-500 ring-2 ring-brand-500" : ""} ${locked ? "opacity-80" : ""}`}
    >
      <CardContent className="flex items-start gap-1.5 p-1.5">
        {selectable && (
          <button
            type="button"
            onClick={onToggleSelect}
            onPointerDown={(event) => event.stopPropagation()}
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={selected ? "Désélectionner" : "Sélectionner"}
          >
            {selected ? <SquareCheck className="size-4 text-brand-600" /> : <Square className="size-4" />}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="truncate font-semibold">{a.deliveryNote}</span>
            <StatusBadge tone={tone} size="sm">{a.planningStatus}</StatusBadge>
          </div>
          <p className="truncate text-muted-foreground">{a.customerName}</p>
          {a.commune && (
            <p className="mt-0.5 flex items-center gap-0.5 text-muted-foreground">
              <MapPin className="size-3" /> {a.commune}{a.wilaya ? `, ${a.wilaya}` : ""}
            </p>
          )}
          <div className="mt-0.5 flex items-center gap-2">
            {a.requestedDate && (
              <span className="flex items-center gap-0.5 text-muted-foreground">
                <Calendar className="size-3" /> {a.requestedDate}
              </span>
            )}
            <span>{formatQuantity(a.totalQuantity)} art.</span>
          </div>
          {(a.planningAlert || a.requiresCustomerGeolocation) && (
            <div className="mt-0.5 flex items-center gap-1 text-amber-600">
              <AlertTriangle className="size-3" />
              <span>{a.planningAlert || "GPS client manquant"}</span>
            </div>
          )}
          {(onReprogrammer || onUnassign) && (
            <div className="mt-1 flex items-center justify-end gap-1">
              {locked && onReprogrammer ? (
                <Button
                  variant="ghost"
                  size="xs"
                  className="mr-auto h-5 px-1.5 text-xs"
                  onClick={onReprogrammer}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  Reprogrammer
                </Button>
              ) : null}
              {onUnassign ? (
                <Button
                  variant="default"
                  size="xs"
                  className="h-5 bg-foreground px-1.5 text-xs text-background hover:bg-foreground/80 hover:text-background"
                  onClick={onUnassign}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  Retirer
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
