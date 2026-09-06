import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Box } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { canReorderRouteStops } from "@/features/planning/routeOrder";
import { RouteStopDetail } from "@/features/planning/RouteStopDetail";
import { RouteStopRail } from "@/features/planning/RouteStopRail";
import { getStopVisualStyle } from "@/features/planning/stopStatus";
import { useFocusHighlight } from "@/shared/useFocusHighlight";
import type { DistributionRoute } from "@/shared/types/distribution";

function fallbackSelectedStop(stops: DistributionRoute["stops"]) {
  const pending = stops.find((stop) => !getStopVisualStyle(stop.status).processed);
  return (pending ?? stops[0])?.deliveryNote ?? "";
}

function resolveSelectedStop(
  stops: DistributionRoute["stops"],
  stopParam: string | null,
  focusParam: string | null,
) {
  const match = (note: string | null) =>
    note && stops.some((stop) => stop.deliveryNote === note) ? note : "";
  if (stopParam) return match(stopParam) || fallbackSelectedStop(stops);
  return match(focusParam) || fallbackSelectedStop(stops);
}

export function RouteStopsPanel({
  route,
  routing = false,
  accounting = false,
  canResolveAccounting = false,
  generatingQr,
  onCommitOrder,
  onGenerateQr,
  onRetryInvoice,
}: {
  route: DistributionRoute;
  routing?: boolean;
  accounting?: boolean;
  canResolveAccounting?: boolean;
  generatingQr?: string;
  onCommitOrder: (orderedDeliveryNotes: string[]) => void | Promise<void>;
  onGenerateQr: (deliveryNote: string) => void;
  onRetryInvoice: (deliveryNote: string) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [reorderSheetOpen, setReorderSheetOpen] = useState(false);
  const focusNote = searchParams.get("focus") || "";
  const stopParam = searchParams.get("stop");
  const highlight = useFocusHighlight(focusNote ? [focusNote] : [], true);
  const selected = useMemo(
    () => resolveSelectedStop(route.stops, stopParam, focusNote),
    [route.stops, stopParam, focusNote],
  );
  const selectedStop = route.stops.find((stop) => stop.deliveryNote === selected);
  const reorderable = canReorderRouteStops(route, route.visits?.length || route.stops.length);

  useEffect(() => {
    if (!selected || searchParams.get("stop") === selected) return;
    const next = new URLSearchParams(searchParams);
    next.set("stop", selected);
    setSearchParams(next, { replace: true });
  }, [selected, searchParams, setSearchParams]);

  const selectStop = (deliveryNote: string) => {
    if (deliveryNote === selected && searchParams.get("stop") === deliveryNote) return;
    const next = new URLSearchParams(searchParams);
    next.set("stop", deliveryNote);
    setSearchParams(next, { replace: true });
  };

  const railProps = {
    stops: route.stops,
    selected,
    onSelect: selectStop,
    reorderable,
    disabled: routing,
    onCommit: onCommitOrder,
    highlight,
  };

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="t-section">Arrêts et bons de livraison</h2>
        <p className="t-body text-muted-foreground">
          {reorderable
            ? route.lifecycle === "Publiée"
              ? "Glissez les arrêts pour ajuster l’ordre. Le livreur devra accepter la nouvelle révision."
              : "Glissez les arrêts pour choisir qui est livré avant qui, puis vérifiez chaque BL à droite."
            : "Sélectionnez un arrêt pour vérifier ses articles, son paiement et son QR."}
        </p>
      </div>

      {!route.stops.length ? (
        <div className="rounded-lg border border-dashed border-hairline-strong bg-card">
          <EmptyState icon={Box} title="Aucun arrêt" description="Revenez au planning pour affecter des BL." />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[330px_minmax(0,1fr)]">
          <RouteStopRail layout="responsive" onRequestReorder={() => setReorderSheetOpen(true)} {...railProps} />
          {selectedStop ? (
            <RouteStopDetail
              stop={selectedStop}
              route={route}
              canResolveAccounting={canResolveAccounting}
              accountingBusy={accounting}
              generatingQr={generatingQr === selectedStop.deliveryNote}
              onGenerateQr={() => onGenerateQr(selectedStop.deliveryNote)}
              onRetryInvoice={() => onRetryInvoice(selectedStop.deliveryNote)}
            />
          ) : null}
        </div>
      )}

      {reorderable && reorderSheetOpen ? (
        <Sheet open onOpenChange={setReorderSheetOpen}>
          <SheetContent side="left" className="w-[330px] sm:max-w-[330px]">
            <SheetHeader>
              <SheetTitle>Réorganiser les arrêts</SheetTitle>
            </SheetHeader>
            <SheetBody className="px-3 pb-4">
              <RouteStopRail layout="vertical" {...railProps} />
            </SheetBody>
          </SheetContent>
        </Sheet>
      ) : null}
    </section>
  );
}
