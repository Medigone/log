import { useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp, LoaderCircle, MapPin, Route, Truck } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiErrorMessage, usePlanningBoard } from "@/shared/api/distribution";
import { getStopVisualStyle } from "@/features/planning/stopStatus";
import { routeLifecycleTone } from "@/shared/design/statusTone";

function localDate() {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function DeliveriesPage() {
  const [date, setDate] = useState(localDate);
  const [expanded, setExpanded] = useState<string>();
  const { data, error, isLoading } = usePlanningBoard(date);
  const routes = data?.message.routes || [];

  return (
    <>
      <PageHeader
        eyebrow="Suivi opérationnel"
        title="Livraisons"
        description="Consultez l’avancement des tournées et de leurs arrêts."
        actions={
          <label className="flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0 text-brand-600" />
            <span className="sr-only">Date</span>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-40" />
          </label>
        }
      />

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {apiErrorMessage(error)}
        </div>
      )}

      {isLoading ? (
        <div className="grid min-h-80 place-items-center rounded-lg border border-hairline bg-card">
          <LoaderCircle className="size-7 animate-spin text-brand-600" />
        </div>
      ) : (
        <div className="space-y-3">
          {routes.map((routeData) => {
            const open = expanded === routeData.name;
            const done = routeData.stops.filter((stop) => ["Livré", "Non Livré"].includes(stop.status)).length;

            return (
              <article key={routeData.name} className="overflow-hidden rounded-lg border border-hairline bg-card shadow-card">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? undefined : routeData.name)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-surface-subtle"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700">
                    <Truck className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="font-semibold text-foreground">{routeData.name}</strong>
                      <StatusBadge tone={routeLifecycleTone(routeData.lifecycle)} size="sm">
                        {routeData.lifecycle}
                      </StatusBadge>
                    </span>
                    <span className="mt-0.5 block t-body text-muted-foreground">
                      {routeData.driverName || "Livreur non affecté"} · {routeData.vehicle || "Véhicule non affecté"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block text-sm font-semibold text-foreground">
                      {done}/{routeData.stops.length}
                    </span>
                    <span className="t-meta text-muted-foreground">arrêts traités</span>
                  </span>
                  {open ? (
                    <ChevronUp className="size-5 shrink-0 text-subtle" />
                  ) : (
                    <ChevronDown className="size-5 shrink-0 text-subtle" />
                  )}
                </button>

                {open && (
                  <div className="border-t border-hairline bg-surface-subtle p-3">
                    <ol className="space-y-2">
                      {routeData.stops.map((stop, index) => {
                        const visual = getStopVisualStyle(stop.status);
                        return (
                          <li
                            key={stop.deliveryNote}
                            className="flex items-center gap-3 rounded-md border border-hairline bg-white p-3"
                          >
                            <span
                              className={`num grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${visual.sequenceClass}`}
                            >
                              {visual.markerSymbol || index + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">
                                {stop.customerName}
                              </span>
                              <span className="block truncate t-meta text-muted-foreground">
                                {stop.deliveryNote} · {stop.commune || stop.address || "Adresse non renseignée"}
                              </span>
                            </span>
                            <StatusBadge tone={visual.tone} size="sm">
                              {stop.status}
                            </StatusBadge>
                            {stop.latitude != null && stop.longitude != null && (
                              <a
                                aria-label="Ouvrir la position"
                                target="_blank"
                                rel="noreferrer"
                                href={`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`}
                                className="shrink-0 rounded-md p-2 text-brand-700 transition-colors hover:bg-brand-50"
                              >
                                <MapPin className="size-4" />
                              </a>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </article>
            );
          })}

          {!routes.length && (
            <div className="rounded-lg border border-dashed border-hairline-strong bg-card">
              <EmptyState
                icon={Route}
                title="Aucune tournée ce jour"
                description="Changez de date ou préparez un nouveau planning."
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
