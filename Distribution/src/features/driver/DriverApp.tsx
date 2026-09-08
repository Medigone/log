import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrappeAuth } from "frappe-react-sdk";
import {
  Check,
  ChevronLeft,
  LogOut,
  RefreshCw,
  ScanLine,
  Truck,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  apiErrorMessage,
  useDistributionMutations,
  useDriverDashboard,
  useDriverRoute,
  useDriverRouteBoard,
} from "@/shared/api/distribution";
import { BrandLogo } from "@/shared/ui/BrandLogo";
import { goToLanding } from "@/shared/session";
import {
  clearPendingOperations,
  confirmOperation,
  markOperationAttempt,
  readPendingOperations,
} from "@/shared/persistence/pendingOperations";
import type { DistributionRoute, RouteStop, StopCompletionResult } from "@/shared/types/distribution";
import { CashHandoverSummary, CashHandoverSkeleton } from "@/features/driver/CashHandoverSummary";
import { DepartureBoard, departureStep } from "@/features/driver/DepartureBoard";
import { DriverRouteList } from "@/features/driver/DriverRouteList";
import { DriverTabBar, type DriverTab } from "@/features/driver/DriverTabBar";
import { RouteMapTab } from "@/features/driver/RouteMapTab";
import { RouteProgressBar } from "@/features/driver/RouteProgressBar";
import { StopCompletionWizard } from "@/features/driver/StopCompletionWizard";
import { CompletedStopsTimeline } from "@/features/driver/StopTimeline";
import { RemainingStopsList } from "@/features/driver/RemainingStopsList";
import {
  proposeScanAction,
  readVerifiedNotes,
  writeVerifiedNotes,
} from "@/features/driver/departureWorkflow";
import { isStopCompleted, stopFormKey } from "@/features/driver/stopHelpers";
import { remainingVisits, routeVisits } from "@/features/driver/visitHelpers";
import { formatDriverMoney, routeProgress } from "@/features/driver/driverMobile";
import { formatTime } from "@/shared/format";
import { cn } from "@/lib/utils";

type RouteListTab = "programmed" | "history";

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function DepartureControlHeader({ route }: { route: DistributionRoute }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[15px] font-semibold tracking-tight">Contrôle départ</p>
      <p className="num truncate text-xs text-white/70">
        {route.name} · rév. {route.publishedRevision} {route.acknowledged ? "acceptée" : "à accepter"}
      </p>
    </div>
  );
}

