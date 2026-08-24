import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrappeAuth } from "frappe-react-sdk";
import {
  Activity,
  AlertTriangle,
  Camera,
  Check,
  ChevronRight,
  CircleDollarSign,
  LoaderCircle,
  LocateFixed,
  LogOut,
  MapPin,
  Navigation,
  Phone,
  Play,
  RefreshCw,
  Route,
  ScanLine,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage, useDistributionMutations, useDriverRoutes } from "@/shared/api/distribution";
import { confirmOperation, markOperationAttempt, queueOperation, readPendingOperations } from "@/shared/persistence/pendingOperations";
import type { DeliveryOutcome, EvidenceInput, PaymentInput, RouteStop, StopCompletionPayload } from "@/shared/types/distribution";
import { SignaturePad } from "@/features/driver/SignaturePad";
import { validateStopForm } from "@/features/driver/validation";

type DriverTab = "route" | "scanner" | "activity";

const FAILURE_REASONS = ["Client absent", "Client fermé", "Adresse introuvable", "Refus client", "Paiement refusé", "Accès impossible", "Autre"];

interface SavedStopForm {
  requestId?: string;
  outcome?: DeliveryOutcome;
  quantities?: Record<string, number>;
  failureReason?: string;
  comment?: string;
  evidence?: Partial<EvidenceInput>;
  paymentEnabled?: boolean;
  payment?: Partial<PaymentInput>;
}

function readStopForm(key: string): SavedStopForm {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" ? value as SavedStopForm : {};
  } catch {
    return {};
  }
}

function stopFormKey(routeId: string, deliveryNote: string) {
  return `intrapro-distribution.stop-form.${routeId}.${deliveryNote}`;
}

async function compressImage(file: File): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Image illisible"));
    element.src = source;
  });
  const max = 1440;
  const ratio = Math.min(max / image.width, max / image.height, 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * ratio);
  canvas.height = Math.round(image.height * ratio);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.76);
}

