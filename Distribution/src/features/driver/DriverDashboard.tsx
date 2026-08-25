import {
  Banknote,
  CheckCircle2,
  ChevronRight,
  Clock3,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Route,
  Wallet,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiErrorMessage } from "@/shared/api/distribution";
import { cashStatusTone, TONES, type StatusTone } from "@/shared/design/statusTone";
import { formatMoney } from "@/shared/format";
import type { DriverDashboardData, DriverDashboardNextStop } from "@/shared/types/distribution";

function clock(value?: string | null) {
  if (!value) return "--:--";
  const match = value.match(/(\d{2}:\d{2})/);
  return match?.[1] || "--:--";
}

function weekday(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
}

function stopAddress(stop: DriverDashboardNextStop) {
  return stop.address || [stop.commune, stop.wilaya].filter(Boolean).join(", ") || "Adresse non renseignée";
}

/** Tuile chiffrée, densité terrain : chiffres gros et contrastés. */
function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  tone: StatusTone;
}) {
  const style = TONES[tone];
  return (
    <Card density="touch" className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="t-micro text-muted-foreground">{label}</p>
        <span className={`grid size-8 place-items-center rounded-xl ${style.badge}`}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="num mt-3 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 t-meta text-muted-foreground">{hint}</p>
    </Card>
  );
}

/** Paire libellé / valeur dans une carte terrain. */
function TouchStat({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-subtle p-3">
      <dt className="t-meta text-muted-foreground">{label}</dt>
      <dd className="num mt-1 font-semibold">{value}</dd>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement du tableau de bord">
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-touch" />
        ))}
      </div>
      <Skeleton className="h-24 rounded-touch" />
      <Skeleton className="h-36 rounded-touch" />
    </div>
  );
}