function DepartureStepper({ step }: { step: 1 | 2 | 3 }) {
  const items = [
    { n: 1, label: "Vérifier" },
    { n: 2, label: "Charger" },
    { n: 3, label: "Départ" },
  ] as const;
  return (
    <div className="mt-3 flex gap-1.5" aria-label="Étapes du départ">
      {items.map((item) => {
        const active = item.n === step;
        const done = item.n < step;
        return (
          <div key={item.n} className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={cn("h-[3px] rounded-sm", active || done ? "bg-white" : "bg-white/20")} />
            <span className={cn("truncate text-xs font-semibold", active || done ? "text-white" : "text-white/45")}>
              {item.n} · {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DriverRouteStats({ route }: { route: DistributionRoute }) {
  const progress = routeProgress(routeVisits(route));
  const end = formatTime(route.plannedEnd);
  const remaining =
    progress.remaining === 0
      ? "Tous les arrêts sont traités"
      : progress.remaining === 1
        ? "1 arrêt restant"
        : `${progress.remaining} arrêts restants`;
  return (
    <div className="flex min-w-0 items-end gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="num text-[26px] leading-none font-medium tracking-tight">
            {progress.done} / {progress.total}
          </p>
          {route.lifecycle === "En cours" ? (
            <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-semibold">En cours</span>
          ) : (
            <span className="truncate text-xs text-white/70">{route.lifecycle}</span>
          )}
        </div>
        <p className="mt-1 truncate text-xs text-white/70">
          {remaining}
          {end && end !== "—" ? ` · fin estimée ${end}` : ""}
        </p>
      </div>
      <div className="text-right">
        <p className="num whitespace-nowrap text-sm font-medium">{formatDriverMoney(progress.collectedAmount)}</p>
        <p className="text-xs text-white/55">encaissé</p>
      </div>
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
  selectingStop,
  onDeclareReturn,
  onTreat,
}: {
  routeData: DistributionRoute;
  nextStop?: RouteStop;
  fulfillment: boolean;
  selectingStop?: boolean;
  onDeclareReturn: () => void;
  onTreat: (stop: RouteStop) => void;
}) {
  const canTreat = routeData.lifecycle === "En cours";
  const remaining = remainingVisits(routeVisits(routeData));

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

      {remaining.length === 0 && routeData.stops.length > 0 && !nextStop ? (
        <Card density="touch" className="p-6 text-center">
          <Check className="mx-auto size-9 text-emerald-600" />
          <h2 className="mt-3 t-section">Tournée traitée</h2>
          <p className="mt-1 t-body text-muted-foreground">Tous les arrêts de cette tournée sont clôturés.</p>
        </Card>
      ) : null}

      <RemainingStopsList
        stops={remaining}
        canTreat={canTreat}
        selecting={selectingStop}
        onSelect={onTreat}
      />
      <CompletedStopsTimeline stops={routeVisits(routeData)} />
    </>
  );
}

export function DriverApp() {
  const [tab, setTab] = useState<DriverTab>("route");
  const [listTab, setListTab] = useState<RouteListTab>("programmed");
  const [selectedStop, setSelectedStop] = useState<RouteStop>();
  const [scanValue, setScanValue] = useState("");
  const [message, setMessage] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [openRouteId, setOpenRouteId] = useState("");
  const [verified, setVerified] = useState<string[]>([]);
  const [highlightedNote, setHighlightedNote] = useState<string>();
  const [confirmKind, setConfirmKind] = useState<"load" | "start" | null>(null);
  const [pendingCount, setPendingCount] = useState(() => readPendingOperations().length);
  const { logout } = useFrappeAuth();
  const today = localDate();
  const { data, error, isLoading, mutate } = useDriverRouteBoard(today);
  const { data: dashboardData, mutate: mutateDashboard } = useDriverDashboard(today);
  const actions = useDistributionMutations();
  const programmed = useMemo(() => data?.message?.programmed || [], [data?.message]);
  const history = useMemo(() => data?.message?.history || [], [data?.message]);
  const bilanRouteId =
    programmed.find((route) => route.name === selectedRouteId)?.name
    || programmed[0]?.name
    || dashboardData?.message?.routes[0]?.name
    || history[0]?.name
    || "";
  const fetchRouteId = (() => {
    const id = openRouteId || (tab === "bilan" ? bilanRouteId : "");
    if (!id || programmed.some((route) => route.name === id)) return undefined;
    return id;
  })();
  const { data: fetchedRouteData, isLoading: historyRouteLoading, mutate: mutateOpenRoute } = useDriverRoute(fetchRouteId);
  const fetchedRoute =
    fetchRouteId && fetchedRouteData?.message?.name === fetchRouteId ? fetchedRouteData.message : undefined;
  const detailRoute = programmed.find((route) => route.name === openRouteId) || (openRouteId ? fetchedRoute : undefined);
  const showingList = tab === "route" && !openRouteId;
  const showDetail = tab === "route" && Boolean(openRouteId);
  const routeData =
    (openRouteId ? detailRoute : undefined)
    || programmed.find((route) => route.name === selectedRouteId)
    || programmed[0]
    || (tab === "bilan" ? fetchedRoute : undefined);
  const completeStopRef = useRef(actions.completeStop);
  const mutateRef = useRef(mutate);
  const mutateDashboardRef = useRef(mutateDashboard);
  const mutateOpenRouteRef = useRef(mutateOpenRoute);

  useEffect(() => {
    completeStopRef.current = actions.completeStop;
  }, [actions.completeStop]);
  useEffect(() => {
    mutateRef.current = mutate;
  }, [mutate]);
  useEffect(() => {
    mutateDashboardRef.current = mutateDashboard;
  }, [mutateDashboard]);
  useEffect(() => {
    mutateOpenRouteRef.current = mutateOpenRoute;
  }, [mutateOpenRoute]);

  const refresh = useCallback(async () => {
    await Promise.all([mutate(), mutateDashboard(), mutateOpenRouteRef.current?.()]);
  }, [mutate, mutateDashboard]);

  useEffect(() => {
    if (programmed.length && !programmed.some((route) => route.name === selectedRouteId) && !openRouteId) {
      setSelectedRouteId(programmed[0].name);
    }
  }, [programmed, selectedRouteId, openRouteId]);

  const openRoute = useCallback((routeId: string) => {
    setSelectedRouteId(routeId);
    setOpenRouteId(routeId);
  }, []);

  const closeRoute = useCallback(() => {
    setOpenRouteId("");
    setSelectedStop(undefined);
    setConfirmKind(null);
  }, []);

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
        localStorage.removeItem(
          stopFormKey(operation.payload.routeId, operation.payload.visitKey || operation.payload.deliveryNote),
        );
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
      localStorage.removeItem(
        stopFormKey(operation.payload.routeId, operation.payload.visitKey || operation.payload.deliveryNote),
      );
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
    () => (routeData ? remainingVisits(routeVisits(routeData))[0] : undefined),
    [routeData],
  );
  const departureMode = showDetail && routeData?.lifecycle === "Publiée";
  const controlStep = routeData ? departureStep(routeData, verified) : 1;

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

  const chooseStop = async (stop: RouteStop) => {
    if (!routeData || routeData.lifecycle !== "En cours" || isStopCompleted(stop)) return;
    try {
      await actions.selectNextDeliveryStop(routeData.name, stop.deliveryNote, routeData.revision);
      await refresh();
    } catch (selectError) {
      setMessage(apiErrorMessage(selectError));
    }
    setSelectedStop(stop);
  };

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
    setSelectedRouteId(routeData.name);
    setOpenRouteId(routeData.name);
    setTab("route");
    setMessage(proposal.message);
    setHighlightedNote(proposal.stop?.deliveryNote);
    if (proposal.verifiedNotes) persistVerified(proposal.verifiedNotes);
    if (proposal.kind === "load") setConfirmKind("load");
    else if (proposal.kind === "start") setConfirmKind("start");
    else setConfirmKind(null);
    if (proposal.kind === "treat" && proposal.stop) void chooseStop(proposal.stop);
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
    <div
      className={cn(
        "mx-auto flex max-w-xl flex-col bg-surface-subtle text-foreground",
        tab === "map" || departureMode
          ? "h-svh overflow-hidden pb-20"
          : tab === "bilan"
            ? "min-h-screen pb-20"
            : "min-h-screen pb-24",
      )}
    >
      {tab !== "bilan" ? (
        <header className="sticky top-0 z-30 shrink-0 bg-brand-600 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="flex items-start gap-3">
          {showDetail ? (
            <button
              type="button"
              onClick={closeRoute}
              aria-label="Retour aux tournées"
              className="grid size-11 place-items-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
            >
              <ChevronLeft className="size-5" />
            </button>
          ) : (
            <div className="rounded-lg bg-white p-1.5">
              <BrandLogo compact className="h-7 w-7" alt="IntraPro Distribution" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {showingList ? (
              <>
                <p className="text-sm font-semibold tracking-tight">Tournées</p>
                <p className="t-meta text-brand-100">
                  {programmed.length
                    ? `${programmed.length} programmée${programmed.length > 1 ? "s" : ""}`
                    : "Aucune tournée programmée"}
                </p>
              </>
            ) : showDetail && routeData?.lifecycle === "Publiée" ? (
              <DepartureControlHeader route={routeData} />
            ) : routeData ? (
              <DriverRouteStats route={routeData} />
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
            onClick={() => logout().then(() => goToLanding())}
            aria-label="Se déconnecter"
            className="grid size-11 place-items-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
          >
            <LogOut className="size-4" />
          </button>
        </div>
        {departureMode && routeData ? (
          <DepartureStepper step={controlStep} />
        ) : (showDetail || tab === "map") && routeData?.stops.length ? (
          <RouteProgressBar stops={routeData.stops} className="mt-3" />
        ) : null}
        </header>
      ) : null}

      <main
        className={cn(
          tab === "map" || departureMode
            ? "relative flex min-h-0 flex-1 flex-col overflow-hidden"
            : tab === "bilan"
              ? "flex min-h-0 flex-1 flex-col"
              : "space-y-4 p-4",
        )}
      >
        <div className={tab === "map" || departureMode ? "shrink-0 space-y-2 px-4 pt-3" : "contents"}>
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
        </div>

        {tab === "bilan" && (fetchRouteId && historyRouteLoading && !routeData ? (
          <CashHandoverSkeleton />
        ) : (
          <CashHandoverSummary
            route={routeData}
            cashBoxValidated={
              routeData
                ? routeData.cash.status === "Validée"
                : dashboardData?.message?.cash.status === "Validée"
            }
            onOpenHistory={() => {
              closeRoute();
              setListTab("history");
              setTab("route");
            }}
            weeklyDeliveryCount={dashboardData?.message?.week.deliveredStops}
            onLogout={() => logout().then(() => goToLanding())}
          />
        ))}

        {showingList && (
          <DriverRouteList
            programmed={programmed}
            history={history}
            loading={isLoading}
            tab={listTab}
            onTabChange={setListTab}
            onSelect={openRoute}
          />
        )}

        {showDetail && historyRouteLoading && !detailRoute && (
          <div className="space-y-3" aria-busy="true" aria-label="Chargement de la tournée">
            <Skeleton className="h-48 rounded-touch" />
            <Skeleton className="h-32 rounded-touch" />
          </div>
        )}

        {tab === "scanner" && isLoading && !routeData && (
          <div className="space-y-3" aria-busy="true" aria-label="Chargement de la tournée">
            <Skeleton className="h-48 rounded-touch" />
            <Skeleton className="h-32 rounded-touch" />
          </div>
        )}

        {tab === "scanner" && !isLoading && !routeData && (
          <Card density="touch" className="p-8 text-center">
            <Truck className="mx-auto size-9 text-subtle" />
            <h2 className="mt-3 t-section">Aucune tournée programmée</h2>
            <p className="mt-2 t-body text-muted-foreground">Ouvrez une tournée pour scanner un bon de livraison.</p>
          </Card>
        )}

        {showDetail && routeData && routeData.lifecycle === "Publiée" && (
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
            onScan={() => setTab("scanner")}
          />
        )}

        {showDetail && routeData && routeData.lifecycle !== "Publiée" && (
          <RouteNowView
            routeData={routeData}
            nextStop={nextStop}
            fulfillment={actions.fulfillment}
            selectingStop={actions.selectingStop}
            onDeclareReturn={() => void declareReturn()}
            onTreat={(stop) => void chooseStop(stop)}
          />
        )}

        {tab === "map" && routeData && (
          <div className="min-h-0 flex-1">
            <RouteMapTab
              route={routeData}
              canTreat={routeData.lifecycle === "En cours"}
              onOpenStop={(stop) => {
                if (routeData.lifecycle === "En cours" && !isStopCompleted(stop)) void chooseStop(stop);
              }}
            />
          </div>
        )}

        {tab === "map" && !isLoading && !routeData && (
          <Card density="touch" className="p-8 text-center">
            <Truck className="mx-auto size-9 text-subtle" />
            <h2 className="mt-3 t-section">Aucune tournée programmée</h2>
            <p className="mt-2 t-body text-muted-foreground">Ouvrez une tournée pour voir la carte des arrêts.</p>
          </Card>
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

      <DriverTabBar
        tab={tab}
        onSelect={(next) => {
          if (next === "route" && tab === "route" && openRouteId) {
            closeRoute();
            return;
          }
          setTab(next);
          if (next === "bilan") void refresh();
        }}
      />

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
