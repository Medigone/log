import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrappeAuth } from "frappe-react-sdk";
import {
  Activity,
  AlertTriangle,
  Camera,
  Check,
  ChevronRight,
  CircleDollarSign,
  Home,
  LoaderCircle,
  LocateFixed,
  LogOut,
  MapPin,
  Navigation,
  Phone,
  Play,
  RefreshCw,
  ScanLine,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage, useDistributionMutations, useDriverDashboard, useDriverRoutes } from "@/shared/api/distribution";
import { getStopVisualStyle } from "@/features/planning/stopStatus";
import { formatMoney } from "@/shared/format";
import { BrandLogo } from "@/shared/ui/BrandLogo";
import { clearPendingOperations, confirmOperation, markOperationAttempt, queueOperation, readPendingOperations } from "@/shared/persistence/pendingOperations";
import type { DeliveryOutcome, EvidenceInput, PaymentInput, RouteStop, StopCompletionPayload, StopCompletionResult } from "@/shared/types/distribution";
import { DriverDashboard } from "@/features/driver/DriverDashboard";
import { SignaturePad } from "@/features/driver/SignaturePad";
import { validateStopForm, estimatedCollectableAmount } from "@/features/driver/validation";

type DriverTab = "home" | "route" | "scanner" | "activity";

const FAILURE_REASONS = ["Client absent", "Client fermé", "Adresse introuvable", "Refus client", "Paiement refusé", "Accès impossible", "Autre"];

const DRIVER_TABS = [
  { value: "home", label: "Accueil", icon: Home },
  { value: "route", label: "Ma tournée", icon: MapPin },
  { value: "scanner", label: "Scanner", icon: ScanLine },
  { value: "activity", label: "Activité", icon: Activity },
] as const satisfies ReadonlyArray<{ value: DriverTab; label: string; icon: typeof Home }>;

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