function directionUrl(stop: RouteStop) {
  const destination = stop.latitude != null && stop.longitude != null
    ? `${stop.latitude},${stop.longitude}`
    : [stop.address, stop.commune, stop.wilaya].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function StopForm({ stop, routeId, routeRevision, onDone, onClose, onPending }: { stop: RouteStop; routeId: string; routeRevision: number; onDone: () => Promise<void>; onClose: () => void; onPending: () => void }) {
  const draftKey = stopFormKey(routeId, stop.deliveryNote);
  const restored = useMemo(() => readStopForm(draftKey), [draftKey]);
  const [requestId] = useState(restored.requestId || crypto.randomUUID());
  const [outcome, setOutcome] = useState<DeliveryOutcome>(restored.outcome || "delivered");
  const [quantities, setQuantities] = useState<Record<string, number>>(restored.quantities || {});
  const [failureReason, setFailureReason] = useState(restored.failureReason || "");
  const [comment, setComment] = useState(restored.comment || "");
  const [evidence, setEvidence] = useState<Partial<EvidenceInput>>(restored.evidence || {});
  const [paymentEnabled, setPaymentEnabled] = useState(restored.paymentEnabled || false);
  const [payment, setPayment] = useState<Partial<PaymentInput>>(restored.payment || { method: "cash" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const actions = useDistributionMutations();

  useEffect(() => {
    const draft: SavedStopForm = { requestId, outcome, quantities, failureReason, comment, evidence, paymentEnabled, payment };
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [comment, draftKey, evidence, failureReason, outcome, payment, paymentEnabled, quantities, requestId]);

  const locate = () => {
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => setEvidence((current) => ({ ...current, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy })),
      () => setError("Position GPS indisponible. Autorisez la localisation puis réessayez."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const photo = async (file?: File) => {
    if (!file) return;
    try {
      const photoData = await compressImage(file);
      setEvidence((current) => ({ ...current, photoData }));
    }
    catch { setError("La photo n’a pas pu être préparée."); }
  };

  const chequePhoto = async (file?: File) => {
    if (!file) return;
    try {
      const chequePhotoData = await compressImage(file);
      setPayment((current) => ({ ...current, chequePhotoData }));
    }
    catch { setError("La photo du chèque n’a pas pu être préparée."); }
  };

  const submit = async () => {
    const invalid = validateStopForm({ outcome, quantities, failureReason, comment, evidence, paymentEnabled, payment, amountToCollect: stop.amountToCollect });
    if (invalid) { setError(invalid); return; }
    const payload: StopCompletionPayload = {
      requestId,
      routeId,
      routeRevision,
      deliveryNote: stop.deliveryNote,
      outcome,
      items: (stop.items || []).map((item) => ({ itemName: item.name, deliveredQuantity: outcome === "partial" ? quantities[item.name] || 0 : item.remainingQuantity })),
      evidence: {
        latitude: evidence.latitude as number,
        longitude: evidence.longitude as number,
        accuracy: evidence.accuracy,
        photoData: evidence.photoData,
        signatureData: evidence.signatureData,
        signerName: evidence.signerName,
        comment,
      },
      failureReason: outcome === "failed" ? failureReason : undefined,
      failureComment: outcome === "failed" ? comment : undefined,
      payment: paymentEnabled ? payment as PaymentInput : undefined,
    };
    queueOperation(payload);
    markOperationAttempt(requestId);
    setSaving(true);
    setError("");
    try {
      await actions.completeStop(payload);
      confirmOperation(requestId);
      localStorage.removeItem(draftKey);
      await onDone();
      onClose();
    } catch (submitError) {
      onPending();
      setError(`${apiErrorMessage(submitError)} Le formulaire reste enregistré pour une nouvelle tentative.`);
    } finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-3 sm:p-6"><section role="dialog" aria-modal="true" aria-label={`Résultat ${stop.deliveryNote}`} className="mx-auto max-w-lg overflow-hidden rounded-2xl bg-slate-50 shadow-2xl"><header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-4"><div><p className="text-xs font-semibold text-blue-700">{stop.deliveryNote}</p><h2 className="font-bold text-slate-950">{stop.customerName}</h2></div><button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-xl" aria-label="Fermer">×</button></header><div className="space-y-5 p-4 pb-28">
    {error && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    <fieldset><legend className="text-sm font-bold text-slate-900">Résultat de l’arrêt</legend><div className="mt-2 grid grid-cols-3 gap-2">{([['delivered', 'Livré'], ['partial', 'Partiel'], ['failed', 'Échec']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setOutcome(value)} className={`h-12 rounded-xl border text-sm font-bold ${outcome === value ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-white text-slate-700"}`}>{label}</button>)}</div></fieldset>
    {outcome === "partial" && <fieldset><legend className="text-sm font-bold text-slate-900">Quantités livrées maintenant</legend><div className="mt-2 space-y-2">{stop.items?.map((item) => <label key={item.name} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.itemName}</span><span className="text-xs text-slate-500">Reste {item.remainingQuantity}</span></span><Input type="number" min="0" max={item.remainingQuantity} step="any" value={quantities[item.name] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [item.name]: Number(event.target.value) }))} className="h-11 w-24" aria-label={`Quantité ${item.itemName}`} /></label>)}</div></fieldset>}
    {outcome === "failed" && <div className="space-y-3"><label className="block text-sm font-bold text-slate-900">Motif<select value={failureReason} onChange={(event) => setFailureReason(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3"><option value="">Sélectionner</option>{FAILURE_REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select></label><label className="block text-sm font-bold text-slate-900">Commentaire<Textarea value={comment} onChange={(event) => setComment(event.target.value)} className="mt-2 min-h-24 bg-white" /></label></div>}
    <section className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="font-bold text-slate-900">Preuves</h3><Button type="button" variant="outline" onClick={locate} className="mt-3 h-12 w-full"><LocateFixed />{evidence.latitude != null ? "Position GPS enregistrée" : "Enregistrer la position GPS"}</Button>{evidence.latitude != null && <p className="mt-2 text-center text-xs text-emerald-700">Précision : {Math.round(evidence.accuracy || 0)} m</p>}{outcome !== "failed" && <><label className="mt-3 flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold"><Camera className="h-4 w-4" />{evidence.photoData ? "Photo ajoutée" : "Ajouter une photo"}<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => photo(event.target.files?.[0])} /></label><p className="my-3 text-center text-xs font-semibold text-slate-400">OU</p><SignaturePad onChange={(signatureData) => setEvidence((current) => ({ ...current, signatureData }))} />{evidence.signatureData && <Input value={evidence.signerName || ""} onChange={(event) => setEvidence((current) => ({ ...current, signerName: event.target.value }))} className="mt-3 h-11" placeholder="Nom du signataire" />}</>}</section>
    {outcome !== "failed" && <section className="rounded-2xl border border-slate-200 bg-white p-4"><label className="flex items-center justify-between"><span><span className="block font-bold text-slate-900">Saisir un paiement</span><span className="text-xs text-slate-500">Solde : {stop.amountToCollect.toLocaleString("fr-DZ")} DZD</span></span><input type="checkbox" checked={paymentEnabled} onChange={(event) => setPaymentEnabled(event.target.checked)} className="h-5 w-5 accent-blue-700" /></label>{paymentEnabled && <div className="mt-4 space-y-3"><select value={payment.method} onChange={(event) => setPayment((current) => ({ ...current, method: event.target.value as PaymentInput['method'] }))} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3"><option value="cash">Espèces</option><option value="cheque">Chèque</option></select><Input type="number" min="0" max={stop.amountToCollect} step="0.01" value={payment.amount ?? ""} onChange={(event) => setPayment((current) => ({ ...current, amount: Number(event.target.value) }))} className="h-12" placeholder="Montant DZD" />{payment.method === "cheque" && <><label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200"><Camera className="h-4 w-4" />{payment.chequePhotoData ? "Photo du chèque ajoutée" : "Photo du chèque"}<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => chequePhoto(event.target.files?.[0])} /></label><Input type="date" value={payment.collectionDate || ""} onChange={(event) => setPayment((current) => ({ ...current, collectionDate: event.target.value }))} className="h-12" /></>}</div>}</section>}
  </div><footer className="fixed inset-x-3 bottom-3 mx-auto flex max-w-lg gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl sm:bottom-6"><Button variant="outline" onClick={onClose} className="h-12 flex-1">Annuler</Button><Button onClick={submit} disabled={saving} className="h-12 flex-[2] bg-blue-700 hover:bg-blue-800">{saving ? <LoaderCircle className="animate-spin" /> : <Check />}Valider l’arrêt</Button></footer></section></div>;
}

export function DriverApp() {
  const [tab, setTab] = useState<DriverTab>("route");
  const [selectedStop, setSelectedStop] = useState<RouteStop>();
  const [scanValue, setScanValue] = useState("");
  const [message, setMessage] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [pendingCount, setPendingCount] = useState(() => readPendingOperations().length);
  const { logout } = useFrappeAuth();
  const { data, error, isLoading, mutate } = useDriverRoutes(localDate());
  const actions = useDistributionMutations();
  const routes = useMemo(() => data?.message || [], [data?.message]);
  const routeData = routes.find((route) => route.name === selectedRouteId) || routes[0];
  const completeStopRef = useRef(actions.completeStop);
  const mutateRef = useRef(mutate);

  useEffect(() => { completeStopRef.current = actions.completeStop; }, [actions.completeStop]);
  useEffect(() => { mutateRef.current = mutate; }, [mutate]);
  useEffect(() => {
    if (routes.length && !routes.some((route) => route.name === selectedRouteId)) {
      setSelectedRouteId(routes[0].name);
    }
  }, [routes, selectedRouteId]);

  const retryPending = useCallback(async () => {
    const pending = readPendingOperations();
    if (!pending.length) return;
    for (const operation of pending) {
      try {
        markOperationAttempt(operation.requestId);
        await completeStopRef.current(operation.payload);
        confirmOperation(operation.requestId);
        localStorage.removeItem(stopFormKey(operation.payload.routeId, operation.payload.deliveryNote));
      } catch {
        setPendingCount(readPendingOperations().length);
        return;
      }
    }
    setPendingCount(0);
    setMessage("Les opérations en attente ont été synchronisées.");
    await mutateRef.current();
  }, []);

  useEffect(() => {
    const online = () => { void retryPending(); };
    window.addEventListener("online", online);
    if (navigator.onLine) void retryPending();
    return () => window.removeEventListener("online", online);
  }, [retryPending]);

  const nextStop = useMemo(() => routeData?.stops.find((stop) => !["Livré", "Non Livré"].includes(stop.status)), [routeData]);
  const start = async () => {
    if (!routeData) return;
    try { await actions.startRoute(routeData.name); await mutate(); }
    catch (startError) { setMessage(apiErrorMessage(startError)); }
  };
  const acknowledge = async () => {
    if (!routeData) return;
    try {
      await actions.acknowledgeRoute(routeData.name, routeData.publishedRevision);
      setMessage("Révision acceptée. Vous pouvez démarrer la tournée.");
      await mutate();
    } catch (ackError) { setMessage(apiErrorMessage(ackError)); }
  };
  const scan = () => {
    const stop = routeData?.stops.find((item) => item.deliveryNote.toLowerCase() === scanValue.trim().toLowerCase());
    if (stop) { setSelectedStop(stop); setTab("route"); setMessage(""); }
    else setMessage("Ce bon ne fait pas partie de votre tournée active.");
  };

  return <div className="mx-auto min-h-screen max-w-xl bg-slate-50 pb-24 text-slate-950"><header className="bg-blue-800 px-4 pb-6 pt-5 text-white"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15"><Route className="h-5 w-5" /></span><div><p className="text-sm font-bold">IntraPro Distribution</p><p className="text-xs text-blue-100">Interface livreur</p></div></div><button type="button" onClick={() => logout().then(() => window.location.reload())} aria-label="Se déconnecter" className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"><LogOut className="h-4 w-4" /></button></div>{routeData && <div className="mt-6"><div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-200">Ma tournée</p><h1 className="mt-1 text-2xl font-bold">{routeData.name}</h1></div><span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">{routeData.lifecycle}</span></div><p className="mt-2 text-sm text-blue-100">{routeData.stops.length} arrêts · {routeData.totalQuantity} articles</p></div>}</header><main className="space-y-4 p-4">
    {message && <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{message}</div>}
    {pendingCount > 0 && <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-semibold text-amber-900">{pendingCount} opération(s) en attente</p><Button variant="outline" size="sm" onClick={() => void retryPending()}><RefreshCw />Réessayer</Button></div>}
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{apiErrorMessage(error)}</div>}
    {isLoading && <div className="grid min-h-64 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-blue-700" /></div>}
    {!isLoading && !routeData && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center"><Truck className="mx-auto h-9 w-9 text-slate-400" /><h2 className="mt-3 font-bold">Aucune tournée publiée</h2><p className="mt-2 text-sm text-slate-500">Actualisez lorsque le planning est prêt.</p><Button variant="outline" onClick={() => mutate()} className="mt-5 h-11"><RefreshCw />Actualiser</Button></div>}
    {routes.length > 1 && <label className="block rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold">Tournée du jour<select value={routeData?.name || ""} onChange={(event) => setSelectedRouteId(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 font-semibold">{routes.map((route) => <option key={route.name} value={route.name}>{route.plannedStart?.slice(11, 16) || "--:--"} · {route.name} · {route.lifecycle}</option>)}</select></label>}
    {routeData && tab === "route" && <>{routeData.lifecycle === "Publiée" && !routeData.acknowledged && <Button onClick={acknowledge} disabled={actions.saving} className="h-14 w-full rounded-2xl bg-blue-700 text-base hover:bg-blue-800"><Check />Accepter la révision {routeData.publishedRevision}</Button>}{routeData.lifecycle === "Publiée" && routeData.acknowledged && <Button onClick={start} disabled={actions.saving} className="h-14 w-full rounded-2xl bg-emerald-600 text-base hover:bg-emerald-700"><Play />Vérifier, enlever et démarrer</Button>}{nextStop && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="bg-blue-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-blue-700">Prochain arrêt · {nextStop.sequence}/{routeData.stops.length}</p><h2 className="mt-1 text-xl font-bold">{nextStop.customerName}</h2><p className="mt-1 text-sm text-slate-600">{nextStop.address || [nextStop.commune, nextStop.wilaya].filter(Boolean).join(", ")}</p></div><div className="grid grid-cols-2 gap-2 p-4"><a href={directionUrl(nextStop)} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-bold text-white"><Navigation className="h-4 w-4" />Navigation</a><a href={`tel:${nextStop.phone || ""}`} className={`flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-bold ${nextStop.phone ? "border-slate-200 text-slate-800" : "pointer-events-none border-slate-100 text-slate-300"}`}><Phone className="h-4 w-4" />Appeler</a></div><div className="border-t border-slate-100 p-4"><div className="flex items-center justify-between text-sm"><span className="text-slate-500">À encaisser</span><strong>{nextStop.amountToCollect.toLocaleString("fr-DZ")} DZD</strong></div><Button onClick={() => setSelectedStop(nextStop)} disabled={routeData.lifecycle !== "En cours"} className="mt-4 h-12 w-full bg-blue-700 hover:bg-blue-800">Traiter cet arrêt<ChevronRight /></Button></div></section>}<section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-bold">Tous les arrêts</h2><ol className="mt-3 space-y-2">{routeData.stops.map((stop, index) => <li key={stop.deliveryNote}><button type="button" disabled={routeData.lifecycle !== "En cours" || stop.status === "Livré"} onClick={() => setSelectedStop(stop)} className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left disabled:opacity-60"><span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold ${stop.status === "Livré" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{stop.status === "Livré" ? <Check className="h-4 w-4" /> : index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{stop.customerName}</span><span className="block text-xs text-slate-500">{stop.deliveryNote}</span></span><span className="text-xs font-semibold text-slate-500">{stop.status}</span></button></li>)}</ol></section></>}
    {routeData && tab === "scanner" && <section className="rounded-2xl border border-slate-200 bg-white p-5 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-700"><ScanLine className="h-7 w-7" /></span><h2 className="mt-4 text-xl font-bold">Scanner un BL</h2><p className="mt-2 text-sm text-slate-500">Saisissez ou scannez l’identifiant imprimé sur le bon.</p><Input autoFocus value={scanValue} onChange={(event) => setScanValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") scan(); }} className="mt-5 h-14 text-center text-lg font-bold" placeholder="BL-00001" /><Button onClick={scan} className="mt-3 h-12 w-full bg-blue-700 hover:bg-blue-800"><ScanLine />Vérifier le bon</Button></section>}
    {routeData && tab === "activity" && <section className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-blue-700" /><h2 className="font-bold">Activité</h2></div><div className="mt-4 space-y-3">{routeData.stops.filter((stop) => ["Livré", "Non Livré", "Partiellement Livré"].includes(stop.status)).map((stop) => <div key={stop.deliveryNote} className="flex items-center gap-3 border-b border-slate-100 pb-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100"><CircleDollarSign className="h-4 w-4 text-slate-600" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{stop.customerName}</span><span className="text-xs text-slate-500">{stop.deliveryNote}</span></span><span className="text-xs font-bold text-slate-600">{stop.status}</span></div>)}{!routeData.stops.some((stop) => ["Livré", "Non Livré", "Partiellement Livré"].includes(stop.status)) && <p className="py-8 text-center text-sm text-slate-500">Aucune activité pour le moment.</p>}</div></section>}
  </main><nav aria-label="Navigation livreur" className="fixed inset-x-0 bottom-0 z-40 mx-auto grid h-20 max-w-xl grid-cols-3 border-t border-slate-200 bg-white px-3 pb-[env(safe-area-inset-bottom)]">{([{ value: 'route', label: 'Ma tournée', icon: MapPin }, { value: 'scanner', label: 'Scanner', icon: ScanLine }, { value: 'activity', label: 'Activité', icon: Activity }] as const).map((item) => { const Icon = item.icon; return <button key={item.value} type="button" onClick={() => setTab(item.value)} className={`flex flex-col items-center justify-center gap-1 text-xs font-bold ${tab === item.value ? "text-blue-700" : "text-slate-400"}`}><Icon className="h-5 w-5" />{item.label}</button>; })}</nav>{selectedStop && routeData && <StopForm stop={selectedStop} routeId={routeData.name} routeRevision={routeData.revision} onDone={async () => { await mutate(); }} onClose={() => setSelectedStop(undefined)} onPending={() => setPendingCount(readPendingOperations().length)} />}</div>;
}
