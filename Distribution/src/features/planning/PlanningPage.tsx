import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  CalendarPlus,
  Check,
  Eye,
  LoaderCircle,
  LocateFixed,
  Pencil,
  RefreshCw,
  Search,
} from "lucide-react";
import { FilterSelect, FormSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader } from "@/components/ui/page-header";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toolbar } from "@/components/ui/toolbar";
import { apiErrorMessage, useDistributionMutations, usePlanningBoard } from "@/shared/api/distribution";
import { planningStatusTone, routeLifecycleTone } from "@/shared/design/statusTone";
import type {
  AssignmentChange,
  DeliveryNoteAssignment,
  DistributionRoute,
  PlanningFilters,
  PlanningStatus,
} from "@/shared/types/distribution";

const PLANNING_STATUSES: PlanningStatus[] = [
  "Non planifié",
  "Planifié",
  "Publié",
  "En retard",
  "À revalider",
  "À repréparer",
  "En cours",
  "Terminé",
  "Exception",
];

const LOCKED_STATUSES = ["En cours", "Terminé", "Exception"];

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return formatDate(date);
}

function timePart(value?: string) {
  return value?.match(/(?:T|\s)(\d{2}:\d{2})/)?.[1] || "";
}

function defaultPlannedDate(assignment: DeliveryNoteAssignment) {
  const planned = assignment.plannedDate || assignment.requestedDate || "";
  const today = localDate();
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
      setError("Le motif est obligatoire lorsqu’une tournée publiée est reprogrammée.");
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
  const dateMin = date && date < localDate() ? date : localDate();

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
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filters, setFilters] = useState<PlanningFilters>({});
  const [editing, setEditing] = useState<DeliveryNoteAssignment>();
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const boardFilters = useMemo(
    () => (!dateFrom && !dateTo ? { ...filters, allDates: true } : filters),
    [dateFrom, dateTo, filters],
  );
  const { data, error, isLoading, mutate } = usePlanningBoard(dateFrom, dateTo, boardFilters);
  const actions = useDistributionMutations();
  const board = data?.message;
  const rows = useMemo(() => board?.assignments || [], [board?.assignments]);
  const summary = useMemo(
    () => ({
      total: rows.length,
      unplanned: rows.filter((row) => !row.route).length,
      invalid: rows.filter((row) => ["À revalider", "À repréparer", "Exception", "En retard"].includes(row.planningStatus)).length,
      published: board?.routes.filter((route) => ["Publiée", "En cours"].includes(route.lifecycle)).length || 0,
    }),
    [board?.routes, rows],
  );

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

  const driverLabel = (name?: string) => board?.drivers.find((item) => item.name === name)?.label;
  const vehicleLabel = (name?: string) => board?.vehicles.find((item) => item.name === name)?.label;

  const columns: Array<DataTableColumn<DeliveryNoteAssignment>> = [
    {
      id: "deliveryNote",
      header: "N° BL",
      width: "minmax(0, 1.1fr)",
      sortValue: (row) => row.deliveryNote,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-brand-700">{row.deliveryNote}</p>
          <p className="truncate t-meta text-muted-foreground">
            {row.totalQuantity} article(s) restant(s)
          </p>
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
          <p className="truncate t-meta text-muted-foreground">
            {row.wilaya || row.commune || "Localisation non renseignée"}
          </p>
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
      header: <span className="sr-only">Actions</span>,
      width: "180px",
      align: "right",
      cell: (row) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant={row.route ? "outline" : "default"}
            onClick={() => setEditing(row)}
            disabled={LOCKED_STATUSES.includes(row.planningStatus)}
          >
            {row.route ? <Pencil /> : <CalendarPlus />}
            {row.route ? "Reprogrammer" : "Planifier"}
          </Button>
          {row.planningStatus === "À repréparer" && (
            <Button size="sm" onClick={() => void reprepare(row)}>
              <RefreshCw />
              Reprendre
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Exploitation multi-jours"
        title="Planification des BL"
        description="Planifiez à l’avance et modifiez chaque BL sans rendre une tournée hétérogène."
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="BL affichés" value={summary.total} />
        <KpiTile label="Non planifiés" value={summary.unplanned} tone={summary.unplanned ? "info" : "neutral"} />
        <KpiTile label="À traiter" value={summary.invalid} tone={summary.invalid ? "warning" : "neutral"} />
        <KpiTile label="Tournées actives" value={summary.published} />
      </section>

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

      <Toolbar>
        <InputGroup className="w-36 bg-background">
          <InputGroupAddon>
            <span className="text-muted-foreground">Du</span>
          </InputGroupAddon>
          <InputGroupInput type="date" aria-label="Du" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </InputGroup>
        <InputGroup className="w-36 bg-background">
          <InputGroupAddon>
            <span className="text-muted-foreground">Au</span>
          </InputGroupAddon>
          <InputGroupInput type="date" aria-label="Au" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </InputGroup>
        <InputGroup className="min-w-48 flex-1 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Recherche"
            value={filters.search || ""}
            onChange={(event) => setFilters((value) => ({ ...value, search: event.target.value }))}
            placeholder="BL, client, commune…"
          />
        </InputGroup>
        <FilterSelect
          label="Statut"
          value={filters.status || "all"}
          onChange={(status) => setFilters((value) => ({ ...value, status: status === "all" ? "" : (status as PlanningStatus) }))}
          options={[{ value: "all", label: "Tous" }, ...PLANNING_STATUSES.map((status) => ({ value: status, label: status }))]}
        />
        <FilterSelect
          label="Livreur"
          value={filters.driver || "all"}
          onChange={(driver) => setFilters((value) => ({ ...value, driver: driver === "all" ? "" : driver }))}
          options={[{ value: "all", label: "Tous" }, ...(board?.drivers.map((item) => ({ value: item.name, label: item.label })) || [])]}
        />
        <FilterSelect
          label="Véhicule"
          value={filters.vehicle || "all"}
          onChange={(vehicle) => setFilters((value) => ({ ...value, vehicle: vehicle === "all" ? "" : vehicle }))}
          options={[{ value: "all", label: "Tous" }, ...(board?.vehicles.map((item) => ({ value: item.name, label: item.label })) || [])]}
        />
        <label className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border bg-background px-2.5 text-sm font-medium">
          <input
            type="checkbox"
            checked={Boolean(filters.alertsOnly)}
            onChange={(event) => setFilters((value) => ({ ...value, alertsOnly: event.target.checked }))}
            className="size-4 accent-primary"
          />
          Alertes seules
        </label>
      </Toolbar>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="t-section">Bons de livraison</h2>
          <span className="num t-meta text-muted-foreground">
            {rows.length} résultat{rows.length > 1 ? "s" : ""}
          </span>
        </div>
        <DataTable
          label="Bons de livraison à planifier"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.deliveryNote}
          rowTone={(row) => planningStatusTone(row.planningStatus)}
          isLoading={isLoading}
          maxHeight="max-h-[60vh]"
          empty={
            <EmptyState
              icon={CalendarDays}
              title="Aucun BL à afficher"
              description="Aucun bon ne correspond aux filtres actuels."
            />
          }
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="t-section">{dateFrom || dateTo ? "Tournées de la période" : "Tournées"}</h2>
          <p className="t-body text-muted-foreground">
            Ouvrez une tournée pour vérifier ses détails avant de la publier.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {board?.routes.map((route) => (
            <Card key={route.name}>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle>{route.name}</CardTitle>
                  <p className="mt-1 t-meta text-muted-foreground">
                    {route.date} · {timePart(route.plannedStart) || "créneau manquant"}–
                    {timePart(route.plannedEnd) || "—"} · {route.stops.length} arrêt(s)
                  </p>
                  <p className="t-meta text-muted-foreground">
                    Révision {route.revision}
                    {route.acknowledged
                      ? " · acceptée"
                      : route.lifecycle === "Publiée"
                        ? " · acceptation requise"
                        : ""}
                  </p>
                </div>
                <StatusBadge tone={routeLifecycleTone(route.lifecycle)} size="sm">
                  {route.lifecycle}
                </StatusBadge>
              </CardHeader>
              <CardContent>
                {(route.alerts.length > 0 || route.needsReview) && (
                  <div className="rounded-md bg-amber-50 p-3 t-meta text-amber-900">
                    {[route.reviewReason, ...route.alerts].filter(Boolean).join(" ")}
                  </div>
                )}
                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    variant={route.lifecycle === "Brouillon" ? "default" : "outline"}
                    onClick={() => navigate(`/planning/routes/${route.name}`)}
                  >
                    <Eye />
                    {route.lifecycle === "Brouillon" ? "Vérifier avant publication" : "Ouvrir"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

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
    </>
  );
}