function StopForm({ stop, routeId, routeRevision, onDone, onClose, onPending }: { stop: RouteStop; routeId: string; routeRevision: number; onDone: (result: StopCompletionResult) => Promise<void>; onClose: () => void; onPending: () => void }) {
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
  const suggestedAmount = useMemo(() => estimatedCollectableAmount(stop, outcome, quantities), [outcome, quantities, stop]);
  const lastSuggested = useRef(suggestedAmount);

  useEffect(() => {
    const draft: SavedStopForm = { requestId, outcome, quantities, failureReason, comment, evidence, paymentEnabled, payment };
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [comment, draftKey, evidence, failureReason, outcome, payment, paymentEnabled, quantities, requestId]);

  useEffect(() => {
    const previous = lastSuggested.current;
    lastSuggested.current = suggestedAmount;
    if (!paymentEnabled || outcome === "failed") return;
    setPayment((current) => {
      if (current.amount != null && current.amount !== 0 && current.amount !== previous) return current;
      if (current.amount === suggestedAmount) return current;
      return { ...current, amount: suggestedAmount || undefined };
    });
  }, [outcome, paymentEnabled, suggestedAmount]);

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
    const invalid = validateStopForm({
      outcome,
      quantities,
      failureReason,
      comment,
      evidence,
      paymentEnabled,
      payment,
      amountToCollect: suggestedAmount,
      requiresCustomerGeolocation: stop.requiresCustomerGeolocation,
    });
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
      const result = await actions.completeStop(payload);
      confirmOperation(requestId);
      localStorage.removeItem(draftKey);
      await onDone(result);
      onClose();
    } catch (submitError) {
      onPending();
      setError(`${apiErrorMessage(submitError)} Le formulaire reste enregistré pour une nouvelle tentative.`);
    } finally { setSaving(false); }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && !saving && onClose()}>
      <SheetContent side="bottom" aria-label={`Résultat ${stop.deliveryNote}`} className="max-h-[95vh] rounded-t-touch">
        <SheetHeader>
          <p className="t-meta font-semibold text-brand-700">{stop.deliveryNote}</p>
          <SheetTitle>{stop.customerName}</SheetTitle>
        </SheetHeader>

        <SheetBody className="space-y-4 bg-surface-subtle">
          {error && (
            <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          )}

          {stop.requiresCustomerGeolocation && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-semibold">GPS client à collecter</p>
              <p className="mt-1 text-amber-800">
                À l’arrivée, enregistrez une position précise à 50 m ou moins. Elle sera conservée pour les prochaines
                livraisons.
              </p>
            </div>
          )}

          <fieldset>
            <legend className="t-section">Résultat de l’arrêt</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(
                [
                  ["delivered", "Livré"],
                  ["partial", "Partiel"],
                  ["failed", "Échec"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={outcome === value}
                  onClick={() => setOutcome(value)}
                  className={`h-14 rounded-touch border text-sm font-semibold transition-colors ${
                    outcome === value
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-hairline-strong bg-white text-slate-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          {outcome === "partial" && (
            <fieldset>
              <legend className="t-section">Quantités livrées maintenant</legend>
              <div className="mt-2 space-y-2">
                {stop.items?.map((item) => (
                  <label
                    key={item.name}
                    className="flex items-center gap-3 rounded-touch border border-hairline bg-white p-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.itemName}</span>
                      <span className="num t-meta text-muted-foreground">Reste {item.remainingQuantity}</span>
                    </span>
                    <Input
                      type="number"
                      min="0"
                      max={item.remainingQuantity}
                      step="any"
                      value={quantities[item.name] ?? ""}
                      onChange={(event) =>
                        setQuantities((current) => ({ ...current, [item.name]: Number(event.target.value) }))
                      }
                      className="num h-12 w-24 text-base"
                      aria-label={`Quantité ${item.itemName}`}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {outcome === "failed" && (
            <div className="space-y-3">
              <label className="block">
                <span className="t-section">Motif</span>
                <NativeSelect
                  size="touch"
                  value={failureReason}
                  onChange={(event) => setFailureReason(event.target.value)}
                  className="mt-2"
                >
                  <option value="">Sélectionner</option>
                  {FAILURE_REASONS.map((reason) => (
                    <option key={reason}>{reason}</option>
                  ))}
                </NativeSelect>
              </label>
              <label className="block">
                <span className="t-section">Commentaire</span>
                <Textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  className="mt-2 min-h-24 bg-white"
                />
              </label>
            </div>
          )}

          <Card density="touch" className="p-4">
            <h3 className="t-section">Preuves</h3>
            <Button type="button" variant="outline" size="touch" onClick={locate} className="mt-3 w-full">
              <LocateFixed />
              {evidence.latitude != null
                ? "Reprendre la localisation"
                : stop.requiresCustomerGeolocation
                  ? "Localiser ce client"
                  : "Enregistrer la position GPS"}
            </Button>
            {evidence.latitude != null && (
              <p
                className={`num mt-2 text-center t-meta font-semibold ${
                  stop.requiresCustomerGeolocation && (evidence.accuracy == null || evidence.accuracy > 50)
                    ? "text-red-700"
                    : "text-emerald-700"
                }`}
              >
                Précision : {Math.round(evidence.accuracy || 0)} m
                {stop.requiresCustomerGeolocation && evidence.accuracy != null && evidence.accuracy > 50
                  ? " · recommencez pour atteindre 50 m ou moins"
                  : ""}
              </p>
            )}
            {outcome !== "failed" && (
              <>
                <label className="mt-3 flex h-14 cursor-pointer items-center justify-center gap-2 rounded-touch border border-hairline-strong text-sm font-semibold">
                  <Camera className="size-4" />
                  {evidence.photoData ? "Photo ajoutée" : "Ajouter une photo"}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(event) => photo(event.target.files?.[0])}
                  />
                </label>
                <p className="my-3 text-center t-meta font-semibold text-subtle">OU</p>
                <SignaturePad onChange={(signatureData) => setEvidence((current) => ({ ...current, signatureData }))} />
                {evidence.signatureData && (
                  <Input
                    value={evidence.signerName || ""}
                    onChange={(event) => setEvidence((current) => ({ ...current, signerName: event.target.value }))}
                    className="mt-3 h-12 text-base"
                    placeholder="Nom du signataire"
                  />
                )}
              </>
            )}
          </Card>

          {outcome !== "failed" && (
            <Card density="touch" className="p-4">
              <label className="flex items-center justify-between gap-3">
                <span>
                  <span className="block t-section">Déclarer un encaissement</span>
                  <span className="t-meta text-muted-foreground">
                    {outcome === "partial"
                      ? `Facture estimée : ${formatMoney(suggestedAmount)} sur un BL de ${formatMoney(stop.amountToCollect)} · vous pouvez encaisser plus`
                      : `Facture estimée : ${formatMoney(suggestedAmount)} · le caissier contrôlera le montant`}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={paymentEnabled}
                  onChange={(event) => setPaymentEnabled(event.target.checked)}
                  className="size-5 shrink-0 accent-brand-600"
                />
              </label>
              {paymentEnabled && (
                <div className="mt-4 space-y-3">
                  <NativeSelect
                    size="touch"
                    aria-label="Mode de paiement"
                    value={payment.method}
                    onChange={(event) =>
                      setPayment((current) => ({ ...current, method: event.target.value as PaymentInput["method"] }))
                    }
                  >
                    <option value="cash">Espèces</option>
                    <option value="cheque">Chèque</option>
                  </NativeSelect>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payment.amount ?? ""}
                    onChange={(event) => setPayment((current) => ({ ...current, amount: Number(event.target.value) }))}
                    className="num h-14 rounded-touch text-base"
                    placeholder="Montant DZD"
                  />
                  {payment.method === "cheque" && (
                    <>
                      <Input
                        value={payment.chequeNumber || ""}
                        onChange={(event) => setPayment((current) => ({ ...current, chequeNumber: event.target.value }))}
                        className="h-14 rounded-touch text-base"
                        placeholder="Numéro du chèque"
                      />
                      <label className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-touch border border-hairline-strong text-sm font-semibold">
                        <Camera className="size-4" />
                        {payment.chequePhotoData ? "Photo du chèque ajoutée" : "Photo du chèque"}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="sr-only"
                          onChange={(event) => chequePhoto(event.target.files?.[0])}
                        />
                      </label>
                      <Input
                        type="date"
                        value={payment.collectionDate || ""}
                        onChange={(event) =>
                          setPayment((current) => ({ ...current, collectionDate: event.target.value }))
                        }
                        className="h-14 rounded-touch text-base"
                      />
                    </>
                  )}
                </div>
              )}
            </Card>
          )}
        </SheetBody>

        <SheetFooter className="gap-2">
          <Button variant="outline" size="touch" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button size="touch" onClick={submit} disabled={saving} className="flex-[2]">
            {saving ? <LoaderCircle className="animate-spin" /> : <Check />}
            Valider l’arrêt
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function DriverApp() {
  const [tab, setTab] = useState<DriverTab>("home");
  const [selectedStop, setSelectedStop] = useState<RouteStop>();
  const [scanValue, setScanValue] = useState("");
  const [message, setMessage] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [pendingCount, setPendingCount] = useState(() => readPendingOperations().length);
  const { logout } = useFrappeAuth();
  const today = localDate();
  const { data, error, isLoading, mutate } = useDriverRoutes(today);
  const { data: dashboardData, error: dashboardError, isLoading: dashboardLoading, mutate: mutateDashboard } = useDriverDashboard(today);
  const actions = useDistributionMutations();
  const routes = useMemo(() => data?.message || [], [data?.message]);
  const routeData = routes.find((route) => route.name === selectedRouteId) || routes[0];
  const completeStopRef = useRef(actions.completeStop);
  const mutateRef = useRef(mutate);
  const mutateDashboardRef = useRef(mutateDashboard);

  useEffect(() => { completeStopRef.current = actions.completeStop; }, [actions.completeStop]);
  useEffect(() => { mutateRef.current = mutate; }, [mutate]);
  useEffect(() => { mutateDashboardRef.current = mutateDashboard; }, [mutateDashboard]);

  const refresh = useCallback(async () => {
    await Promise.all([mutate(), mutateDashboard()]);
  }, [mutate, mutateDashboard]);
  useEffect(() => {
    if (routes.length && !routes.some((route) => route.name === selectedRouteId)) {
      setSelectedRouteId(routes[0].name);
    }
  }, [routes, selectedRouteId]);

  const retryPending = useCallback(async () => {
    const pending = readPendingOperations();
    if (!pending.length) return;
    let customerLocationUpdated = false;
    for (const operation of pending) {
      try {
        markOperationAttempt(operation.requestId);
        const result = await completeStopRef.current(operation.payload);
        customerLocationUpdated ||= result.customerLocationUpdated;
        confirmOperation(operation.requestId);
        localStorage.removeItem(stopFormKey(operation.payload.routeId, operation.payload.deliveryNote));
      } catch {
        setPendingCount(readPendingOperations().length);
        return;
      }
    }
    setPendingCount(0);
    setMessage(customerLocationUpdated ? "Opérations synchronisées et localisation client enregistrée." : "Les opérations en attente ont été synchronisées.");
    await Promise.all([mutateRef.current(), mutateDashboardRef.current()]);
  }, []);

  const discardPending = useCallback(() => {
    const pending = clearPendingOperations();
    for (const operation of pending) {
      localStorage.removeItem(stopFormKey(operation.payload.routeId, operation.payload.deliveryNote));
    }
    setPendingCount(0);
    setMessage("Opérations en attente ignorées.");
  }, []);

  useEffect(() => {
    const online = () => { void retryPending(); };
    window.addEventListener("online", online);
    if (navigator.onLine) void retryPending();
    return () => window.removeEventListener("online", online);
  }, [retryPending]);

  const nextStop = useMemo(() => routeData?.stops.find((stop) => !["Livré", "Partiellement Livré", "Non Livré"].includes(stop.status)), [routeData]);
  const openRoute = (deliveryNote?: string) => {
    if (deliveryNote) {
      const match = routes.find((route) => route.stops.some((stop) => stop.deliveryNote === deliveryNote));
      const stop = match?.stops.find((item) => item.deliveryNote === deliveryNote);
      if (match) setSelectedRouteId(match.name);
      if (stop && match?.lifecycle === "En cours" && !["Livré", "Partiellement Livré", "Non Livré"].includes(stop.status)) {
        setSelectedStop(stop);
      }
    }
    setTab("route");
  };
  const start = async () => {
    if (!routeData) return;
    try { await actions.startRoute(routeData.name, routeData.revision); setMessage("Marchandise transférée dans le véhicule. Tournée démarrée."); await refresh(); }
    catch (startError) { setMessage(apiErrorMessage(startError)); }
  };
  const acknowledge = async () => {
    if (!routeData) return;
    try {
      await actions.acknowledgeRoute(routeData.name, routeData.publishedRevision);
      setMessage("Révision acceptée. Vous pouvez démarrer la tournée.");
      await refresh();
    } catch (ackError) { setMessage(apiErrorMessage(ackError)); }
  };
  const scan = () => {
    const stop = routeData?.stops.find((item) => item.deliveryNote.toLowerCase() === scanValue.trim().toLowerCase());
    if (stop) { setSelectedStop(stop); setTab("route"); setMessage(""); }
    else setMessage("Ce bon ne fait pas partie de votre tournée active.");
  };
  const declareReturn = async () => {
    if (!routeData) return;
    try {
      await actions.declareRouteReturn(routeData.name, routeData.revision);
      setMessage("Retour déclaré. Le préparateur doit maintenant recompter et confirmer la marchandise.");
      await refresh();
    } catch (returnError) { setMessage(apiErrorMessage(returnError)); }
  };

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-surface-subtle pb-24 text-foreground">
      <header className="bg-brand-600 px-4 pb-6 pt-5 text-white">
        <div className="flex items-center justify-between">
          <div className="rounded-xl bg-white px-3 py-2">
            <BrandLogo className="h-8 w-auto" alt="IntraPro Distribution" />
          </div>
          <button
            type="button"
            onClick={() => logout().then(() => window.location.reload())}
            aria-label="Se déconnecter"
            className="grid size-11 place-items-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
          >
            <LogOut className="size-4" />
          </button>
        </div>

        {tab === "home" ? (
          <div className="mt-6">
            <p className="t-micro text-brand-100">Tableau de bord</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Aujourd’hui</h1>
            <p className="mt-2 t-body text-brand-100">
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
              {dashboardData?.message?.driver?.vehicle ? ` · ${dashboardData.message.driver.vehicle}` : ""}
              {dashboardData?.message?.routes[0]?.lifecycle ? ` · ${dashboardData.message.routes[0].lifecycle}` : ""}
            </p>
          </div>
        ) : routeData ? (
          <div className="mt-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="t-micro text-brand-100">Ma tournée</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">{routeData.name}</h1>
              </div>
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{routeData.lifecycle}</span>
            </div>
            <p className="num mt-2 t-body text-brand-100">
              {routeData.stops.length} arrêts · {routeData.totalQuantity} articles
            </p>
          </div>
        ) : null}
      </header>

      <main className="space-y-4 p-4">
        {message && (
          <div role="status" className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900">
            {message}
          </div>
        )}

        {pendingCount > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="num text-sm font-semibold text-amber-900">{pendingCount} opération(s) en attente</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={discardPending}>
                Ignorer
              </Button>
              <Button variant="outline" size="sm" onClick={() => void retryPending()}>
                <RefreshCw />
                Réessayer
              </Button>
            </div>
          </div>
        )}

        {tab !== "home" && error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {apiErrorMessage(error)}
          </div>
        )}

        {tab === "home" && (
          <DriverDashboard
            data={dashboardData?.message}
            loading={dashboardLoading}
            error={dashboardError}
            onRefresh={() => void mutateDashboard()}
            onOpenRoute={openRoute}
          />
        )}

        {tab !== "home" && isLoading && (
          <div className="grid min-h-64 place-items-center">
            <LoaderCircle className="size-7 animate-spin text-brand-600" />
          </div>
        )}

        {tab !== "home" && !isLoading && !routeData && (
          <Card density="touch" className="p-8 text-center">
            <Truck className="mx-auto size-9 text-subtle" />
            <h2 className="mt-3 t-section">Aucune tournée publiée</h2>
            <p className="mt-2 t-body text-muted-foreground">Actualisez lorsque le planning est prêt.</p>
            <Button variant="outline" size="touch" onClick={() => mutate()} className="mt-5">
              <RefreshCw />
              Actualiser
            </Button>
          </Card>
        )}

        {tab !== "home" && routes.length > 1 && (
          <Card density="touch" className="block p-4">
            <label className="block">
              <span className="t-section">Tournée du jour</span>
              <NativeSelect
                size="touch"
                className="mt-2"
                value={routeData?.name || ""}
                onChange={(event) => setSelectedRouteId(event.target.value)}
              >
                {routes.map((route) => (
                  <option key={route.name} value={route.name}>
                    {route.plannedStart?.slice(11, 16) || "--:--"} · {route.name} · {route.lifecycle}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </Card>
        )}

        {routeData && tab === "route" && (
          <>
            {routeData.lifecycle === "Publiée" && !routeData.acknowledged && (
              <Button size="touch" onClick={acknowledge} disabled={actions.saving} className="w-full">
                <Check />
                Accepter la révision {routeData.publishedRevision}
              </Button>
            )}

            {routeData.lifecycle === "Publiée" && routeData.acknowledged && (
              <Button
                size="touch"
                onClick={start}
                disabled={actions.saving}
                className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800"
              >
                <Play />
                Vérifier, charger et démarrer
              </Button>
            )}

            {routeData.lifecycle === "Retour dépôt" && (
              <section className="rounded-touch border border-amber-200 bg-amber-50 p-4">
                <h2 className="t-section text-amber-950">Retour au dépôt requis</h2>
                <p className="mt-1 t-body text-amber-800">
                  <span className="num">{routeData.stock.remainingQuantity}</span> article(s) doivent être remis à
                  l’entrepôt. Le transfert sera confirmé après recomptage.
                </p>
                {routeData.stock.status === "Retour requis" ? (
                  <Button
                    size="touch"
                    onClick={declareReturn}
                    disabled={actions.fulfillment}
                    className="mt-4 w-full bg-amber-600 hover:bg-amber-700 active:bg-amber-800"
                  >
                    <Truck />
                    Déclarer mon retour
                  </Button>
                ) : (
                  <p className="mt-3 rounded-xl bg-white p-3 text-sm font-medium text-amber-900">
                    Retour déclaré · contrôle entrepôt en attente
                  </p>
                )}
              </section>
            )}

            {nextStop && (
              <Card density="touch" className="overflow-hidden p-0">
                <div className="bg-brand-50 p-4">
                  <p className="t-micro text-brand-700">
                    Prochain arrêt · {nextStop.sequence}/{routeData.stops.length}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">{nextStop.customerName}</h2>
                  <p className="mt-1 t-body text-slate-600">
                    {nextStop.address || [nextStop.commune, nextStop.wilaya].filter(Boolean).join(", ")}
                  </p>
                  {nextStop.requiresCustomerGeolocation && (
                    <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
                      <LocateFixed className="size-3.5" />
                      GPS client à collecter
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 p-4">
                  <a
                    href={directionUrl(nextStop)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-14 items-center justify-center gap-2 rounded-touch bg-brand-600 text-sm font-semibold text-white"
                  >
                    <Navigation className="size-4" />
                    Navigation
                  </a>
                  <a
                    href={`tel:${nextStop.phone || ""}`}
                    className={`flex h-14 items-center justify-center gap-2 rounded-touch border text-sm font-semibold ${
                      nextStop.phone
                        ? "border-hairline-strong text-slate-800"
                        : "pointer-events-none border-hairline text-subtle"
                    }`}
                  >
                    <Phone className="size-4" />
                    Appeler
                  </a>
                </div>
                <div className="border-t border-hairline p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">À encaisser</span>
                    <strong className="num font-semibold">{formatMoney(nextStop.amountToCollect)}</strong>
                  </div>
                  <Button
                    size="touch"
                    onClick={() => setSelectedStop(nextStop)}
                    disabled={routeData.lifecycle !== "En cours"}
                    className="mt-4 w-full"
                  >
                    Traiter cet arrêt
                    <ChevronRight />
                  </Button>
                </div>
              </Card>
            )}

            <Card density="touch" className="p-4">
              <h2 className="t-section">Tous les arrêts</h2>
              <ol className="mt-3 space-y-2">
                {routeData.stops.map((stop, index) => {
                  const visual = getStopVisualStyle(stop.status);
                  const completed = ["Livré", "Partiellement Livré", "Non Livré"].includes(stop.status);
                  return (
                    <li key={stop.deliveryNote}>
                      <button
                        type="button"
                        disabled={routeData.lifecycle !== "En cours" || completed}
                        onClick={() => setSelectedStop(stop)}
                        className="flex w-full items-center gap-3 rounded-xl border border-hairline p-3 text-left transition-colors disabled:opacity-60"
                      >
                        <span
                          className={`num grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                            completed ? visual.sequenceClass : "bg-surface-subtle text-slate-600"
                          }`}
                        >
                          {completed ? visual.markerSymbol || <Check className="size-4" /> : index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{stop.customerName}</span>
                          <span className="block t-meta text-muted-foreground">
                            {stop.deliveryNote}
                            {stop.requiresCustomerGeolocation ? " · GPS à collecter" : ""}
                          </span>
                        </span>
                        <span className={`t-meta font-semibold ${completed ? visual.badgeClass.split(" ")[1] : "text-muted-foreground"}`}>
                          {stop.status}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </Card>
          </>
        )}

        {routeData && tab === "scanner" && (
          <Card density="touch" className="p-5 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-touch bg-brand-50 text-brand-700">
              <ScanLine className="size-7" />
            </span>
            <h2 className="mt-4 text-xl font-semibold tracking-tight">Scanner un BL</h2>
            <p className="mt-2 t-body text-muted-foreground">
              Saisissez ou scannez l’identifiant imprimé sur le bon.
            </p>
            <Input
              autoFocus
              value={scanValue}
              onChange={(event) => setScanValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") scan();
              }}
              className="num mt-5 h-14 rounded-touch text-center text-lg font-semibold"
              placeholder="BL-00001"
            />
            <Button size="touch" onClick={scan} className="mt-3 w-full">
              <ScanLine />
              Vérifier le bon
            </Button>
          </Card>
        )}

        {routeData && tab === "activity" && (
          <Card density="touch" className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="size-5 text-brand-600" />
              <h2 className="t-section">Activité</h2>
            </div>
            <div className="mt-4 space-y-3">
              {routeData.stops
                .filter((stop) => ["Livré", "Non Livré", "Partiellement Livré"].includes(stop.status))
                .map((stop) => {
                  const visual = getStopVisualStyle(stop.status);
                  return (
                    <div key={stop.deliveryNote} className="flex items-center gap-3 border-b border-hairline pb-3">
                      <span className={`grid size-9 shrink-0 place-items-center rounded-full ${visual.badgeClass}`}>
                        <CircleDollarSign className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{stop.customerName}</span>
                        <span className="t-meta text-muted-foreground">{stop.deliveryNote}</span>
                      </span>
                      <span className="t-meta font-semibold text-slate-600">{stop.status}</span>
                    </div>
                  );
                })}
              {!routeData.stops.some((stop) => ["Livré", "Non Livré", "Partiellement Livré"].includes(stop.status)) && (
                <p className="py-8 text-center t-body text-muted-foreground">Aucune activité pour le moment.</p>
              )}
            </div>
          </Card>
        )}
      </main>

      <nav
        aria-label="Navigation livreur"
        className="fixed inset-x-0 bottom-0 z-40 mx-auto grid h-20 max-w-xl grid-cols-4 border-t border-hairline bg-white px-2 pb-[env(safe-area-inset-bottom)]"
      >
        {DRIVER_TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition-colors ${
                active ? "text-brand-700" : "text-subtle"
              }`}
            >
              <span className={`grid h-7 w-12 place-items-center rounded-full ${active ? "bg-brand-50" : ""}`}>
                <Icon className="size-5" />
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {selectedStop && routeData && (
        <StopForm
          stop={selectedStop}
          routeId={routeData.name}
          routeRevision={routeData.revision}
          onDone={async (result) => {
            const parts = ["Arrêt validé."];
            if (result.accounting?.salesInvoice) parts.push(`Facture ${result.accounting.salesInvoice} créée.`);
            if (result.customerLocationUpdated) parts.push("Localisation client enregistrée.");
            setMessage(parts.join(" "));
            await refresh();
          }}
          onClose={() => setSelectedStop(undefined)}
          onPending={() => setPendingCount(readPendingOperations().length)}
        />
      )}
    </div>
  );
}
