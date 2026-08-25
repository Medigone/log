import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Box,
  CalendarDays,
  Check,
  Clock3,
  ExternalLink,
  Gauge,
  LoaderCircle,
  MapPin,
  Navigation,
  PackageCheck,
  Pencil,
  Printer,
  QrCode,
  RefreshCw,
  Route,
  Send,
  Truck,
  UserRound,
  Warehouse,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RouteMap } from "@/features/planning/RouteMap";
import { printRouteLabels } from "@/features/planning/qrPrinting";
import { apiErrorMessage, useDistributionMutations, useRouteDetails } from "@/shared/api/distribution";
import type {
  RouteLifecycle,
  RouteOptimizationProposal,
  RouteStop,
} from "@/shared/types/distribution";

function timePart(value?: string) {
  return value?.match(/(?:T|\s)(\d{2}:\d{2})/)?.[1] || "—";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("fr-DZ", {
    style: "currency",
    currency: "DZD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDistance(value?: number) {
  return value == null ? "—" : `${(value / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}

function formatDuration(value?: number) {
  if (value == null) return "—";
  const totalMinutes = Math.round(value / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours} h ${String(minutes).padStart(2, "0")}` : `${minutes} min`;
}

function totalDuration(value: { durationSeconds?: number; totalDurationSeconds?: number }) {
  return value.totalDurationSeconds ?? value.durationSeconds;
}

function lifecycleClass(lifecycle: RouteLifecycle) {
  if (lifecycle === "Publiée" || lifecycle === "En cours") return "bg-blue-100 text-blue-800";
  if (lifecycle === "Terminée") return "bg-emerald-100 text-emerald-800";
  if (lifecycle === "Annulée") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-700";
}

function DetailSkeleton() {
  return (
    <div className="space-y-5" aria-label="Chargement de la tournée">
      <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-200" />)}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-slate-200" />
    </div>
  );
}

function StopQr({ stop, onGenerate, generating }: { stop: RouteStop; onGenerate: () => void; generating: boolean }) {
  if (!stop.qrCode) {
    return (
      <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-center">
        <div>
          <QrCode className="mx-auto h-8 w-8 text-amber-700" />
          <p className="mt-2 text-sm font-bold text-amber-950">QR manquant</p>
          <Button size="sm" variant="outline" onClick={onGenerate} disabled={generating} className="mt-3 bg-white">
            {generating ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Générer
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
      <img src={stop.qrCode} alt={`QR du BL ${stop.deliveryNote}`} className="mx-auto h-36 w-36 object-contain" />
      <p className="mt-2 text-xs font-semibold text-slate-500">{Math.max(stop.packageCount || 1, 1)} étiquette(s)</p>
    </div>
  );
}

function OptimizationDialog({
  proposal,
  applying,
  onClose,
  onApply,
}: {
  proposal: RouteOptimizationProposal;
  applying: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  const distanceGain = proposal.current.distanceMeters - proposal.optimized.distanceMeters;
  const durationGain = (totalDuration(proposal.current) || 0) - (totalDuration(proposal.optimized) || 0);
  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950/45 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="optimization-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Proposition OpenRouteService</p>
            <h2 id="optimization-title" className="mt-1 text-xl font-bold">Comparer l’ordre des arrêts</h2>
            <p className="mt-1 text-sm text-slate-500">Aucune modification ne sera faite avant votre confirmation.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer"><X /></Button>
        </header>
        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-bold uppercase text-slate-400">Ordre actuel</p>
              <p className="mt-2 font-bold">{formatDistance(proposal.current.distanceMeters)} · {formatDuration(totalDuration(proposal.current))} au total</p>
              <p className="mt-1 text-xs text-slate-500">Conduite {formatDuration(proposal.current.durationSeconds)} + arrêts {formatDuration(proposal.current.stopDurationSeconds)}</p>
              <ol className="mt-3 space-y-1 text-sm text-slate-600">
                {proposal.currentOrder.map((name, index) => <li key={name}>{index + 1}. {name}</li>)}
              </ol>
            </article>
            <article className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-xs font-bold uppercase text-blue-700">Ordre proposé</p>
              <p className="mt-2 font-bold text-blue-950">{formatDistance(proposal.optimized.distanceMeters)} · {formatDuration(totalDuration(proposal.optimized))} au total</p>
              <p className="mt-1 text-xs text-blue-700">Conduite {formatDuration(proposal.optimized.durationSeconds)} + arrêts {formatDuration(proposal.optimized.stopDurationSeconds)}</p>
              <ol className="mt-3 space-y-1 text-sm text-blue-900">
                {proposal.optimizedOrder.map((name, index) => <li key={name}>{index + 1}. {name}</li>)}
              </ol>
            </article>
          </div>
          <div className={`rounded-xl p-4 text-sm ${distanceGain > 0 || durationGain > 0 ? "bg-emerald-50 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>
            Gain estimé : <strong>{formatDistance(Math.max(distanceGain, 0))}</strong> et <strong>{formatDuration(Math.max(durationGain, 0))}</strong>.
          </div>
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 p-5 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={applying}>Conserver l’ordre manuel</Button>
          <Button onClick={onApply} disabled={applying} className="bg-blue-700 hover:bg-blue-800">
            {applying ? <LoaderCircle className="animate-spin" /> : <Check />}Appliquer cet ordre
          </Button>
        </footer>
      </section>
    </div>
  );
}

export function RouteDetailsPage() {
  const { routeId } = useParams();
  const navigate = useNavigate();
  const { data, error, isLoading, mutate } = useRouteDetails(routeId);
  const actions = useDistributionMutations();
  const route = data?.message;
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [generatingQr, setGeneratingQr] = useState<string>();
  const [proposal, setProposal] = useState<RouteOptimizationProposal>();
  const missingGps = useMemo(() => route?.stops.filter((stop) => stop.latitude == null || stop.longitude == null) || [], [route]);
  const missingQr = useMemo(() => route?.stops.filter((stop) => !stop.qrCode) || [], [route]);

  if (isLoading) return <DetailSkeleton />;
  if (error || !route) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
        <h1 className="font-bold">Impossible d’ouvrir la tournée</h1>
        <p className="mt-2 text-sm">{apiErrorMessage(error)}</p>
        <Button variant="outline" onClick={() => navigate("/planning")} className="mt-4 bg-white"><ArrowLeft />Retour au planning</Button>
      </div>
    );
  }

  const publish = async () => {
    if (!window.confirm(`Publier la tournée ${route.name} avec ${route.stops.length} arrêt(s) ?`)) return;
    setFailure("");
    setNotice("");
    try {
      await actions.publishRoute(route.name, route.revision);
      setNotice("Tournée publiée. Le livreur devra accepter cette révision avant le départ.");
      await mutate();
    } catch (publishError) {
      setFailure(apiErrorMessage(publishError));
    }
  };

  const generateQr = async (deliveryNote: string) => {
    setGeneratingQr(deliveryNote);
    setFailure("");
    try {
      await actions.generateQrCode(deliveryNote);
      setNotice(`QR du BL ${deliveryNote} généré.`);
      await mutate();
    } catch (qrError) {
      setFailure(apiErrorMessage(qrError));
    } finally {
      setGeneratingQr(undefined);
    }
  };

  const calculateItinerary = async () => {
    setFailure("");
    setNotice("");
    try {
      await actions.calculateRouteItinerary(route.name, route.revision);
      setNotice("Itinéraire routier recalculé à partir du dépôt principal.");
      await mutate();
    } catch (routingError) {
      setFailure(apiErrorMessage(routingError));
    }
  };

  const optimize = async () => {
    setFailure("");
    setNotice("");
    try {
      setProposal(await actions.proposeRouteOptimization(route.name, route.revision));
    } catch (optimizationError) {
      setFailure(apiErrorMessage(optimizationError));
    }
  };

  const applyOptimization = async () => {
    if (!proposal) return;
    setFailure("");
    try {
      const updated = await actions.applyRouteOptimization(route.name, proposal.optimizedOrder, proposal.revision);
      setProposal(undefined);
      try {
        await actions.calculateRouteItinerary(updated.name, updated.revision);
        setNotice("Ordre optimisé appliqué et itinéraire recalculé.");
      } catch (routingError) {
        setNotice("Ordre optimisé appliqué. Le tracé routier devra être recalculé.");
        setFailure(apiErrorMessage(routingError));
      }
      await mutate();
    } catch (optimizationError) {
      setFailure(apiErrorMessage(optimizationError));
    }
  };

  const capacityTone = route.vehicleCapacity != null && route.totalQuantity > route.vehicleCapacity ? "text-red-700" : "text-slate-950";
  const operationalAlerts = [
    ...route.alerts,
    ...(route.vehicle && route.vehicleCapacity == null ? ["La capacité maximale du véhicule n’est pas définie."] : []),
    ...(!route.depot ? ["Aucun dépôt principal exploitable n’est configuré."] : []),
    ...(missingGps.length ? [`${missingGps.length} arrêt(s) sans coordonnées GPS.`] : []),
    ...(missingQr.length ? [`${missingQr.length} bon(s) sans QR imprimable.`] : []),
  ];
  const canRoute = Boolean(route.depot && route.stops.length && !missingGps.length);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <button type="button" onClick={() => navigate("/planning")} className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-blue-800"><ArrowLeft className="h-4 w-4" />Planification</button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{route.name}</h1>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${lifecycleClass(route.lifecycle)}`}>{route.lifecycle}</span>
            <span className="text-xs font-semibold text-slate-500">Révision {route.revision}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Contrôlez les ressources, l’itinéraire et les étiquettes avant publication.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/planning")}><Pencil />Modifier le planning</Button>
          <Button variant="outline" onClick={() => printRouteLabels(route)} disabled={route.stops.every((stop) => !stop.qrCode)}><Printer />Imprimer les QR</Button>
          {route.lifecycle === "Brouillon" && <Button onClick={() => void publish()} disabled={actions.saving} className="bg-blue-700 hover:bg-blue-800">{actions.saving ? <LoaderCircle className="animate-spin" /> : <Send />}Publier la tournée</Button>}
        </div>
      </header>

      {failure && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="h-4 w-4 shrink-0" />{failure}</div>}
      {notice && <div role="status" className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><Check className="h-4 w-4 shrink-0" />{notice}</div>}
      {operationalAlerts.length > 0 && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h2 className="flex items-center gap-2 text-sm font-bold text-amber-950"><AlertTriangle className="h-4 w-4" />Points à vérifier</h2><ul className="mt-2 space-y-1 text-sm text-amber-900">{operationalAlerts.map((alert) => <li key={alert}>• {alert}</li>)}</ul></section>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-4"><CalendarDays className="h-5 w-5 text-blue-700" /><p className="mt-3 text-[11px] font-bold uppercase text-slate-400">Date et créneau</p><p className="mt-1 font-bold">{route.date}</p><p className="text-sm text-slate-500"><Clock3 className="mr-1 inline h-3.5 w-3.5" />{timePart(route.plannedStart)}–{timePart(route.plannedEnd)}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-4"><UserRound className="h-5 w-5 text-blue-700" /><p className="mt-3 text-[11px] font-bold uppercase text-slate-400">Livreur</p><p className="mt-1 font-bold">{route.driverName || "Non affecté"}</p><p className="truncate text-sm text-slate-500">{route.driver || "—"}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-4"><Truck className="h-5 w-5 text-blue-700" /><p className="mt-3 text-[11px] font-bold uppercase text-slate-400">Véhicule</p><p className="mt-1 font-bold">{route.vehicleLabel || route.vehicle || "Non affecté"}</p><p className={`text-sm ${capacityTone}`}>{route.vehicleCapacity == null ? `${route.totalQuantity} articles · capacité non définie` : `${route.totalQuantity} / ${route.vehicleCapacity} articles`}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-4"><Banknote className="h-5 w-5 text-blue-700" /><p className="mt-3 text-[11px] font-bold uppercase text-slate-400">Chargement</p><p className="mt-1 font-bold">{route.stops.length} arrêt(s)</p><p className="text-sm text-slate-500">{formatCurrency(route.totalAmount)} à encaisser</p></article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-bold">Itinéraire de la tournée</h2>
            <p className="text-sm text-slate-500">Boucle dépôt–clients–dépôt suivant l’ordre officiel des arrêts.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void calculateItinerary()} disabled={!canRoute || actions.routing}><RefreshCw className={actions.routing ? "animate-spin" : ""} />Recalculer l’itinéraire</Button>
            {route.routing.optimizationEnabled && route.lifecycle === "Brouillon" && <Button onClick={() => void optimize()} disabled={!canRoute || actions.routing} className="bg-blue-700 hover:bg-blue-800"><Route />Optimiser l’ordre</Button>}
          </div>
        </div>
        <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-bold uppercase text-slate-400">Dépôt</p><p className="mt-1 truncate text-sm font-bold"><Warehouse className="mr-1 inline h-4 w-4 text-blue-700" />{route.depot?.label || "Non configuré"}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-bold uppercase text-slate-400">Distance routière</p><p className="mt-1 text-sm font-bold"><Navigation className="mr-1 inline h-4 w-4 text-blue-700" />{formatDistance(route.routing.distanceMeters)}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-bold uppercase text-slate-400">Temps de conduite</p><p className="mt-1 text-sm font-bold"><Navigation className="mr-1 inline h-4 w-4 text-blue-700" />{formatDuration(route.routing.durationSeconds)}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-bold uppercase text-slate-400">Temps aux arrêts</p><p className="mt-1 text-sm font-bold"><Clock3 className="mr-1 inline h-4 w-4 text-blue-700" />{formatDuration(route.routing.stopDurationSeconds)}</p><p className="mt-0.5 text-xs text-slate-500">{route.routing.stopDurationMinutes ?? 0} min × {route.stops.length}</p></div>
          <div className="rounded-xl bg-blue-50 p-3"><p className="text-[11px] font-bold uppercase text-blue-600">Durée totale estimée</p><p className="mt-1 text-sm font-bold text-blue-950"><Gauge className="mr-1 inline h-4 w-4 text-blue-700" />{formatDuration(route.routing.totalDurationSeconds)}</p></div>
        </div>
        {route.routing.status !== "ready" && <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">Aucun tracé routier à jour. Les marqueurs restent visibles sans ligne droite; utilisez « Recalculer l’itinéraire ».</div>}
        <RouteMap stops={route.stops} depot={route.depot} routing={route.routing} />
        <p className="mt-2 text-xs text-slate-400">{route.routing.calculatedAt ? `Dernier calcul : ${route.routing.calculatedAt}` : `${route.stops.length - missingGps.length}/${route.stops.length} arrêts localisés`}</p>
      </section>

      <section className="space-y-3">
        <div><h2 className="text-lg font-bold">Arrêts et bons de livraison</h2><p className="text-sm text-slate-500">Vérifiez les quantités, l’adresse et le QR de chaque BL.</p></div>
        {route.stops.map((stop) => (
          <article key={stop.deliveryNote} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="grid gap-4 p-4 lg:grid-cols-[auto_minmax(0,1fr)_180px]">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-blue-100 font-bold text-blue-800">{stop.sequence}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold text-slate-950">{stop.customerName}</h3><p className="text-sm font-semibold text-blue-800">{stop.deliveryNote}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{stop.status}</span></div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><p className="text-slate-600"><MapPin className="mr-1 inline h-4 w-4" />{stop.address || [stop.commune, stop.wilaya].filter(Boolean).join(", ") || "Adresse non renseignée"}</p><p className="text-slate-600"><PackageCheck className="mr-1 inline h-4 w-4" />{stop.totalQuantity} article(s) · {Math.max(stop.packageCount || 1, 1)} paquet(s)</p></div>
                {stop.latitude != null && stop.longitude != null && <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-800">Ouvrir la navigation<ExternalLink className="h-3.5 w-3.5" /></a>}
                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200"><div className="grid grid-cols-[minmax(0,1fr)_80px_80px] bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase text-slate-500"><span>Article</span><span>Prévu</span><span>Restant</span></div>{stop.items?.map((item) => <div key={item.name} className="grid grid-cols-[minmax(0,1fr)_80px_80px] border-t border-slate-100 px-3 py-2 text-sm"><span className="truncate"><strong>{item.itemCode}</strong><span className="ml-1 text-slate-500">{item.itemName}</span></span><span>{item.quantity}</span><span className="font-bold">{item.remainingQuantity}</span></div>)}</div>
              </div>
              <div className="space-y-2"><StopQr stop={stop} generating={generatingQr === stop.deliveryNote} onGenerate={() => void generateQr(stop.deliveryNote)} />{stop.qrCode && <Button variant="outline" size="sm" onClick={() => printRouteLabels(route, [stop])} className="w-full"><Printer />Imprimer ce QR</Button>}</div>
            </div>
          </article>
        ))}
        {!route.stops.length && <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white text-center"><div><Box className="mx-auto h-9 w-9 text-slate-400" /><p className="mt-3 font-bold">Aucun arrêt</p><p className="text-sm text-slate-500">Revenez au planning pour affecter des BL.</p></div></div>}
      </section>
      {proposal && <OptimizationDialog proposal={proposal} applying={actions.routing} onClose={() => setProposal(undefined)} onApply={() => void applyOptimization()} />}
    </div>
  );
}
