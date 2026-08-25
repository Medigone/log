import { Banknote, CheckCircle2, ChevronRight, Clock3, LoaderCircle, MapPin, RefreshCw, Route, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/shared/api/distribution";
import type { DriverDashboardData, DriverDashboardNextStop } from "@/shared/types/distribution";

function money(value: number) {
  return `${new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(value)} DZD`;
}

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

function cashTone(status: string) {
  if (status === "Validée") return "bg-emerald-50 text-emerald-800";
  if (status === "Écart") return "bg-red-50 text-red-800";
  if (status === "À contrôler") return "bg-amber-50 text-amber-900";
  return "bg-slate-100 text-slate-600";
}

function stopAddress(stop: DriverDashboardNextStop) {
  return stop.address || [stop.commune, stop.wilaya].filter(Boolean).join(", ") || "Adresse non renseignée";
}

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
  icon: typeof Wallet;
  tone: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
        <span className={`grid h-8 w-8 place-items-center rounded-xl ${tone}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{hint}</p>
    </article>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement du tableau de bord">
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-200/80" />
        ))}
      </div>
      <div className="h-24 animate-pulse rounded-2xl bg-slate-200/80" />
      <div className="h-36 animate-pulse rounded-2xl bg-slate-200/80" />
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
  const activeRoute = data?.routes.find((route) => ["Publiée", "En cours", "Retour dépôt"].includes(String(route.lifecycle))) || data?.routes[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Tableau de bord</p>
          <h2 className="text-lg font-bold text-slate-950">Votre journée</h2>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} aria-label="Actualiser">
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualiser
        </Button>
      </div>

      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{apiErrorMessage(error)}</div> : null}

      {loading && !data ? <DashboardSkeleton /> : null}

      {data ? (
        <>
          <section aria-label="Indicateurs du jour" className="grid grid-cols-2 gap-3">
            <KpiCard
              label="Caisse"
              value={money(cash?.balance || 0)}
              hint={`Encaissé ${money(kpis?.amountCollected || 0)}`}
              icon={Wallet}
              tone="bg-blue-50 text-blue-700"
            />
            <KpiCard
              label="Livraisons"
              value={`${kpis?.deliveredStops || 0} / ${planned}`}
              hint="Effectuées aujourd'hui"
              icon={CheckCircle2}
              tone="bg-emerald-50 text-emerald-700"
            />
            <KpiCard
              label="Arrêts"
              value={`${kpis?.completedStops || 0} / ${planned}`}
              hint={`${kpis?.remainingStops || 0} restant${(kpis?.remainingStops || 0) > 1 ? "s" : ""}`}
              icon={MapPin}
              tone="bg-sky-50 text-sky-700"
            />
            <KpiCard
              label="Planifié"
              value={money(kpis?.amountToCollect || 0)}
              hint={activeRoute ? `${clock(activeRoute.plannedStart)} → ${clock(activeRoute.plannedEnd)}` : "Aucune tournée"}
              icon={Clock3}
              tone="bg-amber-50 text-amber-700"
            />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Avancement</h3>
              <span className="text-sm font-bold text-blue-700">{progress}%</span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-700 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs font-medium text-slate-500">
              {kpis?.completedStops || 0} arrêt{(kpis?.completedStops || 0) > 1 ? "s" : ""} traité{(kpis?.completedStops || 0) > 1 ? "s" : ""} sur {planned}
              {kpis?.failedStops ? ` · ${kpis.failedStops} non livré${kpis.failedStops > 1 ? "s" : ""}` : ""}
            </p>
          </section>

          {activeRoute ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Planifié aujourd'hui</p>
                  <h3 className="mt-1 font-bold">{activeRoute.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {clock(activeRoute.plannedStart)} – {clock(activeRoute.plannedEnd)}
                    {activeRoute.vehicleLabel ? ` · ${activeRoute.vehicleLabel}` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{activeRoute.lifecycle}</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-xs font-semibold text-slate-500">Arrêts</dt>
                  <dd className="mt-1 font-bold">{activeRoute.stopsDone}/{activeRoute.stopsTotal}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-xs font-semibold text-slate-500">Reste à encaisser</dt>
                  <dd className="mt-1 font-bold">{money(activeRoute.toCollect)}</dd>
                </div>
              </dl>
              <Button onClick={() => onOpenRoute()} className="mt-4 h-12 w-full bg-blue-700 hover:bg-blue-800">
                Ouvrir la tournée
                <ChevronRight />
              </Button>
            </section>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <Route className="mx-auto h-9 w-9 text-slate-400" />
              <h3 className="mt-3 font-bold">Aucune tournée publiée</h3>
              <p className="mt-2 text-sm text-slate-500">Votre solde de caisse reste visible. Actualisez lorsque le planning est prêt.</p>
            </section>
          )}

          {nextStop ? (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="bg-blue-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Prochain arrêt · {nextStop.sequence}/{planned || nextStop.sequence}</p>
                <h3 className="mt-1 text-xl font-bold">{nextStop.customerName}</h3>
                <p className="mt-1 text-sm text-slate-600">{stopAddress(nextStop)}</p>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
                <span className="text-slate-500">À encaisser</span>
                <strong>{money(nextStop.amountToCollect)}</strong>
              </div>
              <div className="px-4 pb-4">
                <Button onClick={() => onOpenRoute(nextStop.deliveryNote)} className="h-12 w-full bg-blue-700 hover:bg-blue-800">
                  Traiter cet arrêt
                  <ChevronRight />
                </Button>
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-blue-700" />
                <h3 className="font-bold">Caisse du jour</h3>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${cashTone(cash?.status || "Sans encaissement")}`}>
                {cash?.status || "Sans encaissement"}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs font-semibold text-slate-500">Espèces déclarées</dt>
                <dd className="mt-1 font-bold">{money(cash?.declaredCash || 0)}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs font-semibold text-slate-500">Chèques déclarés</dt>
                <dd className="mt-1 font-bold">{money(cash?.declaredCheques || 0)}</dd>
              </div>
            </dl>
            {cash?.movements?.length ? (
              <ul className="mt-4 space-y-2">
                {cash.movements.slice(0, 3).map((movement) => (
                  <li key={movement.name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{movement.type}</span>
                    <span className="font-semibold">{money(movement.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-xs text-slate-500">Aucun mouvement de caisse récent.</p>
            )}
          </section>

          {week ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="font-bold">Cette semaine</h3>
              <p className="mt-1 text-sm text-slate-500">
                {week.deliveredStops} livraisons · {week.plannedStops} arrêts planifiés · {money(week.collected)}
              </p>
              <div className="mt-4 flex h-28 items-end gap-2">
                {week.days.map((day) => {
                  const height = Math.max(8, Math.round((day.deliveredStops / maxDelivered) * 100));
                  const isToday = day.date === data.date;
                  return (
                    <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                      <div className="flex h-20 w-full items-end justify-center">
                        <div
                          className={`w-full max-w-7 rounded-t-md ${isToday ? "bg-blue-700" : "bg-blue-200"}`}
                          style={{ height: `${height}%` }}
                          title={`${day.deliveredStops} livraisons`}
                        />
                      </div>
                      <span className={`text-[10px] font-bold uppercase ${isToday ? "text-blue-700" : "text-slate-400"}`}>
                        {weekday(day.date)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
