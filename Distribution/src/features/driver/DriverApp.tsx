import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrappeAuth } from "frappe-react-sdk";
import {
  Check,
  ChevronRight,
  LocateFixed,
  LogOut,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  ScanLine,
  Truck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage, useDistributionMutations, useDriverDashboard, useDriverRoutes } from "@/shared/api/distribution";
import { getStopVisualStyle } from "@/features/planning/stopStatus";
import { formatMoney } from "@/shared/format";
import { BrandLogo } from "@/shared/ui/BrandLogo";
import {
  clearPendingOperations,
  confirmOperation,
  markOperationAttempt,
  readPendingOperations,
} from "@/shared/persistence/pendingOperations";
import type { DistributionRoute, RouteStop, StopCompletionResult } from "@/shared/types/distribution";
import { DepartureBoard } from "@/features/driver/DepartureBoard";
import {
  proposeScanAction,
  readVerifiedNotes,
  writeVerifiedNotes,
} from "@/features/driver/departureWorkflow";
import { DriverDashboard } from "@/features/driver/DriverDashboard";
import { StopCompletionWizard } from "@/features/driver/StopCompletionWizard";
import { directionUrl, isStopCompleted, stopAddress, stopFormKey } from "@/features/driver/stopHelpers";

type DriverTab = "route" | "scanner" | "bilan";

