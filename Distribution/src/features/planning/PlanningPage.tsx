import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarDays, CalendarPlus, Check, Eye, Filter, LoaderCircle, Pencil, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage, useDistributionMutations, usePlanningBoard } from "@/shared/api/distribution";
import type { AssignmentChange, DeliveryNoteAssignment, DistributionRoute, PlanningFilters, PlanningStatus } from "@/shared/types/distribution";

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function localDate(offset = 0) { const date = new Date(); date.setDate(date.getDate() + offset); return formatDate(date); }
function timePart(value?: string) { return value?.match(/(?:T|\s)(\d{2}:\d{2})/)?.[1] || ""; }
function statusClass(status: PlanningStatus) {
  if (["À revalider", "À repréparer", "Exception"].includes(status)) return "bg-amber-100 text-amber-800";
  if (["Publié", "En cours"].includes(status)) return "bg-blue-100 text-blue-800";
  if (status === "Terminé") return "bg-emerald-100 text-emerald-800";
  return "bg-slate-100 text-slate-700";
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
  const [date, setDate] = useState(assignment.plannedDate || localDate());
  const [start, setStart] = useState(timePart(assignment.plannedStart) || "08:00");
  const [end, setEnd] = useState(timePart(assignment.plannedEnd) || "12:00");
  const [driver, setDriver] = useState(assignment.driver || "");
  const [vehicle, setVehicle] = useState(assignment.vehicle || "");
  const [targetRouteId, setTargetRouteId] = useState(assignment.route || "");
  const [position, setPosition] = useState(String(assignment.sequence || 1));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const actions = useDistributionMutations();
  const compatible = routes.filter((route) => !["En cours", "Terminée", "Annulée"].includes(route.lifecycle)
    && route.date === date && route.driver === driver && route.vehicle === vehicle
    && timePart(route.plannedStart) === start && timePart(route.plannedEnd) === end);

  useEffect(() => {
    if (targetRouteId && !compatible.some((route) => route.name === targetRouteId)) setTargetRouteId("");
  }, [compatible, targetRouteId]);

  const submit = async () => {
    if (!date || !start || !end || !driver || !vehicle) { setError("La date, le créneau, le livreur et le véhicule sont obligatoires."); return; }
    const target = compatible.find((route) => route.name === targetRouteId);
    if (!isNewAssignment && (source?.lifecycle === "Publiée" || target?.lifecycle === "Publiée") && !reason.trim()) { setError("Le motif est obligatoire lorsqu’une tournée publiée est modifiée."); return; }
    if (compatible.length > 1 && !targetRouteId) { setError("Plusieurs tournées compatibles existent : choisissez la destination."); return; }
    const payload: AssignmentChange = {
      deliveryNote: assignment.deliveryNote,
      targetRouteId: target?.name,
      plannedDate: date,
      plannedStart: `${date}T${start}:00`, plannedEnd: `${date}T${end}:00`,
      driver, vehicle, position: isNewAssignment ? 1 : Math.max(Number(position) || 1, 1), reason: isNewAssignment ? undefined : reason.trim() || undefined,
      expectedSourceRevision: source?.revision,
      expectedTargetRevision: target && target.name !== source?.name ? target.revision : undefined,
    };
    setError("");
    try {
      if (isNewAssignment) await actions.scheduleDeliveryNote(payload);
      else await actions.reassignDeliveryNote(payload);
      await onSaved();
      onClose();
    }
    catch (mutationError) { setError(apiErrorMessage(mutationError)); }
  };

  const resetTarget = () => setTargetRouteId("");
  return <div className="fixed inset-0 z-50 bg-slate-950/40" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside role="dialog" aria-modal="true" aria-label={`${isNewAssignment ? "Planifier la livraison" : "Modifier l’affectation"} ${assignment.deliveryNote}`} className="ml-auto flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl">
      <header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white p-5"><div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">{isNewAssignment ? "Planifier la livraison" : "Modifier l’affectation"}</p><h2 className="mt-1 text-xl font-bold">{assignment.deliveryNote}</h2><p className="mt-1 text-sm text-slate-500">{assignment.customerName}</p></div><button onClick={onClose} aria-label="Fermer" className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100"><X className="h-5 w-5" /></button></header>
      <div className="grid flex-1 gap-4 p-5 sm:grid-cols-2">
        {error && <div role="alert" className="sm:col-span-2 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
        <label className={`text-sm font-bold ${isNewAssignment ? "sm:col-span-2" : ""}`}>Date planifiée<Input type="date" min={localDate()} value={date} onChange={(event) => { setDate(event.target.value); resetTarget(); }} className="mt-2 h-11" /></label>
        {!isNewAssignment && <label className="text-sm font-bold">Position<Input type="number" min="1" value={position} onChange={(event) => setPosition(event.target.value)} className="mt-2 h-11" /></label>}
        <label className="text-sm font-bold">Départ<Input type="time" value={start} onChange={(event) => { setStart(event.target.value); resetTarget(); }} className="mt-2 h-11" /></label>
        <label className="text-sm font-bold">Fin<Input type="time" value={end} onChange={(event) => { setEnd(event.target.value); resetTarget(); }} className="mt-2 h-11" /></label>
        <label className="text-sm font-bold">Livreur<select value={driver} onChange={(event) => { const nextDriver = event.target.value; setDriver(nextDriver); const defaultVehicle = drivers.find((item) => item.name === nextDriver)?.vehicle; if (defaultVehicle && vehicles.some((item) => item.name === defaultVehicle && item.active)) setVehicle(defaultVehicle); resetTarget(); }} className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3"><option value="">Sélectionner</option>{drivers.filter((item) => item.active || item.name === driver).map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}</select></label>
        <label className="text-sm font-bold">Véhicule<select value={vehicle} onChange={(event) => { setVehicle(event.target.value); resetTarget(); }} className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3"><option value="">Sélectionner</option>{vehicles.filter((item) => item.active || item.name === vehicle).map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}</select></label>
        {isNewAssignment ? <>
          {compatible.length > 1 && <label className="sm:col-span-2 text-sm font-bold">Tournée<select value={targetRouteId} onChange={(event) => setTargetRouteId(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-amber-300 bg-white px-3"><option value="">Choisir la tournée</option>{compatible.map((route) => <option key={route.name} value={route.name}>{route.name} · {route.stops.length} arrêt(s)</option>)}</select><span className="mt-1 block text-xs font-normal text-amber-800">Plusieurs tournées ont exactement le même créneau et les mêmes ressources.</span></label>}
          <div className="sm:col-span-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><strong>Première programmation</strong><p className="mt-1 text-blue-800">Une tournée brouillon sera créée automatiquement avec ces informations. Vous pourrez ensuite la vérifier et la publier.</p></div>
        </> : <>
          <label className="sm:col-span-2 text-sm font-bold">Tournée compatible<select value={targetRouteId} onChange={(event) => setTargetRouteId(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3"><option value="">Créer automatiquement une tournée brouillon</option>{compatible.map((route) => <option key={route.name} value={route.name}>{route.name} · {route.stops.length} arrêt(s) · rév. {route.revision}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">Si plusieurs tournées correspondent, choisissez explicitement la destination.</span></label>
          <label className="sm:col-span-2 text-sm font-bold">Motif<Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Obligatoire pour une tournée publiée" className="mt-2 min-h-24" /></label>
        </>}
      </div>
      <footer className="sticky bottom-0 flex gap-3 border-t border-slate-200 bg-white p-5"><Button variant="outline" onClick={onClose} className="h-12 flex-1">Annuler</Button><Button onClick={submit} disabled={actions.saving} className="h-12 flex-[2] bg-blue-700 hover:bg-blue-800">{actions.saving ? <LoaderCircle className="animate-spin" /> : <Check />}{isNewAssignment ? "Enregistrer la planification" : "Enregistrer l’affectation"}</Button></footer>
    </aside>
  </div>;
}

export function PlanningPage() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(localDate());
  const [dateTo, setDateTo] = useState(localDate(6));
  const [filters, setFilters] = useState<PlanningFilters>({});
  const [editing, setEditing] = useState<DeliveryNoteAssignment>();
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const { data, error, isLoading, mutate } = usePlanningBoard(dateFrom, dateTo, filters);
  const actions = useDistributionMutations();
  const board = data?.message;
  const rows = useMemo(() => board?.assignments || [], [board?.assignments]);
  const summary = useMemo(() => ({ total: rows.length, unplanned: rows.filter((row) => !row.route).length, invalid: rows.filter((row) => ["À revalider", "À repréparer", "Exception"].includes(row.planningStatus)).length, published: board?.routes.filter((route) => ["Publiée", "En cours"].includes(route.lifecycle)).length || 0 }), [board?.routes, rows]);

  const reprepare = async (row: DeliveryNoteAssignment) => {
    if (!row.salesOrder) return;
    setFailure("");
    try {
      const impact = await actions.getRepreparationImpact(row.salesOrder);
      if (impact.blockers.length) { setFailure(impact.blockers.join(" ")); return; }
      if (!window.confirm(`${impact.deliveryNotes.length} BL et ${impact.pickLists.length} ${impact.pickLists.length > 1 ? "listes de prélèvement seront reprises" : "liste de prélèvement sera reprise"}.\nContinuer ?`)) return;
      const result = await actions.reprepareChangedOrder(row.salesOrder, impact.revision);
      setNotice(`Nouvelle liste de prélèvement créée : ${result.pickList}`); await mutate();
    } catch (mutationError) { setFailure(apiErrorMessage(mutationError)); }
  };

  return <div className="space-y-5">
    <header><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Exploitation multi-jours</p><h1 className="mt-1 text-2xl font-bold tracking-tight">Planification des BL</h1><p className="mt-1 text-sm text-slate-500">Planifiez à l’avance et modifiez chaque BL sans rendre une tournée hétérogène.</p></header>
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["BL affichés", summary.total], ["Non planifiés", summary.unplanned], ["À traiter", summary.invalid], ["Tournées actives", summary.published]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-0.5 text-xl font-bold">{value}</p></div>)}</section>
    <section className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3"><div className="flex items-start gap-3"><CalendarPlus className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" /><div><h2 className="text-sm font-bold text-blue-950">Comment planifier une livraison ?</h2><p className="mt-1 text-sm leading-5 text-blue-800"><strong>1.</strong> Cliquez sur « Planifier » pour un BL. <strong>2.</strong> Choisissez la date, le créneau, le livreur et le véhicule. <strong>3.</strong> Ouvrez « Vérifier » pour contrôler la carte, les arrêts et les QR avant publication.</p></div></div></section>
    {(failure || error) && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="h-4 w-4 shrink-0" />{failure || apiErrorMessage(error)}</div>}
    {notice && <div role="status" className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><Check className="h-4 w-4" />{notice}</div>}
    <section className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-2 text-sm font-bold"><Filter className="h-4 w-4 text-blue-700" />Filtres</div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8"><label className="text-[11px] font-bold text-slate-500">Du<Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 h-8 px-2 text-xs" /></label><label className="text-[11px] font-bold text-slate-500">Au<Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-1 h-8 px-2 text-xs" /></label><label className="text-[11px] font-bold text-slate-500 sm:col-span-2">Recherche<Input aria-label="Recherche" value={filters.search || ""} onChange={(event) => setFilters((value) => ({ ...value, search: event.target.value }))} placeholder="BL, client, commune…" className="mt-1 h-8 text-xs" /></label><label className="text-[11px] font-bold text-slate-500">Statut<select aria-label="Statut" value={filters.status || ""} onChange={(event) => setFilters((value) => ({ ...value, status: event.target.value as PlanningStatus | "" }))} className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"><option value="">Tous</option>{["Non planifié", "Planifié", "Publié", "À revalider", "À repréparer", "En cours", "Terminé", "Exception"].map((status) => <option key={status}>{status}</option>)}</select></label><label className="text-[11px] font-bold text-slate-500">Livreur<select aria-label="Livreur" value={filters.driver || ""} onChange={(event) => setFilters((value) => ({ ...value, driver: event.target.value }))} className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"><option value="">Tous</option>{board?.drivers.map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}</select></label><label className="text-[11px] font-bold text-slate-500">Véhicule<select aria-label="Véhicule" value={filters.vehicle || ""} onChange={(event) => setFilters((value) => ({ ...value, vehicle: event.target.value }))} className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"><option value="">Tous</option>{board?.vehicles.map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}</select></label><label className="mt-4 flex h-8 items-center gap-2 rounded-md border border-slate-200 px-2 text-xs font-semibold"><input type="checkbox" checked={Boolean(filters.alertsOnly)} onChange={(event) => setFilters((value) => ({ ...value, alertsOnly: event.target.checked }))} />Alertes seules</label></div></section>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2"><h2 className="text-sm font-bold text-slate-800">Bons de livraison</h2><span className="text-xs text-slate-500">{rows.length} résultat{rows.length > 1 ? "s" : ""}</span></div>{isLoading ? <div className="grid min-h-64 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-blue-700" /></div> : rows.length ? <ul className="divide-y divide-slate-100">{rows.map((row) => { const driverLabel = board?.drivers.find((item) => item.name === row.driver)?.label; const vehicleLabel = board?.vehicles.find((item) => item.name === row.vehicle)?.label; const isUnplanned = !row.route; return <li key={row.deliveryNote} className="p-3 hover:bg-blue-50/30"><div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.15fr)_auto] lg:items-center"><div className="min-w-0"><p className="truncate text-sm font-bold text-blue-800">{row.deliveryNote}</p><p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{row.customerName}</p><p className="truncate text-xs text-slate-500">{row.wilaya || row.commune || "Localisation non renseignée"} · {row.totalQuantity} article(s) restant(s)</p></div><div className="grid grid-cols-2 gap-2 text-xs"><div><span className="block text-[10px] font-bold uppercase text-slate-400">Demandée</span><strong className="text-slate-700">{row.requestedDate || "—"}</strong></div><div><span className="block text-[10px] font-bold uppercase text-slate-400">Planifiée</span><strong className="text-slate-700">{row.plannedDate || "—"}</strong></div></div><div className="min-w-0 text-xs"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 font-bold ${statusClass(row.planningStatus)}`}>{row.planningStatus}</span>{row.route && <span className="truncate font-semibold text-slate-700">{row.route} · rév. {row.routeRevision}</span>}</div><p className="mt-1 truncate text-slate-500">{row.route ? `${timePart(row.plannedStart) || "—"}–${timePart(row.plannedEnd) || "—"} · ${driverLabel || "Livreur manquant"} · ${vehicleLabel || "Véhicule manquant"}` : "Aucune tournée affectée"}</p>{row.planningAlert && <p className="mt-1 line-clamp-2 text-amber-800">{row.planningAlert}</p>}</div><div className="flex shrink-0 flex-wrap gap-2 lg:justify-end"><Button size="sm" variant={isUnplanned ? "default" : "outline"} onClick={() => setEditing(row)} disabled={["En cours", "Terminé", "Exception"].includes(row.planningStatus)}>{isUnplanned ? <CalendarPlus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}{isUnplanned ? "Planifier" : "Modifier"}</Button>{row.planningStatus === "À repréparer" && <Button size="sm" onClick={() => void reprepare(row)}><RefreshCw className="h-4 w-4" />Reprendre</Button>}</div></div></li>; })}</ul> : <div className="grid min-h-56 place-items-center text-center"><div><CalendarDays className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-3 font-bold">Aucun BL dans cette plage</p><p className="mt-1 text-sm text-slate-500">Élargissez les dates ou retirez certains filtres.</p></div></div>}</section>
    <section className="space-y-3"><div><h2 className="text-lg font-bold">Tournées de la période</h2><p className="text-sm text-slate-500">Ouvrez une tournée pour vérifier ses détails avant de la publier.</p></div><div className="grid gap-3 lg:grid-cols-2">{board?.routes.map((route) => <article key={route.name} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{route.name}</h3><p className="mt-1 text-sm text-slate-500">{route.date} · {timePart(route.plannedStart) || "créneau manquant"}–{timePart(route.plannedEnd) || "—"} · {route.stops.length} arrêt(s)</p><p className="mt-1 text-xs text-slate-500">Révision {route.revision}{route.acknowledged ? " · acceptée" : route.lifecycle === "Publiée" ? " · acceptation requise" : ""}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{route.lifecycle}</span></div>{(route.alerts.length > 0 || route.needsReview) && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{[route.reviewReason, ...route.alerts].filter(Boolean).join(" ")}</div>}<div className="mt-4 flex justify-end"><Button size="sm" variant={route.lifecycle === "Brouillon" ? "default" : "outline"} onClick={() => navigate(`/planning/routes/${route.name}`)}><Eye className="h-4 w-4" />{route.lifecycle === "Brouillon" ? "Vérifier avant publication" : "Ouvrir"}</Button></div></article>)}</div></section>
    {editing && board && <AssignmentEditor assignment={editing} routes={board.routes} drivers={board.drivers} vehicles={board.vehicles} onClose={() => setEditing(undefined)} onSaved={async () => { setNotice(editing.route ? `${editing.deliveryNote} réaffecté.` : `${editing.deliveryNote} planifié. Vérifiez la tournée brouillon puis publiez-la.`); await mutate(); }} />}
  </div>;
}
