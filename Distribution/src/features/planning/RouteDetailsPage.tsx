import { useMemo, useState, type ComponentType, type ReactNode } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { RouteMap } from "@/features/planning/RouteMap";
import { printRouteLabels } from "@/features/planning/qrPrinting";
import { getStopVisualStyle, type StopVisualState } from "@/features/planning/stopStatus";
import { apiErrorMessage, useDistributionMutations, useRouteDetails } from "@/shared/api/distribution";
import { routeLifecycleTone, TONES, type StatusTone } from "@/shared/design/statusTone";
import { formatDistance, formatMoney, formatShortDate, formatTime } from "@/shared/format";
import type { RouteOptimizationProposal, RouteStop } from "@/shared/types/distribution";

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

function StopStatusIcon({ state }: { state: StopVisualState }) {
  if (state === "delivered") return <Check className="size-3.5" aria-hidden="true" />;
  if (state === "partial") return <AlertTriangle className="size-3.5" aria-hidden="true" />;
  if (state === "failed" || state === "cancelled") return <X className="size-3.5" aria-hidden="true" />;
  if (state === "active") return <Navigation className="size-3.5" aria-hidden="true" />;
  return <Clock3 className="size-3.5" aria-hidden="true" />;
}

/** Petite tuile chiffrée à l'intérieur d'une carte (stock, caisse). */
function MiniStat({ label, value, tone = "neutral" }: { label: string; value: ReactNode; tone?: StatusTone }) {
  const style = TONES[tone];
  return (
    <div className={`rounded-md p-2.5 ${tone === "neutral" ? "bg-surface-subtle" : style.surface} border`}>
      <p className={`t-micro ${tone === "neutral" ? "text-muted-foreground" : style.text}`}>{label}</p>
      <p className={`num mt-1 text-sm font-semibold ${tone === "neutral" ? "text-foreground" : style.text}`}>{value}</p>
    </div>
  );
}