const DRIVER_TABS = [
  { value: "route", label: "Tournée", icon: MapPin },
  { value: "scanner", label: "Scanner", icon: ScanLine },
  { value: "bilan", label: "Bilan", icon: Wallet },
] as const satisfies ReadonlyArray<{ value: DriverTab; label: string; icon: typeof MapPin }>;

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function StopNavLinks({ stop, compact = false }: { stop: RouteStop; compact?: boolean }) {
  const canCall = Boolean(stop.phone);
  if (compact) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <a
          href={directionUrl(stop)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Navigation vers ${stop.customerName}`}
          className="grid size-11 place-items-center rounded-xl border border-hairline-strong text-slate-700"
        >
          <Navigation className="size-4" />
        </a>
        <a
          href={canCall ? `tel:${stop.phone}` : undefined}
          aria-label={canCall ? `Appeler ${stop.customerName}` : "Téléphone non renseigné"}
          aria-disabled={!canCall}
          className={`grid size-11 place-items-center rounded-xl border ${
            canCall ? "border-hairline-strong text-slate-700" : "pointer-events-none border-hairline text-subtle"
          }`}
        >
          <Phone className="size-4" />
        </a>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <a
        href={directionUrl(stop)}
        target="_blank"
        rel="noreferrer"
        aria-label={`Navigation vers ${stop.customerName}`}
        className="flex h-14 items-center justify-center gap-2 rounded-touch bg-brand-600 text-sm font-semibold text-white"
      >
        <Navigation className="size-4" />
        Navigation
      </a>
      <a
        href={canCall ? `tel:${stop.phone}` : undefined}
        aria-label={canCall ? `Appeler ${stop.customerName}` : "Téléphone non renseigné"}
        aria-disabled={!canCall}
        className={`flex h-14 items-center justify-center gap-2 rounded-touch border text-sm font-semibold ${
          canCall ? "border-hairline-strong text-slate-800" : "pointer-events-none border-hairline text-subtle"
        }`}
      >
        <Phone className="size-4" />
        Appeler
      </a>
    </div>
  );
}

function ConfirmActionDialog({
  title,
  description,
  confirmLabel,
  saving,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  saving: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <p className="t-micro text-brand-700">Confirmation requise</p>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={onConfirm} disabled={saving}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RouteNowView({
  routeData,
  nextStop,
  fulfillment,
  onDeclareReturn,
  onTreat,
}: {
  routeData: DistributionRoute;
  nextStop?: RouteStop;
  fulfillment: boolean;
  onDeclareReturn: () => void;
  onTreat: (stop: RouteStop) => void;
}) {
  const canTreat = routeData.lifecycle === "En cours";
  const remaining = routeData.stops.filter((stop) => !isStopCompleted(stop)).length;

  return (
    <>
      {routeData.lifecycle === "Retour dépôt" && (routeData.stock?.remainingQuantity || 0) > 0 && (
        <section className="rounded-touch border border-amber-200 bg-amber-50 p-4">
          <h2 className="t-section text-amber-950">Retour au dépôt requis</h2>
          <p className="mt-1 t-body text-amber-800">
            <span className="num">{routeData.stock.remainingQuantity}</span> article(s) doivent être remis à l’entrepôt.
            Le transfert sera confirmé après recomptage.
          </p>
          {routeData.stock.status === "Retour requis" ? (
            <Button
              size="touch"
              onClick={onDeclareReturn}
              disabled={fulfillment}
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

      {nextStop ? (
        <Card density="touch" className="overflow-hidden p-0">
          <div className="bg-brand-50 p-4">
            <p className="t-micro text-brand-700">
              Prochain arrêt · {routeData.stops.findIndex((item) => item.deliveryNote === nextStop.deliveryNote) + 1}/
              {routeData.stops.length}
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">{nextStop.customerName}</h2>
            <p className="mt-1 t-body text-slate-600">{stopAddress(nextStop)}</p>
            {nextStop.instructions ? <p className="mt-2 t-meta text-slate-700">{nextStop.instructions}</p> : null}
            {nextStop.requiresCustomerGeolocation && (
              <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
                <LocateFixed className="size-3.5" />
                GPS client à collecter
              </p>
            )}
          </div>
          <div className="p-4">
            <StopNavLinks stop={nextStop} />
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">À encaisser</span>
              <strong className="num font-semibold">{formatMoney(nextStop.amountToCollect)}</strong>
            </div>
            <Button size="touch" onClick={() => onTreat(nextStop)} disabled={!canTreat} className="mt-4 w-full">
              Traiter cet arrêt
              <ChevronRight />
            </Button>
          </div>
        </Card>
      ) : remaining === 0 && routeData.stops.length > 0 ? (
        <Card density="touch" className="p-6 text-center">
          <Check className="mx-auto size-9 text-emerald-600" />
          <h2 className="mt-3 t-section">Tournée traitée</h2>
          <p className="mt-1 t-body text-muted-foreground">Tous les arrêts de cette tournée sont clôturés.</p>
        </Card>
      ) : null}

      <Card density="touch" className="p-4">
        <h2 className="t-section">Arrêts</h2>
        <ol className="mt-3 space-y-2">
          {routeData.stops.map((stop, index) => {
            const visual = getStopVisualStyle(stop.status);
            const completed = isStopCompleted(stop);
            return (
              <li key={stop.deliveryNote} className="flex items-center gap-2 rounded-xl border border-hairline p-2">
                <button
                  type="button"
                  disabled={!canTreat || completed}
                  onClick={() => onTreat(stop)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left transition-colors disabled:opacity-60"
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
                <StopNavLinks stop={stop} compact />
              </li>
            );
          })}
        </ol>
      </Card>
    </>
  );
}

export function DriverApp() {
  const [tab, setTab] = useState<DriverTab>("route");
  const [selectedStop, setSelectedStop] = useState<RouteStop>();
  const [scanValue, setScanValue] = useState("");
  const [message, setMessage] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [verified, setVerified] = useState<string[]>([]);
  const [highlightedNote, setHighlightedNote] = useState<string>();
  const [confirmKind, setConfirmKind] = useState<"load" | "start" | null>(null);
  const [pendingCount, setPendingCount] = useState(() => readPendingOperations().length);
  const { logout } = useFrappeAuth();
  const today = localDate();
  const { data, error, isLoading, mutate } = useDriverRoutes(today);
  const { data: dashboardData, error: dashboardError, isLoading: dashboardLoading, mutate: mutateDashboard } =
    useDriverDashboard(today);
  const actions = useDistributionMutations();
  const routes = useMemo(() => data?.message || [], [data?.message]);
  const routeData = routes.find((route) => route.name === selectedRouteId) || routes[0];
  const completeStopRef = useRef(actions.completeStop);
  const mutateRef = useRef(mutate);
  const mutateDashboardRef = useRef(mutateDashboard);

  useEffect(() => {
    completeStopRef.current = actions.completeStop;
  }, [actions.completeStop]);
  useEffect(() => {
    mutateRef.current = mutate;
  }, [mutate]);
  useEffect(() => {
    mutateDashboardRef.current = mutateDashboard;
  }, [mutateDashboard]);

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
    setMessage(
      customerLocationUpdated
        ? "Opérations synchronisées et localisation client enregistrée."
        : "Les opérations en attente ont été synchronisées.",
    );
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
    const online = () => {
      void retryPending();
    };
    window.addEventListener("online", online);
    if (navigator.onLine) void retryPending();
    return () => window.removeEventListener("online", online);
  }, [retryPending]);

  const nextStop = useMemo(
    () => routeData?.stops.find((stop) => !isStopCompleted(stop)),
    [routeData],
  );
  const completedStops = useMemo(
    () => routeData?.stops.filter((stop) => isStopCompleted(stop)) || [],
    [routeData],
  );
  const doneCount = completedStops.length;
  const totalStops = routeData?.stops.length || 0;
  const vehicleLabel = routeData?.vehicleLabel || dashboardData?.message?.driver?.vehicle || "";

  useEffect(() => {
    if (!routeData) {
      setVerified([]);
      return;
    }
    setVerified(readVerifiedNotes(routeData.name, routeData.revision));
    setHighlightedNote(undefined);
    setConfirmKind(null);
    setSelectedStop(undefined);
  }, [routeData?.name, routeData?.revision]);

  const persistVerified = useCallback(
    (notes: string[]) => {
      if (!routeData) return;
      setVerified(notes);
      writeVerifiedNotes(routeData.name, routeData.revision, notes);
    },
    [routeData],
  );

  const start = async () => {
    if (!routeData) return;
    try {
      await actions.startRoute(routeData.name, routeData.revision);
      setConfirmKind(null);
      setMessage("Tournée démarrée.");
      await refresh();
    } catch (startError) {
      setMessage(apiErrorMessage(startError));
    }
  };
  const load = async () => {
    if (!routeData) return;
    try {
      await actions.loadRoute(routeData.name, routeData.revision, verified);
      setConfirmKind(null);
      setMessage("Marchandise chargée. Déclarez le départ pour livrer et encaisser.");
      await refresh();
    } catch (loadError) {
      setMessage(apiErrorMessage(loadError));
    }
  };
  const acknowledge = async () => {
    if (!routeData) return;
    try {
      await actions.acknowledgeRoute(routeData.name, routeData.publishedRevision);
      setMessage("Révision acceptée. Vérifiez ensuite chaque bon de livraison.");
      await refresh();
    } catch (ackError) {
      setMessage(apiErrorMessage(ackError));
    }
  };
  const scan = () => {
    if (!routeData) return;
    const proposal = proposeScanAction(routeData, scanValue, verified);
    setScanValue("");
    setTab("route");
    setMessage(proposal.message);
    setHighlightedNote(proposal.stop?.deliveryNote);
    if (proposal.verifiedNotes) persistVerified(proposal.verifiedNotes);
    if (proposal.kind === "load") setConfirmKind("load");
    else if (proposal.kind === "start") setConfirmKind("start");
    else setConfirmKind(null);
    if (proposal.kind === "treat" && proposal.stop) setSelectedStop(proposal.stop);
    else setSelectedStop(undefined);
  };
  const declareReturn = async () => {
    if (!routeData) return;
    try {
      await actions.declareRouteReturn(routeData.name, routeData.revision);
      setMessage("Retour déclaré. Le préparateur doit maintenant recompter et confirmer la marchandise.");
      await refresh();
    } catch (returnError) {
      setMessage(apiErrorMessage(returnError));
    }
  };
  const onStopDone = async (result: StopCompletionResult) => {
    const parts = ["Arrêt validé."];
    if (result.accounting?.salesInvoice) parts.push(`Facture ${result.accounting.salesInvoice} créée.`);
    if (result.customerLocationUpdated) parts.push("Localisation client enregistrée.");
    setMessage(parts.join(" "));
    await refresh();
  };

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-surface-subtle pb-24 text-foreground">
      <header className="sticky top-0 z-30 bg-brand-600 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-white p-1.5">
            <BrandLogo compact className="h-7 w-7" alt="IntraPro Distribution" />
          </div>
          <div className="min-w-0 flex-1">
            {routeData ? (
              <>
                <p className="num truncate text-sm font-semibold tracking-tight">
                  {doneCount}/{totalStops}
                  {vehicleLabel ? ` · ${vehicleLabel}` : ""}
                </p>
                <p className="truncate t-meta text-brand-100">
                  {routeData.lifecycle} · {routeData.name}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold tracking-tight">Tournée</p>
                <p className="t-meta text-brand-100">Aucune tournée publiée</p>
              </>
            )}
          </div>
          {pendingCount > 0 ? (
            <span className="num rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">
              {pendingCount}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => logout().then(() => window.location.reload())}
            aria-label="Se déconnecter"
            className="grid size-11 place-items-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
          >
            <LogOut className="size-4" />
          </button>
        </div>
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

        {tab !== "bilan" && error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {apiErrorMessage(error)}
          </div>
        )}

        {tab === "bilan" && (
          <DriverDashboard
            data={dashboardData?.message}
            loading={dashboardLoading}
            error={dashboardError}
            onRefresh={() => void mutateDashboard()}
            completedStops={completedStops}
          />
        )}

        {tab !== "bilan" && isLoading && (
          <div className="space-y-3" aria-busy="true" aria-label="Chargement de la tournée">
            <Skeleton className="h-48 rounded-touch" />
            <Skeleton className="h-32 rounded-touch" />
          </div>
        )}

        {tab !== "bilan" && !isLoading && !routeData && (
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

        {tab !== "bilan" && routes.length > 1 && (
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

        {routeData && tab === "route" && routeData.lifecycle === "Publiée" && (
          <DepartureBoard
            route={routeData}
            verified={verified}
            highlightedNote={highlightedNote}
            saving={actions.saving}
            onToggle={(deliveryNote) => {
              const next = verified.includes(deliveryNote)
                ? verified.filter((note) => note !== deliveryNote)
                : [...verified, deliveryNote];
              persistVerified(next);
              setHighlightedNote(deliveryNote);
            }}
            onAcknowledge={() => void acknowledge()}
            onRequestLoad={() => setConfirmKind("load")}
            onRequestStart={() => setConfirmKind("start")}
          />
        )}

        {routeData && tab === "route" && routeData.lifecycle !== "Publiée" && (
          <RouteNowView
            routeData={routeData}
            nextStop={nextStop}
            fulfillment={actions.fulfillment}
            onDeclareReturn={() => void declareReturn()}
            onTreat={setSelectedStop}
          />
        )}

        {routeData && tab === "scanner" && (
          <Card density="touch" className="p-5 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-touch bg-brand-50 text-brand-700">
              <ScanLine className="size-7" />
            </span>
            <h2 className="mt-4 text-xl font-semibold tracking-tight">Scanner un BL</h2>
            <p className="mt-2 t-body text-muted-foreground">Saisissez ou scannez l’identifiant imprimé sur le bon.</p>
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
      </main>

      <nav
        aria-label="Navigation livreur"
        className="fixed inset-x-0 bottom-0 z-40 mx-auto grid h-20 max-w-xl grid-cols-3 border-t border-hairline bg-white px-2 pb-[env(safe-area-inset-bottom)]"
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

      {selectedStop && routeData && routeData.lifecycle === "En cours" && (
        <StopCompletionWizard
          stop={selectedStop}
          routeId={routeData.name}
          routeRevision={routeData.revision}
          onDone={onStopDone}
          onClose={() => setSelectedStop(undefined)}
          onPending={() => setPendingCount(readPendingOperations().length)}
        />
      )}

      {confirmKind === "load" && (
        <ConfirmActionDialog
          title="Charger le véhicule"
          description="Transférer la marchandise dans le véhicule ?"
          confirmLabel="Confirmer le chargement"
          saving={actions.saving}
          onConfirm={() => void load()}
          onClose={() => setConfirmKind(null)}
        />
      )}

      {confirmKind === "start" && (
        <ConfirmActionDialog
          title="Démarrer la tournée"
          description="Démarrer la tournée ? Vous pourrez alors livrer et encaisser."
          confirmLabel="Démarrer"
          saving={actions.saving}
          onConfirm={() => void start()}
          onClose={() => setConfirmKind(null)}
        />
      )}
    </div>
  );
}
