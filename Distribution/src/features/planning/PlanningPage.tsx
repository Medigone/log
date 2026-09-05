import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Check, Columns3, LoaderCircle, Table2 } from "lucide-react";
import { FormSelect } from "@/components/FilterSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DeliveryNotesBoard } from "@/features/planning/DeliveryNotesBoard";
import { DeleteDraftRouteDialog } from "@/features/planning/DeleteDraftRouteDialog";
import { PlanningKanban } from "@/features/planning/PlanningKanban";
import { isoDateWithOffset, nextFreeSlot, timePart } from "@/features/planning/planningHelpers";
import { parseNewRouteColumnId, parseRouteColumnId } from "@/features/planning/kanbanHelpers";
import { RoutesBoard } from "@/features/planning/RoutesBoard";
import { apiErrorMessage, useDistributionMutations, usePlanningBoard } from "@/shared/api/distribution";
import type { AssignmentChange, DeliveryNoteAssignment, DistributionRoute } from "@/shared/types/distribution";

function defaultPlannedDate(assignment: DeliveryNoteAssignment) {
  const planned = assignment.plannedDate || assignment.requestedDate || "";
  const today = isoDateWithOffset();
  return !planned || planned < today ? today : planned;
}

interface EditorProps {
  assignment: DeliveryNoteAssignment;
  routes: DistributionRoute[];
  drivers: Array<{ name: string; label: string; active: boolean; vehicle?: string }>;
  vehicles: Array<{ name: string; label: string; active: boolean }>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function AssignmentEditor({ assignment, routes, drivers, vehicles, onClose, onSaved }: EditorProps) {
  const source = routes.find((route) => route.name === assignment.route);
  const isNewAssignment = !assignment.route;
  const [date, setDate] = useState(defaultPlannedDate(assignment));
  const [start, setStart] = useState(timePart(assignment.plannedStart) || "08:00");
  const [end, setEnd] = useState(timePart(assignment.plannedEnd) || "12:00");
  const [driver, setDriver] = useState(assignment.driver || "");
  const [vehicle, setVehicle] = useState(assignment.vehicle || "");
  const [targetRouteId, setTargetRouteId] = useState(assignment.route || "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const actions = useDistributionMutations();
  const resourcesChanged =
    !isNewAssignment &&
    (date !== (assignment.plannedDate || "") ||
      driver !== (assignment.driver || "") ||
      vehicle !== (assignment.vehicle || "") ||
      start !== (timePart(assignment.plannedStart) || "08:00") ||
      end !== (timePart(assignment.plannedEnd) || "12:00"));
  const compatible = routes.filter(
    (route) =>
      !["En cours", "Terminée", "Annulée"].includes(route.lifecycle) &&
      route.date === date &&
      route.driver === driver &&
      route.vehicle === vehicle &&
      timePart(route.plannedStart) === start &&
      timePart(route.plannedEnd) === end &&
      (!resourcesChanged || route.name !== assignment.route),
  );

  useEffect(() => {
    if (targetRouteId && !compatible.some((route) => route.name === targetRouteId)) setTargetRouteId("");
  }, [compatible, targetRouteId]);

  const submit = async () => {
    if (!date || !start || !end || !driver || !vehicle) {
      setError("La date, le créneau, le livreur et le véhicule sont obligatoires.");
      return;
    }
    const target = compatible.find((route) => route.name === targetRouteId);
    const touchesPublished = source?.lifecycle === "Publiée" || target?.lifecycle === "Publiée";
    if (!isNewAssignment && touchesPublished && !reason.trim()) {
      setError("Le motif est obligatoire lorsqu'une tournée publiée est reprogrammée.");
      return;
    }
    if (isNewAssignment && compatible.length > 1 && !targetRouteId) {
      setError("Plusieurs tournées compatibles existent : choisissez la destination.");
      return;
    }
    let nextTargetId: string | undefined;
    if (target && target.name !== source?.name) nextTargetId = target.name;
    else if (!resourcesChanged) nextTargetId = source?.name;
    const payload: AssignmentChange = {
      deliveryNote: assignment.deliveryNote,
      targetRouteId: nextTargetId,
      plannedDate: date,
      plannedStart: `${date}T${start}:00`,
      plannedEnd: `${date}T${end}:00`,
      driver,
      vehicle,
      position: isNewAssignment ? 1 : Math.max(assignment.sequence || 1, 1),
      reason: isNewAssignment ? undefined : reason.trim() || undefined,
      expectedSourceRevision: source?.revision,
      expectedTargetRevision: target && target.name !== source?.name ? target.revision : undefined,
    };
    setError("");
    try {
      if (isNewAssignment) await actions.scheduleDeliveryNote(payload);
      else await actions.reassignDeliveryNote(payload);
      await onSaved();
      onClose();
    } catch (mutationError) {
      setError(apiErrorMessage(mutationError));
    }
  };

  const resetTarget = () => setTargetRouteId("");
  const title = isNewAssignment ? "Planifier la livraison" : "Reprogrammer la livraison";
  const today = isoDateWithOffset();
  const dateMin = date && date < today ? date : today;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-label={`${title} ${assignment.deliveryNote}`}>
        <SheetHeader>
          <p className="t-micro text-brand-700">{title}</p>
          <SheetTitle className="t-display">{assignment.deliveryNote}</SheetTitle>
          <p className="t-body text-muted-foreground">{assignment.customerName}</p>
        </SheetHeader>

        <SheetBody className="grid gap-4 sm:grid-cols-2">
          {error && (
            <div
              role="alert"
              className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 sm:col-span-2"
            >
              <AlertTriangle className="size-4 shrink-0" />
              {error}
            </div>
          )}

          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="t-micro text-muted-foreground">Date planifiée</span>
            <Input
              type="date"
              aria-label="Date planifiée"
              min={dateMin}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                resetTarget();
              }}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="t-micro text-muted-foreground">Départ</span>
            <Input
              type="time"
              aria-label="Départ"
              value={start}
              onChange={(event) => {
                setStart(event.target.value);
                resetTarget();
              }}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="t-micro text-muted-foreground">Fin</span>
            <Input
              type="time"
              aria-label="Fin"
              value={end}
              onChange={(event) => {
                setEnd(event.target.value);
                resetTarget();
              }}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="t-micro text-muted-foreground">Livreur</span>
            <FormSelect
              aria-label="Livreur"
              value={driver}
              onChange={(nextDriver) => {
                setDriver(nextDriver);
                const defaultVehicle = drivers.find((item) => item.name === nextDriver)?.vehicle;
                if (defaultVehicle && vehicles.some((item) => item.name === defaultVehicle && item.active)) {
                  setVehicle(defaultVehicle);
                }
                resetTarget();
              }}
              options={[
                { value: "", label: "Sélectionner" },
                ...drivers
                  .filter((item) => item.active || item.name === driver)
                  .map((item) => ({ value: item.name, label: item.label })),
              ]}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="t-micro text-muted-foreground">Véhicule</span>
            <FormSelect
              aria-label="Véhicule"
              value={vehicle}
              onChange={(nextVehicle) => {
                setVehicle(nextVehicle);
                resetTarget();
              }}
              options={[
                { value: "", label: "Sélectionner" },
                ...vehicles
                  .filter((item) => item.active || item.name === vehicle)
                  .map((item) => ({ value: item.name, label: item.label })),
              ]}
            />
          </label>