/** Compteur d'arrêts par état, sous la barre de progression. */
function CountChip({
  tone,
  icon: Icon,
  count,
  label,
}: {
  tone: StatusTone;
  icon: ComponentType<{ className?: string }>;
  count: number;
  label: string;
}) {
  const style = TONES[tone];
  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${style.surface} ${style.text}`}>
      <span className={`grid size-6 shrink-0 place-items-center rounded-full ${style.solid}`}>
        <Icon className="size-3.5" />
      </span>
      <span>
        <strong className="num font-semibold">{count}</strong> {label}
      </span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-5" aria-label="Chargement de la tournée">
      <Skeleton className="h-20" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}

function StopQr({ stop, onGenerate, generating }: { stop: RouteStop; onGenerate: () => void; generating: boolean }) {
  if (!stop.qrCode) {
    return (
      <div className="grid min-h-40 place-items-center rounded-md border border-dashed border-amber-300 bg-amber-50 p-4 text-center">
        <div>
          <QrCode className="mx-auto size-8 text-amber-700" />
          <p className="mt-2 text-sm font-semibold text-amber-950">QR manquant</p>
          <Button size="sm" variant="outline" onClick={onGenerate} disabled={generating} className="mt-3 bg-white">
            {generating ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Générer
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-hairline bg-white p-3 text-center">
      <img src={stop.qrCode} alt={`QR du BL ${stop.deliveryNote}`} className="mx-auto size-36 object-contain" />
      <p className="num mt-2 t-meta text-muted-foreground">{Math.max(stop.packageCount || 1, 1)} étiquette(s)</p>
    </div>
  );
}

function PublishConfirmationDialog({
  routeName,
  stopCount,
  missingGpsCount,
  publishing,
  error,
  onClose,
  onConfirm,
}: {
  routeName: string;
  stopCount: number;
  missingGpsCount: number;
  publishing: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && !publishing && onClose()}>
      <DialogContent>
        <DialogHeader>
          <p className="t-micro text-brand-700">Confirmation requise</p>
          <DialogTitle>Publier la tournée</DialogTitle>
          <DialogDescription>
            La tournée {routeName} contient {stopCount} arrêt(s).
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="rounded-md border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900">
            Après publication, le livreur devra accepter la révision avant de pouvoir démarrer la tournée.
          </div>
          {missingGpsCount > 0 && (
            <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                <strong className="font-semibold">{missingGpsCount} client(s) sans GPS.</strong> L’itinéraire ne pourra
                pas être calculé et le livreur devra collecter leur position.
              </p>
            </div>
          )}
          {error && (
            <div role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="size-4 shrink-0" />
              {error}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={publishing}>
            Annuler
          </Button>
          <Button onClick={onConfirm} disabled={publishing}>
            {publishing ? <LoaderCircle className="animate-spin" /> : <Send />}
            {publishing ? "Publication en cours…" : "Confirmer et publier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const improved = distanceGain > 0 || durationGain > 0;

  return (
    <Dialog open onOpenChange={(open) => !open && !applying && onClose()}>
      <DialogContent size="max-w-3xl">
        <DialogHeader>
          <p className="t-micro text-brand-700">Proposition OpenRouteService</p>
          <DialogTitle>Comparer l’ordre des arrêts</DialogTitle>
          <DialogDescription>Aucune modification ne sera faite avant votre confirmation.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-lg border border-hairline p-4">
              <p className="t-micro text-muted-foreground">Ordre actuel</p>
              <p className="num mt-2 t-section">
                {formatDistance(proposal.current.distanceMeters)} · {formatDuration(totalDuration(proposal.current))} au
                total
              </p>
              <p className="num mt-1 t-meta text-muted-foreground">
                Conduite {formatDuration(proposal.current.durationSeconds)} + arrêts{" "}
                {formatDuration(proposal.current.stopDurationSeconds)}
              </p>
              <ol className="mt-3 space-y-1 text-sm text-slate-600">
                {proposal.currentOrder.map((name, index) => (
                  <li key={name}>
                    {index + 1}. {name}
                  </li>
                ))}
              </ol>
            </article>
            <article className="rounded-lg border border-brand-200 bg-brand-50 p-4">
              <p className="t-micro text-brand-700">Ordre proposé</p>
              <p className="num mt-2 t-section text-brand-900">
                {formatDistance(proposal.optimized.distanceMeters)} ·{" "}
                {formatDuration(totalDuration(proposal.optimized))} au total
              </p>
              <p className="num mt-1 t-meta text-brand-700">
                Conduite {formatDuration(proposal.optimized.durationSeconds)} + arrêts{" "}
                {formatDuration(proposal.optimized.stopDurationSeconds)}
              </p>
              <ol className="mt-3 space-y-1 text-sm text-brand-900">
                {proposal.optimizedOrder.map((name, index) => (
                  <li key={name}>
                    {index + 1}. {name}
                  </li>
                ))}
              </ol>
            </article>
          </div>
          <div
            className={`rounded-md p-3 text-sm ${improved ? "bg-emerald-50 text-emerald-900" : "bg-surface-subtle text-slate-700"}`}
          >
            Gain estimé : <strong className="num font-semibold">{formatDistance(Math.max(distanceGain, 0))}</strong> et{" "}
            <strong className="num font-semibold">{formatDuration(Math.max(durationGain, 0))}</strong>.
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={applying}>
            Conserver l’ordre manuel
          </Button>
          <Button onClick={onApply} disabled={applying}>
            {applying ? <LoaderCircle className="animate-spin" /> : <Check />}
            Appliquer cet ordre
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RouteDetailsPage({ canResolveAccounting = false }: { canResolveAccounting?: boolean }) {
  const { routeId } = useParams();
  const navigate = useNavigate();
  const { data, error, isLoading, isValidating, mutate } = useRouteDetails(routeId);
  const actions = useDistributionMutations();
  const route = data?.message;
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [generatingQr, setGeneratingQr] = useState<string>();
  const [proposal, setProposal] = useState<RouteOptimizationProposal>();
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const [publishFailure, setPublishFailure] = useState("");
  const missingGps = useMemo(() => route?.stops.filter((stop) => stop.requiresCustomerGeolocation) || [], [route]);
  const missingQr = useMemo(() => route?.stops.filter((stop) => !stop.qrCode) || [], [route]);

  if (isLoading) return <DetailSkeleton />;
  if (error || !route) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
        <h1 className="t-section">Impossible d’ouvrir la tournée</h1>
        <p className="mt-2 t-body">{apiErrorMessage(error)}</p>
        <Button variant="outline" onClick={() => navigate("/planning")} className="mt-4">
          <ArrowLeft />
          Retour au planning
        </Button>
      </div>
    );
  }

  const publish = async () => {
    setFailure("");
    setNotice("");
    setPublishFailure("");
    try {
      await actions.publishRoute(route.name, route.revision);
      setConfirmingPublish(false);
      setNotice("Tournée publiée. Le livreur devra accepter cette révision avant le départ.");
      await mutate();
    } catch (publishError) {
      setPublishFailure(apiErrorMessage(publishError));
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

  const retryInvoice = async (deliveryNote: string) => {
    setFailure("");
    setNotice("");
    try {
      const result = await actions.retryDeliveryInvoice(deliveryNote);
      setNotice(result.salesInvoice ? `Facture ${result.salesInvoice} créée.` : "La relance de facturation reste en erreur.");
      await mutate();
    } catch (invoiceError) {
      setFailure(apiErrorMessage(invoiceError));
    }
  };

  const overCapacity = route.vehicleCapacity != null && route.totalQuantity > route.vehicleCapacity;
  const operationalAlerts = [
    ...route.alerts,
    ...(route.vehicle && route.vehicleCapacity == null ? ["La capacité maximale du véhicule n’est pas définie."] : []),
    ...(!route.depot ? ["Aucun dépôt principal exploitable n’est configuré."] : []),
    ...(missingGps.length ? [`${missingGps.length} client(s) sans GPS : position à collecter par le livreur.`] : []),
    ...(missingQr.length ? [`${missingQr.length} bon(s) sans QR imprimable.`] : []),
  ];
  const canRoute = Boolean(route.depot && route.stops.length && !missingGps.length);
  const stopCounts = route.stops.reduce<Record<StopVisualState, number>>(
    (counts, stop) => {
      counts[getStopVisualStyle(stop.status).state] += 1;
      return counts;
    },
    { delivered: 0, partial: 0, failed: 0, active: 0, cancelled: 0, pending: 0 },
  );
  const processedStops = stopCounts.delivered + stopCounts.partial + stopCounts.failed + stopCounts.cancelled;
  const progressPercent = route.stops.length ? Math.round((processedStops / route.stops.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={
          <button
            type="button"
            onClick={() => navigate("/planning")}
            className="inline-flex items-center gap-1.5 t-meta text-muted-foreground transition-colors hover:text-brand-700"
          >
            <ArrowLeft className="size-3.5" />
            Planification
          </button>
        }
        title={route.name}
        meta={
          <>
            <StatusBadge tone={routeLifecycleTone(route.lifecycle)}>{route.lifecycle}</StatusBadge>
            <span className="num t-meta font-medium text-muted-foreground">Révision {route.revision}</span>
          </>
        }
        description={
          ["En cours", "Retour dépôt", "Contrôle caisse", "Terminée"].includes(route.lifecycle)
            ? "Suivez les arrêts, le stock du véhicule, les factures et le contrôle des encaissements."
            : "Contrôlez les ressources, l’itinéraire et les étiquettes avant publication."
        }
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/planning")}>
              <Pencil />
              Modifier le planning
            </Button>
            <Button
              variant="outline"
              onClick={() => printRouteLabels(route)}
              disabled={route.stops.every((stop) => !stop.qrCode)}
            >
              <Printer />
              Imprimer les QR
            </Button>
            {route.lifecycle === "Brouillon" && (
              <Button
                onClick={() => {
                  setPublishFailure("");
                  setConfirmingPublish(true);
                }}
                disabled={actions.saving}
              >
                <Send />
                Publier la tournée
              </Button>
            )}
          </>
        }
      />

      {confirmingPublish && (
        <PublishConfirmationDialog
          routeName={route.name}
          stopCount={route.stops.length}
          missingGpsCount={missingGps.length}
          publishing={actions.saving}
          error={publishFailure}
          onClose={() => { setConfirmingPublish(false); setPublishFailure(""); }}
          onConfirm={() => void publish()}
        />
      )}

      {failure && (
        <div role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {failure}
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
      {operationalAlerts.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="flex items-center gap-2 t-section text-amber-950">
            <AlertTriangle className="size-4" />
            Points à vérifier
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {operationalAlerts.map((alert) => (
              <li key={alert}>• {alert}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          icon={CalendarDays}
          label="Date et créneau"
          value={route.date}
          hint={
            <span className="num">
              <Clock3 className="mr-1 inline size-3.5" />
              {formatTime(route.plannedStart)}–{formatTime(route.plannedEnd)}
            </span>
          }
        />
        <KpiTile icon={UserRound} label="Livreur" value={route.driverName || "Non affecté"} hint={route.driver || "—"} />
        <KpiTile
          icon={Truck}
          label="Véhicule"
          value={route.vehicleLabel || route.vehicle || "Non affecté"}
          tone={overCapacity ? "danger" : "neutral"}
          hint={
            route.vehicleCapacity == null
              ? `${route.totalQuantity} articles · capacité non définie`
              : `${route.totalQuantity} / ${route.vehicleCapacity} articles`
          }
        />
        <KpiTile
          icon={Banknote}
          label="Encaissements"
          tone="success"
          value={formatMoney(route.cash.declaredTotal)}
          hint={`${formatMoney(route.cash.validatedTotal)} comptabilisés`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Stock de la tournée</CardTitle>
              <p className="t-body text-muted-foreground">Suivi isolé du chargement de ce véhicule.</p>
            </div>
            <StatusBadge tone="info" size="sm">
              {route.stock.status}
            </StatusBadge>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat label="Chargé" value={route.stock.loadedQuantity} />
              <MiniStat label="Livré" value={route.stock.deliveredQuantity} tone="success" />
              <MiniStat label="Restant" value={route.stock.remainingQuantity} tone="warning" />
              <MiniStat label="Retourné" value={route.stock.returnedQuantity} tone="info" />
            </div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <p className="rounded-md border border-hairline p-3">
                <span className="block t-micro text-muted-foreground">Chargement</span>
                <strong className="font-medium">{route.stock.loadingStockEntry || "Non créé"}</strong>
              </p>
              <p className="rounded-md border border-hairline p-3">
                <span className="block t-micro text-muted-foreground">Retour</span>
                <strong className="font-medium">{route.stock.returnStockEntry || "Non créé"}</strong>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Contrôle de caisse</CardTitle>
              <p className="t-body text-muted-foreground">Déclarations du livreur et règlements comptables.</p>
            </div>
            <StatusBadge tone="success" size="sm">
              {route.cash.status}
            </StatusBadge>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat label="Espèces" value={formatMoney(route.cash.declaredCash)} />
              <MiniStat label="Chèques" value={formatMoney(route.cash.declaredCheques)} />
              <MiniStat label="Compté" value={formatMoney(route.cash.countedTotal)} tone="info" />
              <MiniStat label="Validé" value={formatMoney(route.cash.validatedTotal)} tone="success" />
            </div>
            {route.cash.discrepancyReason && (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <strong className="font-semibold">Écart :</strong> {route.cash.discrepancyReason}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {route.stops.length > 0 && (
        <Card aria-labelledby="route-progress-title">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div>
              <CardTitle id="route-progress-title">Progression terrain</CardTitle>
              <p className="t-body text-muted-foreground">
                <strong className="num font-semibold text-foreground">
                  {processedStops}/{route.stops.length}
                </strong>{" "}
                arrêt(s) traité(s)
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 t-meta text-subtle" aria-live="polite">
              <RefreshCw className={`size-3.5 ${isValidating ? "animate-spin" : ""}`} />
              {isValidating ? "Actualisation…" : "Mise à jour automatique"}
            </span>
          </CardHeader>
          <CardContent>
            <div
              role="progressbar"
              aria-label="Arrêts traités"
              aria-valuemin={0}
              aria-valuemax={route.stops.length}
              aria-valuenow={processedStops}
              className="h-2 overflow-hidden rounded-full bg-slate-100"
            >
              <div
                className="h-full rounded-full bg-emerald-600 transition-[width] duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <CountChip tone="success" icon={Check} count={stopCounts.delivered} label="livré(s)" />
              <CountChip tone="warning" icon={AlertTriangle} count={stopCounts.partial} label="partiel(s)" />
              <CountChip tone="danger" icon={X} count={stopCounts.failed} label="échec(s)" />
              <CountChip
                tone="neutral"
                icon={Clock3}
                count={stopCounts.pending + stopCounts.active}
                label="à faire"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Itinéraire de la tournée</CardTitle>
            <p className="t-body text-muted-foreground">
              Boucle dépôt–clients–dépôt suivant l’ordre officiel des arrêts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void calculateItinerary()} disabled={!canRoute || actions.routing}>
              <RefreshCw className={actions.routing ? "animate-spin" : ""} />
              Recalculer l’itinéraire
            </Button>
            {route.routing.optimizationEnabled && route.lifecycle === "Brouillon" && (
              <Button onClick={() => void optimize()} disabled={!canRoute || actions.routing}>
                <Route />
                Optimiser l’ordre
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <MiniStat
              label="Dépôt"
              value={
                <span className="truncate">
                  <Warehouse className="mr-1 inline size-4 text-brand-600" />
                  {route.depot?.label || "Non configuré"}
                </span>
              }
            />
            <MiniStat
              label="Distance routière"
              value={
                <>
                  <Navigation className="mr-1 inline size-4 text-brand-600" />
                  {formatDistance(route.routing.distanceMeters)}
                </>
              }
            />
            <MiniStat
              label="Temps de conduite"
              value={
                <>
                  <Navigation className="mr-1 inline size-4 text-brand-600" />
                  {formatDuration(route.routing.durationSeconds)}
                </>
              }
            />
            <MiniStat
              label="Temps aux arrêts"
              value={
                <>
                  <Clock3 className="mr-1 inline size-4 text-brand-600" />
                  {formatDuration(route.routing.stopDurationSeconds)}
                  <span className="ml-1 t-meta font-normal text-muted-foreground">
                    {route.routing.stopDurationMinutes ?? 0} min × {route.stops.length}
                  </span>
                </>
              }
            />
            <MiniStat
              tone="info"
              label="Durée totale estimée"
              value={
                <>
                  <Gauge className="mr-1 inline size-4" />
                  {formatDuration(route.routing.totalDurationSeconds)}
                </>
              }
            />
          </div>
          {route.routing.status !== "ready" && (
            <div className="mb-3 rounded-md border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900">
              Aucun tracé routier à jour. Les marqueurs restent visibles sans ligne droite; utilisez « Recalculer
              l’itinéraire ».
            </div>
          )}
          <RouteMap stops={route.stops} depot={route.depot} routing={route.routing} />
          <p className="num mt-2 t-meta text-subtle">
            {route.routing.calculatedAt
              ? `Dernier calcul : ${route.routing.calculatedAt}`
              : `${route.stops.length - missingGps.length}/${route.stops.length} arrêts localisés`}
          </p>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="t-section">Arrêts et bons de livraison</h2>
          <p className="t-body text-muted-foreground">Vérifiez les quantités, l’adresse et le QR de chaque BL.</p>
        </div>

        {route.stops.map((stop) => {
          const visual = getStopVisualStyle(stop.status);
          const plannedQuantity = stop.items?.reduce((sum, item) => sum + item.quantity, 0) ?? stop.totalQuantity;
          const deliveredQuantity = stop.items?.reduce((sum, item) => sum + item.deliveredQuantity, 0) ?? 0;
          const address =
            stop.address || [stop.commune, stop.wilaya].filter(Boolean).join(", ") || "Adresse non renseignée";

          return (
            <article
              key={stop.deliveryNote}
              aria-label={`Arrêt ${stop.sequence} · ${visual.label}`}
              data-stop-state={visual.state}
              className={`overflow-hidden rounded-lg border shadow-card transition-colors ${visual.cardClass}`}
            >
              <div className="grid gap-4 p-4 lg:grid-cols-[auto_minmax(0,1fr)_180px]">
                <span
                  className={`num grid size-9 place-items-center rounded-full text-sm font-semibold ${visual.sequenceClass}`}
                >
                  {visual.markerSymbol || stop.sequence}
                </span>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="t-section text-foreground">{stop.customerName}</h3>
                      <p className="text-sm font-medium text-brand-700">{stop.deliveryNote}</p>
                      {stop.requiresCustomerGeolocation && (
                        <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          <MapPin className="size-3" />
                          GPS client à collecter
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${visual.badgeClass}`}
                    >
                      <StopStatusIcon state={visual.state} />
                      {stop.status}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <p className="text-slate-600">
                      <MapPin className="mr-1 inline size-4" />
                      {address}
                    </p>
                    <p className="text-slate-600">
                      <PackageCheck className="mr-1 inline size-4" />
                      <span className="num">
                        {visual.processed
                          ? `${deliveredQuantity}/${plannedQuantity} article(s) livré(s)`
                          : `${plannedQuantity} article(s)`}{" "}
                        · {Math.max(stop.packageCount || 1, 1)} paquet(s)
                      </span>
                    </p>
                  </div>

                  {stop.latitude != null && stop.longitude != null && (
                    <a
                      target="_blank"
                      rel="noreferrer"
                      href={`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
                    >
                      Ouvrir la navigation
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}

                  <section
                    aria-label={`Paiement de l'arrêt ${stop.sequence}`}
                    className="mt-4 overflow-hidden rounded-md border border-hairline bg-white"
                  >
                    <div className="grid grid-cols-3 divide-x divide-hairline bg-surface-subtle">
                      <div className="p-3">
                        <p className="t-micro text-muted-foreground">Montant BL</p>
                        <p className="num mt-1 text-sm font-semibold">
                          {formatMoney(stop.amountCollected + stop.amountToCollect)}
                        </p>
                      </div>
                      <div className="p-3">
                        <p className="t-micro text-emerald-700">Encaissé</p>
                        <p className="num mt-1 text-sm font-semibold text-emerald-800">
                          {formatMoney(stop.amountCollected)}
                        </p>
                      </div>
                      <div className="p-3">
                        <p className="t-micro text-muted-foreground">Restant</p>
                        <p className="num mt-1 text-sm font-semibold">{formatMoney(stop.amountToCollect)}</p>
                      </div>
                    </div>
                    {stop.payments.length > 0 ? (
                      <div className="divide-y divide-hairline">
                        {stop.payments.map((payment) => (
                          <div
                            key={payment.name}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                          >
                            <span className="inline-flex items-center gap-2 font-medium text-slate-700">
                              <span className="grid size-7 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                                <Check className="size-4" />
                              </span>
                              {payment.method}
                              {payment.chequeNumber ? ` · ${payment.chequeNumber}` : ""}
                            </span>
                            <span className="text-right">
                              <strong className="num font-semibold text-emerald-800">
                                {formatMoney(payment.amount)}
                              </strong>
                              <span className="ml-2 t-meta text-subtle">
                                {payment.status}
                                {payment.paymentEntry ? ` · ${payment.paymentEntry}` : ""}
                              </span>
                              <span className="num block t-meta text-subtle">
                                {payment.collectionDate
                                  ? `encaissement ${formatShortDate(payment.collectionDate)}`
                                  : formatShortDate(payment.date)}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="px-3 py-2.5 t-meta text-muted-foreground">Aucun paiement saisi pour cet arrêt.</p>
                    )}
                  </section>

                  <section className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <p className="rounded-md bg-surface-subtle p-3">
                      <span className="block t-micro text-muted-foreground">Facture</span>
                      <strong className="font-medium">{stop.salesInvoice || "Non créée"}</strong>
                      <span
                        className={`mt-1 block t-meta ${stop.invoiceStatus === "Erreur" ? "text-red-700" : "text-muted-foreground"}`}
                      >
                        {stop.invoiceStatus}
                      </span>
                      {canResolveAccounting && stop.invoiceStatus === "Erreur" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actions.accounting}
                          onClick={() => void retryInvoice(stop.deliveryNote)}
                          className="mt-2"
                        >
                          <RefreshCw className={actions.accounting ? "animate-spin" : ""} />
                          Relancer
                        </Button>
                      )}
                    </p>
                    <p className="rounded-md bg-surface-subtle p-3">
                      <span className="block t-micro text-muted-foreground">Paiement comptable</span>
                      <strong className="font-medium">
                        {stop.payments.find((payment) => payment.paymentEntry)?.paymentEntry || "En attente caisse"}
                      </strong>
                    </p>
                  </section>

                  <div className="mt-4 overflow-hidden rounded-md border border-hairline">
                    <table className="w-full border-separate border-spacing-0" aria-label={`Articles du BL ${stop.deliveryNote}`}>
                      <thead>
                        <tr>
                          <th scope="col" className="t-micro border-b border-hairline bg-surface-subtle px-3 py-2 text-left text-muted-foreground">
                            Article
                          </th>
                          <th scope="col" className="t-micro w-20 border-b border-hairline bg-surface-subtle px-3 py-2 text-right text-muted-foreground">
                            Prévu
                          </th>
                          <th scope="col" className="t-micro w-20 border-b border-hairline bg-surface-subtle px-3 py-2 text-right text-muted-foreground">
                            Restant
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {stop.items?.map((item) => (
                          <tr key={item.name}>
                            <td className="truncate border-b border-hairline px-3 py-2 text-sm">
                              <strong className="font-medium">{item.itemCode}</strong>
                              <span className="ml-1 text-muted-foreground">{item.itemName}</span>
                            </td>
                            <td className="num border-b border-hairline px-3 py-2 text-right text-sm">{item.quantity}</td>
                            <td className="num border-b border-hairline px-3 py-2 text-right text-sm font-semibold">
                              {item.remainingQuantity}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-2">
                  <StopQr
                    stop={stop}
                    generating={generatingQr === stop.deliveryNote}
                    onGenerate={() => void generateQr(stop.deliveryNote)}
                  />
                  {stop.qrCode && (
                    <Button variant="outline" size="sm" onClick={() => printRouteLabels(route, [stop])} className="w-full">
                      <Printer />
                      Imprimer ce QR
                    </Button>
                  )}
                </div>
              </div>
            </article>
          );
        })}

        {!route.stops.length && (
          <div className="rounded-lg border border-dashed border-hairline-strong bg-card">
            <EmptyState
              icon={Box}
              title="Aucun arrêt"
              description="Revenez au planning pour affecter des BL."
            />
          </div>
        )}
      </section>
      {proposal && <OptimizationDialog proposal={proposal} applying={actions.routing} onClose={() => setProposal(undefined)} onApply={() => void applyOptimization()} />}
    </div>
  );
}