export function DriverDashboard({
  data,
  loading,
  error,
  onRefresh,
  onOpenRoute,
}: {
  data?: DriverDashboardData;
  loading: boolean;
  error?: unknown;
  onRefresh: () => void;
  onOpenRoute: (deliveryNote?: string) => void;
}) {
  const kpis = data?.kpis;
  const cash = data?.cash;
  const week = data?.week;
  const nextStop = data?.nextStop;
  const planned = kpis?.plannedStops || 0;
  const progress = planned ? Math.round(((kpis?.completedStops || 0) / planned) * 100) : 0;
  const maxDelivered = Math.max(1, ...(week?.days.map((day) => day.deliveredStops) || [0]));
  const activeRoute =
    data?.routes.find((route) => ["Publiée", "En cours", "Retour dépôt"].includes(String(route.lifecycle))) ||
    data?.routes[0];
  const completed = kpis?.completedStops || 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="t-micro text-brand-700">Tableau de bord</p>
          <h2 className="t-section text-lg text-foreground">Votre journée</h2>
        </div>
        <Button variant="outline" onClick={onRefresh} disabled={loading} aria-label="Actualiser">
          {loading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
          Actualiser
        </Button>
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {apiErrorMessage(error)}
        </div>
      ) : null}

      {loading && !data ? <DashboardSkeleton /> : null}

      {data ? (
        <>
          <section aria-label="Indicateurs du jour" className="grid grid-cols-2 gap-3">
            <KpiCard
              label="Caisse"
              value={formatMoney(cash?.balance || 0)}
              hint={`Encaissé ${formatMoney(kpis?.amountCollected || 0)}`}
              icon={Wallet}
              tone="info"
            />
            <KpiCard
              label="Livraisons"
              value={`${kpis?.deliveredStops || 0} / ${planned}`}
              hint="Effectuées aujourd'hui"
              icon={CheckCircle2}
              tone="success"
            />
            <KpiCard
              label="Arrêts"
              value={`${completed} / ${planned}`}
              hint={`${kpis?.remainingStops || 0} restant${(kpis?.remainingStops || 0) > 1 ? "s" : ""}`}
              icon={MapPin}
              tone="info"
            />
            <KpiCard
              label="Planifié"
              value={formatMoney(kpis?.amountToCollect || 0)}
              hint={
                activeRoute ? `${clock(activeRoute.plannedStart)} → ${clock(activeRoute.plannedEnd)}` : "Aucune tournée"
              }
              icon={Clock3}
              tone="warning"
            />
          </section>

          <Card density="touch" className="p-4">
            <div className="flex items-center justify-between">
              <h3 className="t-section">Avancement</h3>
              <span className="num t-section text-brand-700">{progress}%</span>
            </div>
            <div
              role="progressbar"
              aria-label="Arrêts traités"
              aria-valuemin={0}
              aria-valuemax={planned}
              aria-valuenow={completed}
              className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"
            >
              <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 t-meta text-muted-foreground">
              {completed} arrêt{completed > 1 ? "s" : ""} traité{completed > 1 ? "s" : ""} sur {planned}
              {kpis?.failedStops ? ` · ${kpis.failedStops} non livré${kpis.failedStops > 1 ? "s" : ""}` : ""}
            </p>
          </Card>

          {activeRoute ? (
            <Card density="touch" className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="t-micro text-brand-700">Planifié aujourd'hui</p>
                  <h3 className="mt-1 t-section">{activeRoute.name}</h3>
                  <p className="num mt-1 t-body text-muted-foreground">
                    {clock(activeRoute.plannedStart)} – {clock(activeRoute.plannedEnd)}
                    {activeRoute.vehicleLabel ? ` · ${activeRoute.vehicleLabel}` : ""}
                  </p>
                </div>
                <StatusBadge tone="neutral" size="sm">
                  {activeRoute.lifecycle}
                </StatusBadge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <TouchStat label="Arrêts" value={`${activeRoute.stopsDone}/${activeRoute.stopsTotal}`} />
                <TouchStat label="Reste à encaisser" value={formatMoney(activeRoute.toCollect)} />
              </dl>
              <Button size="touch" onClick={() => onOpenRoute()} className="mt-4 w-full">
                Ouvrir la tournée
                <ChevronRight />
              </Button>
            </Card>
          ) : (
            <Card density="touch" className="p-8 text-center">
              <Route className="mx-auto size-9 text-slate-400" />
              <h3 className="mt-3 t-section">Aucune tournée publiée</h3>
              <p className="mt-2 t-body text-muted-foreground">
                Votre solde de caisse reste visible. Actualisez lorsque le planning est prêt.
              </p>
            </Card>
          )}

          {nextStop ? (
            <Card density="touch" className="overflow-hidden p-0">
              <div className="bg-brand-50 p-4">
                <p className="t-micro text-brand-700">
                  Prochain arrêt · {nextStop.sequence}/{planned || nextStop.sequence}
                </p>
                <h3 className="mt-1 text-xl font-semibold tracking-tight">{nextStop.customerName}</h3>
                <p className="mt-1 t-body text-slate-600">{stopAddress(nextStop)}</p>
              </div>
              <div className="flex items-center justify-between border-t border-hairline px-4 py-3 text-sm">
                <span className="text-muted-foreground">À encaisser</span>
                <strong className="num font-semibold">{formatMoney(nextStop.amountToCollect)}</strong>
              </div>
              <div className="px-4 pb-4">
                <Button size="touch" onClick={() => onOpenRoute(nextStop.deliveryNote)} className="w-full">
                  Traiter cet arrêt
                  <ChevronRight />
                </Button>
              </div>
            </Card>
          ) : null}

          <Card density="touch" className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Banknote className="size-4 text-brand-600" />
                <h3 className="t-section">Caisse du jour</h3>
              </div>
              <StatusBadge tone={cashStatusTone(cash?.status || "Sans encaissement")} size="sm">
                {cash?.status || "Sans encaissement"}
              </StatusBadge>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <TouchStat label="Espèces déclarées" value={formatMoney(cash?.declaredCash || 0)} />
              <TouchStat label="Chèques déclarés" value={formatMoney(cash?.declaredCheques || 0)} />
            </dl>
            {cash?.movements?.length ? (
              <ul className="mt-4 space-y-2">
                {cash.movements.slice(0, 3).map((movement) => (
                  <li key={movement.name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{movement.type}</span>
                    <span className="num font-semibold">{formatMoney(movement.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 t-meta text-muted-foreground">Aucun mouvement de caisse récent.</p>
            )}
          </Card>

          {week ? (
            <Card density="touch" className="p-4">
              <h3 className="t-section">Cette semaine</h3>
              <p className="num mt-1 t-body text-muted-foreground">
                {week.deliveredStops} livraisons · {week.plannedStops} arrêts planifiés · {formatMoney(week.collected)}
              </p>
              <div className="mt-4 flex h-28 items-end gap-2">
                {week.days.map((day) => {
                  const height = Math.max(8, Math.round((day.deliveredStops / maxDelivered) * 100));
                  const isToday = day.date === data.date;
                  return (
                    <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                      <div className="flex h-20 w-full items-end justify-center">
                        <div
                          className={`w-full max-w-7 rounded-t-md ${isToday ? "bg-brand-600" : "bg-brand-200"}`}
                          style={{ height: `${height}%` }}
                          title={`${day.deliveredStops} livraisons`}
                        />
                      </div>
                      <span className={`t-micro ${isToday ? "text-brand-700" : "text-subtle"}`}>
                        {weekday(day.date)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