          {isNewAssignment ? (
            <>
              {compatible.length > 1 && (
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="t-micro text-amber-700">Tournée</span>
                  <FormSelect
                    aria-label="Tournée"
                    value={targetRouteId}
                    onChange={setTargetRouteId}
                    className="border-amber-300"
                    options={[
                      { value: "", label: "Choisir la tournée" },
                      ...compatible.map((route) => ({
                        value: route.name,
                        label: `${route.name} · ${route.stops.length} arrêt(s)`,
                      })),
                    ]}
                  />
                  <span className="t-meta text-amber-800">
                    Plusieurs tournées ont exactement le même créneau et les mêmes ressources.
                  </span>
                </label>
              )}
              <div className="rounded-md border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900 sm:col-span-2">
                <strong className="font-semibold">Première programmation</strong>
                <p className="mt-1 text-brand-800">
                  Une tournée brouillon sera créée automatiquement avec ces informations. Vous pourrez ensuite la
                  vérifier et la publier.
                </p>
              </div>
            </>
          ) : (
            <>
              {compatible.length > 0 && (
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="t-micro text-muted-foreground">Tournée existante</span>
                  <FormSelect
                    aria-label="Tournée existante"
                    value={targetRouteId}
                    onChange={setTargetRouteId}
                    options={[
                      { value: "", label: "Mettre à jour ou créer automatiquement" },
                      ...compatible.map((route) => ({
                        value: route.name,
                        label: `${route.name} · ${route.stops.length} arrêt(s) · rév. ${route.revision}`,
                      })),
                    ]}
                  />
                </label>
              )}
              <div className="rounded-md border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900 sm:col-span-2">
                <strong className="font-semibold">Reprogrammation</strong>
                <p className="mt-1 text-brand-800">
                  Si ce BL est le seul arrêt, la tournée actuelle est mise à jour (date, livreur, véhicule). Sinon, le
                  BL est déplacé vers une nouvelle tournée brouillon.
                </p>
              </div>
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="t-micro text-muted-foreground">Motif</span>
                <Textarea
                  aria-label="Motif"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Obligatoire pour une tournée publiée"
                  className="min-h-24"
                />
              </label>
            </>
          )}
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" size="lg" onClick={onClose}>
            Annuler
          </Button>
          <Button size="lg" onClick={submit} disabled={actions.saving}>
            {actions.saving ? <LoaderCircle className="animate-spin" /> : <Check />}
            {isNewAssignment ? "Enregistrer la planification" : "Enregistrer la reprogrammation"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function PlanningPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "tournees" ? "tournees" : "bl";
  const view = (searchParams.get("view") || "kanban") as "kanban" | "table";
  const kanbanDate = searchParams.get("date") || isoDateWithOffset();
  const blDate = searchParams.get("blDate") || "";
  const status = searchParams.get("status") || "";
  const selectParam = searchParams.get("select") || "";
  const [editing, setEditing] = useState<DeliveryNoteAssignment>();
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const [bulkTarget, setBulkTarget] = useState<{
    deliveryNotes: string[];
    driverId?: string;
    mode?: "existing" | "new";
  } | null>(null);
  const [bulkError, setBulkError] = useState("");
  const [deletingRoute, setDeletingRoute] = useState<DistributionRoute>();
  const [deleteFailure, setDeleteFailure] = useState("");

  const isKanban = tab === "bl" && view === "kanban";

  useEffect(() => {
    if (!selectParam) return;
    const notes = [
      ...new Set(
        selectParam
          .split(",")
          .map((value) => {
            try {
              return decodeURIComponent(value.trim());
            } catch {
              return value.trim();
            }
          })
          .filter(Boolean),
      ),
    ];
    if (!notes.length) return;
    setBulkError("");
    setBulkTarget({ deliveryNotes: notes, mode: "new" });
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("select");
        return next;
      },
      { replace: true },
    );
  }, [selectParam, setSearchParams]);

  const { data, error, isLoading, mutate } = usePlanningBoard(
    isKanban ? kanbanDate : "",
    isKanban ? kanbanDate : "",
    isKanban
      ? {
          includeBacklog: !blDate,
          ...(blDate ? { blDateFrom: blDate, blDateTo: blDate } : {}),
        }
      : { allDates: true },
  );
  const actions = useDistributionMutations();
  const board = data?.message;
  const rows = board?.assignments || [];
  const routes = board?.routes || [];
  const drivers = board?.drivers || [];
  const vehicles = board?.vehicles || [];
  const unplannedCount = rows.filter((row) => !row.route).length;
  const draftRouteCount = routes.filter((route) => route.lifecycle === "Brouillon").length;
  const description =
    tab === "tournees"
      ? "Ouvrez une tournée pour vérifier ses détails avant de la publier."
      : "Planifiez à l'avance et modifiez chaque BL sans rendre une tournée hétérogène.";

  const updateParams = (overrides: Record<string, string | undefined>) => {
    const base: Record<string, string> = {};
    const nextTab = overrides.tab ?? tab;
    if (nextTab !== "bl") base.tab = nextTab;
    const v = overrides.view ?? view;
    if (v !== "kanban") base.view = v;
    const d = overrides.date ?? kanbanDate;
    if (d !== isoDateWithOffset()) base.date = d;
    const nextBl = overrides.blDate !== undefined ? overrides.blDate : blDate;
    if (nextBl) base.blDate = nextBl;
    const nextStatus = overrides.status !== undefined ? overrides.status : status;
    if (nextStatus) base.status = nextStatus;
    setSearchParams(base);
  };

  const reprepare = async (row: DeliveryNoteAssignment) => {
    if (!row.salesOrder) return;
    setFailure("");
    try {
      const impact = await actions.getRepreparationImpact(row.salesOrder);
      if (impact.blockers.length) {
        setFailure(impact.blockers.join(" "));
        return;
      }
      const listLabel =
        impact.pickLists.length > 1 ? "listes de prélèvement seront reprises" : "liste de prélèvement sera reprise";
      if (!window.confirm(`${impact.deliveryNotes.length} BL et ${impact.pickLists.length} ${listLabel}.\nContinuer ?`)) {
        return;
      }
      const result = await actions.reprepareChangedOrder(row.salesOrder, impact.revision);
      setNotice(`Nouvelle liste de prélèvement créée : ${result.pickList}`);
      await mutate();
    } catch (mutationError) {
      setFailure(apiErrorMessage(mutationError));
    }
  };

  const handleKanbanMove = async (
    deliveryNotes: string[],
    toColumnId: string | null,
    position: number,
    _fromColumnId: string | null,
  ) => {
    setFailure("");
    const notes = [...new Set(deliveryNotes.filter(Boolean))];
    if (!notes.length) return "noop";
    const deliveryNote = notes[0];
    const assignment = rows.find((row) => row.deliveryNote === deliveryNote);
    const sourceRoute = assignment?.route ? routes.find((route) => route.name === assignment.route) : undefined;
    const targetRouteName = parseRouteColumnId(toColumnId);
    const createDriverId = parseNewRouteColumnId(toColumnId);

    try {
      if (!toColumnId) {
        if (notes.length === 1 && sourceRoute) {
          await actions.unassignDeliveryNote({
            deliveryNote,
            expectedRouteRevision: sourceRoute.revision,
          });
        }
        await mutate();
        return notes.length === 1 && sourceRoute ? "assigned" : "noop";
      }

      if (createDriverId) {
        const driver = drivers.find((item) => item.name === createDriverId);
        const vehicle =
          driver?.vehicle && vehicles.some((item) => item.name === driver.vehicle && item.active)
            ? driver.vehicle
            : "";
        if (!vehicle) {
          setBulkError("");
          setBulkTarget({ deliveryNotes: notes, driverId: createDriverId, mode: "new" });
          await mutate();
          return "dialog";
        }
        const slot = {
          plannedDate: kanbanDate,
          ...nextFreeSlot(kanbanDate, routes, createDriverId, vehicle),
          driver: createDriverId,
          vehicle,
          forceNew: true as const,
        };
        if (notes.length === 1 && sourceRoute) {
          await actions.reassignDeliveryNote({
            deliveryNote,
            ...slot,
            expectedSourceRevision: sourceRoute.revision,
          });
        } else {
          await actions.scheduleDeliveryNotes({
            deliveryNotes: notes,
            ...slot,
          });
        }
        await mutate();
        return "assigned";
      }

      const targetRoute = targetRouteName
        ? routes.find((route) => route.name === targetRouteName)
        : undefined;
      if (!targetRoute || targetRoute.lifecycle !== "Brouillon") {
        await mutate();
        return "noop";
      }

      const toDriver = targetRoute.driver ?? "";
      if (notes.length === 1 && sourceRoute) {
        await actions.reassignDeliveryNote({
          deliveryNote,
          targetRouteId: targetRoute.name,
          plannedDate: targetRoute.date,
          plannedStart: targetRoute.plannedStart ?? "",
          plannedEnd: targetRoute.plannedEnd ?? "",
          driver: toDriver,
          vehicle: targetRoute.vehicle ?? "",
          position,
          expectedSourceRevision: sourceRoute.revision,
          expectedTargetRevision: targetRoute.revision,
        });
      } else {
        await actions.scheduleDeliveryNotes({
          deliveryNotes: notes,
          targetRouteId: targetRoute.name,
          expectedTargetRevision: targetRoute.revision,
        });
      }
      await mutate();
      return "assigned";
    } catch (moveError) {
      setFailure(apiErrorMessage(moveError));
      await mutate();
      throw moveError;
    }
  };

  const handleBulkSubmit = async (payload: {
    deliveryNotes: string[];
    targetRouteId?: string;
    plannedDate?: string;
    plannedStart?: string;
    plannedEnd?: string;
    driver?: string;
    vehicle?: string;
    expectedTargetRevision?: number;
    forceNew?: boolean;
  }) => {
    setFailure("");
    setBulkError("");
    try {
      const result = await actions.scheduleDeliveryNotes(payload);
      setNotice(`${result.count} BL affecté${result.count > 1 ? "s" : ""} à ${result.route.name}.`);
      if (result.warning) setFailure(result.warning);
      setBulkTarget(null);
      if (payload.forceNew && payload.plannedDate && payload.plannedDate !== kanbanDate) {
        updateParams({ date: payload.plannedDate });
      }
      await mutate();
    } catch (bulkErrorValue) {
      const message = apiErrorMessage(bulkErrorValue);
      setBulkError(message);
      setFailure(message);
    }
  };

  const handleUnassign = async (deliveryNote: string, routeRevision: number) => {
    setFailure("");
    try {
      await actions.unassignDeliveryNote({ deliveryNote, expectedRouteRevision: routeRevision });
      setNotice(`${deliveryNote} retiré de la tournée.`);
      await mutate();
    } catch (unassignError) {
      setFailure(apiErrorMessage(unassignError));
    }
  };

  const handleDeleteDraftRoute = async () => {
    if (!deletingRoute) return;
    setFailure("");
    setDeleteFailure("");
    try {
      await actions.deleteDraftRoute(deletingRoute.name, deletingRoute.revision);
      setNotice(`${deletingRoute.name} a été supprimée.`);
      setDeletingRoute(undefined);
      await mutate();
    } catch (deleteError) {
      setDeleteFailure(apiErrorMessage(deleteError));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Exploitation multi-jours" title="Planification" description={description} />

      {(failure || error) && (
        <div role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {failure || apiErrorMessage(error)}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          <Check className="size-4 shrink-0" />
          {notice}
        </div>
      )}

      <Tabs
        value={tab}
        onValueChange={(value) => updateParams({ tab: String(value || "bl") })}
        aria-label="Sections planification"
      >
        <div className="flex items-center justify-between">
          <TabsList variant="line">
            <TabsTrigger value="bl">
              BL
              <Badge variant={unplannedCount > 0 ? "default" : "secondary"} aria-label={`${unplannedCount} non planifié${unplannedCount > 1 ? "s" : ""}`}>
                {unplannedCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="tournees">
              Tournées
              <Badge variant={draftRouteCount > 0 ? "default" : "secondary"} aria-label={`${draftRouteCount} brouillon${draftRouteCount > 1 ? "s" : ""}`}>
                {draftRouteCount}
              </Badge>
            </TabsTrigger>
          </TabsList>
          {tab === "bl" && (
            <div className="flex items-center gap-1 rounded-md border p-0.5" role="group" aria-label="Mode d'affichage">
              <Button
                variant={view === "kanban" ? "default" : "ghost"}
                size="sm"
                onClick={() => updateParams({ view: "kanban" })}
                aria-pressed={view === "kanban"}
              >
                <Columns3 className="size-4" />
                Kanban
              </Button>
              <Button
                variant={view === "table" ? "default" : "ghost"}
                size="sm"
                onClick={() => updateParams({ view: "table" })}
                aria-pressed={view === "table"}
              >
                <Table2 className="size-4" />
                Tableau
              </Button>
            </div>
          )}
        </div>
        <TabsContent value="bl" className="pt-5">
          {view === "kanban" ? (
            <PlanningKanban
              date={kanbanDate}
              onDateChange={(d: string) => updateParams({ date: d })}
              blDate={blDate}
              onBlDateChange={(d: string) => updateParams({ blDate: d })}
              assignments={rows}
              routes={routes}
              drivers={drivers}
              vehicles={vehicles}
              onMoveItem={handleKanbanMove}
              onBulkAssign={(dns: string[]) => {
                setBulkError("");
                setBulkTarget({ deliveryNotes: dns });
              }}
              onUnassign={handleUnassign}
              onReprogrammer={setEditing}
              onDeleteRoute={(route) => {
                setDeleteFailure("");
                setDeletingRoute(route);
              }}
              isLoading={isLoading}
              statusFilter={status}
              onStatusFilterChange={(value: string) => updateParams({ status: value })}
            />
          ) : (
            <DeliveryNotesBoard
              rows={rows}
              drivers={drivers}
              vehicles={vehicles}
              isLoading={isLoading}
              onEdit={setEditing}
              onReprepare={(row) => void reprepare(row)}
              statusFilter={status}
            />
          )}
        </TabsContent>
        <TabsContent value="tournees" className="pt-5">
          <RoutesBoard
            routes={routes}
            drivers={drivers}
            vehicles={vehicles}
            isLoading={isLoading}
            onDeleteRoute={(route) => {
              setDeleteFailure("");
              setDeletingRoute(route);
            }}
          />
        </TabsContent>
      </Tabs>

      {deletingRoute && (
        <DeleteDraftRouteDialog
          routeName={deletingRoute.name}
          deleting={actions.saving}
          error={deleteFailure}
          onClose={() => {
            setDeletingRoute(undefined);
            setDeleteFailure("");
          }}
          onConfirm={() => void handleDeleteDraftRoute()}
        />
      )}

      {bulkTarget && board && (
        <BulkAssignmentDialog
          deliveryNotes={bulkTarget.deliveryNotes}
          routes={routes.filter(
            (r) =>
              r.lifecycle === "Brouillon" &&
              r.date === kanbanDate &&
              (!bulkTarget.driverId || r.driver === bulkTarget.driverId),
          )}
          drivers={drivers}
          vehicles={vehicles}
          date={kanbanDate}
          initialDriver={bulkTarget.driverId}
          initialMode={bulkTarget.mode}
          submitError={bulkError}
          onSubmit={handleBulkSubmit}
          onClose={() => {
            setBulkTarget(null);
            setBulkError("");
          }}
          saving={actions.saving}
        />
      )}

      {editing && board && (
        <AssignmentEditor
          assignment={editing}
          routes={board.routes}
          drivers={board.drivers}
          vehicles={board.vehicles}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setNotice(
              editing.route
                ? `${editing.deliveryNote} réaffecté.`
                : `${editing.deliveryNote} planifié. Vérifiez la tournée brouillon puis publiez-la.`,
            );
            await mutate();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bulk Assignment Dialog                                             */
/* ------------------------------------------------------------------ */

interface BulkAssignmentDialogProps {
  deliveryNotes: string[];
  routes: DistributionRoute[];
  drivers: Array<{ name: string; label: string; active: boolean; vehicle?: string }>;
  vehicles: Array<{ name: string; label: string; active: boolean }>;
  date: string;
  initialDriver?: string;
  initialMode?: "existing" | "new";
  submitError?: string;
  onSubmit: (payload: {
    deliveryNotes: string[];
    targetRouteId?: string;
    plannedDate?: string;
    plannedStart?: string;
    plannedEnd?: string;
    driver?: string;
    vehicle?: string;
    expectedTargetRevision?: number;
    forceNew?: boolean;
  }) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}

function BulkAssignmentDialog({
  deliveryNotes,
  routes,
  drivers,
  vehicles,
  date,
  initialDriver,
  initialMode,
  submitError,
  onSubmit,
  onClose,
  saving,
}: BulkAssignmentDialogProps) {
  const [mode, setMode] = useState<"existing" | "new">(
    initialMode ?? (routes.length > 0 ? "existing" : "new"),
  );
  const [targetRouteId, setTargetRouteId] = useState(routes[0]?.name ?? "");
  const [plannedDate, setPlannedDate] = useState(date);
  const [driver, setDriver] = useState(initialDriver ?? "");
  const [vehicle, setVehicle] = useState(() => {
    const defaultVehicle = drivers.find((item) => item.name === initialDriver)?.vehicle;
    return defaultVehicle && vehicles.some((item) => item.name === defaultVehicle && item.active)
      ? defaultVehicle
      : "";
  });
  const initialSlot = nextFreeSlot(
    date,
    routes,
    initialDriver ?? "",
    drivers.find((item) => item.name === initialDriver)?.vehicle,
  );
  const [start, setStart] = useState(timePart(initialSlot.plannedStart) || "08:00");
  const [end, setEnd] = useState(timePart(initialSlot.plannedEnd) || "12:00");
  const [dialogError, setDialogError] = useState("");
  const shownError = dialogError || submitError || "";
  const today = isoDateWithOffset();
  const dateMin = plannedDate && plannedDate < today ? plannedDate : today;

  const applySlot = (nextDate: string, nextDriver: string, nextVehicle: string) => {
    const slot = nextFreeSlot(nextDate, routes, nextDriver, nextVehicle);
    setStart(timePart(slot.plannedStart) || "08:00");
    setEnd(timePart(slot.plannedEnd) || "12:00");
  };

  const submit = async () => {
    setDialogError("");
    if (mode === "existing") {
      if (!targetRouteId) {
        setDialogError("Sélectionnez une tournée.");
        return;
      }
      const target = routes.find((r) => r.name === targetRouteId);
      await onSubmit({
        deliveryNotes,
        targetRouteId,
        expectedTargetRevision: target?.revision,
      });
    } else {
      if (!plannedDate || !start || !end || !driver || !vehicle) {
        setDialogError("La date, le créneau, le livreur et le véhicule sont obligatoires.");
        return;
      }
      await onSubmit({
        deliveryNotes,
        plannedDate,
        plannedStart: `${plannedDate}T${start}:00`,
        plannedEnd: `${plannedDate}T${end}:00`,
        driver,
        vehicle,
        forceNew: true,
      });
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-label="Affectation groupée">
        <SheetHeader>
          <SheetTitle className="t-display">Affecter {deliveryNotes.length} BL</SheetTitle>
        </SheetHeader>
        <SheetBody className="grid gap-4">
          {shownError && (
            <div role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="size-4 shrink-0" />
              {shownError}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant={mode === "existing" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("existing")}
              disabled={routes.length === 0}
            >
              Tournée existante
            </Button>
            <Button
              variant={mode === "new" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("new")}
            >
              Nouvelle tournée
            </Button>
          </div>

          {mode === "existing" ? (
            <label className="flex flex-col gap-1.5">
              <span className="t-micro text-muted-foreground">Tournée brouillon</span>
              <FormSelect
                aria-label="Tournée"
                value={targetRouteId}
                onChange={setTargetRouteId}
                options={routes.map((r) => ({
                  value: r.name,
                  label: `${r.name} · ${r.driverName ?? "?"} · ${r.stops.length} arrêt(s)`,
                }))}
              />
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="t-micro text-muted-foreground">Date planifiée</span>
                <Input
                  type="date"
                  aria-label="Date planifiée"
                  min={dateMin}
                  value={plannedDate}
                  onChange={(event) => {
                    const nextDate = event.target.value;
                    setPlannedDate(nextDate);
                    applySlot(nextDate, driver, vehicle);
                  }}
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="t-micro text-muted-foreground">Départ</span>
                  <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Départ" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="t-micro text-muted-foreground">Fin</span>
                  <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Fin" />
                </label>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="t-micro text-muted-foreground">Livreur</span>
                <FormSelect
                  aria-label="Livreur"
                  value={driver}
                  onChange={(next) => {
                    setDriver(next);
                    const defaultVehicle = drivers.find((d) => d.name === next)?.vehicle;
                    const nextVehicle =
                      defaultVehicle && vehicles.some((v) => v.name === defaultVehicle && v.active)
                        ? defaultVehicle
                        : vehicle;
                    if (defaultVehicle && vehicles.some((v) => v.name === defaultVehicle && v.active)) {
                      setVehicle(defaultVehicle);
                    }
                    applySlot(plannedDate, next, nextVehicle);
                  }}
                  options={[
                    { value: "", label: "Sélectionner" },
                    ...drivers.filter((d) => d.active).map((d) => ({ value: d.name, label: d.label })),
                  ]}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="t-micro text-muted-foreground">Véhicule</span>
                <FormSelect
                  aria-label="Véhicule"
                  value={vehicle}
                  onChange={(next) => {
                    setVehicle(next);
                    applySlot(plannedDate, driver, next);
                  }}
                  options={[
                    { value: "", label: "Sélectionner" },
                    ...vehicles.filter((v) => v.active).map((v) => ({ value: v.name, label: v.label })),
                  ]}
                />
              </label>
            </>
          )}
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" size="lg" onClick={onClose}>Annuler</Button>
          <Button size="lg" onClick={submit} disabled={saving}>
            {saving ? <LoaderCircle className="animate-spin" /> : <Check />}
            Affecter
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default PlanningPage;
