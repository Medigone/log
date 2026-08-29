import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ClipboardCheck, LoaderCircle, RotateCcw, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { apiErrorMessage, useDistributionMutations, useReturnRoutes } from "@/shared/api/distribution";
import type { DistributionRoute } from "@/shared/types/distribution";

function isoDate(offsetDays = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function hasGoodsToReturn(route: Pick<DistributionRoute, "stock">) {
  return (route.stock?.remainingQuantity || 0) > 0;
}

export function usePendingReturnRoutes() {
  const { data, error, isLoading, mutate } = useReturnRoutes(isoDate(-30), isoDate(7));
  const routes = useMemo(
    () => (data?.message || []).filter(hasGoodsToReturn),
    [data?.message],
  );
  return { routes, error, isLoading, mutate };
}

function ReturnRouteCard({ route, onUpdated }: { route: DistributionRoute; onUpdated: () => Promise<unknown> }) {
  const actions = useDistributionMutations();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canConfirm = route.stock.status === "Retour déclaré";

  useEffect(() => {
    setCounts({});
    setError("");
    setNotice("");
  }, [route.name]);

  const remainingLines = route.stock.lines.filter((line) => line.remainingQuantity > 0);
  const allCounted = remainingLines.every((line) => counts[line.name] !== "" && counts[line.name] != null);

  const confirm = async () => {
    setError("");
    setNotice("");
    try {
      const result = await actions.confirmRouteReturn({
        routeId: route.name,
        expectedRevision: route.revision,
        requestId: crypto.randomUUID(),
        lines: remainingLines.map((line) => ({ lineName: line.name, quantity: Number(counts[line.name]) })),
      });
      if (!result.success) {
        setError("Le comptage ne correspond pas au stock attendu. Une exception Responsable a été créée.");
      } else {
        setNotice(`Retour confirmé · Stock Entry ${result.route.stock.returnStockEntry || "créé"}.`);
        await onUpdated();
      }
    } catch (confirmationError) {
      setError(apiErrorMessage(confirmationError));
    }
  };

  return (
    <article className="overflow-hidden rounded-md border border-hairline bg-white">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 p-4 text-left">
        <span className={`grid h-10 w-10 place-items-center rounded-full ${canConfirm ? "bg-amber-100 text-amber-800" : "bg-surface-subtle text-muted-foreground"}`}><Truck className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-foreground">{route.name}</span>
          <span className="block text-sm text-muted-foreground">{route.driverName || route.driver || "Livreur"} · {route.vehicleLabel || route.vehicle || "Véhicule"}</span>
        </span>
        <span className="text-right">
          <span className="block text-sm font-semibold text-foreground">{route.stock.remainingQuantity} à retourner</span>
          <span className="text-xs font-semibold text-amber-700">{route.stock.status}</span>
        </span>
      </button>

      {open && (
        <div className="border-t border-hairline p-4">
          {!canConfirm && <p className="rounded-lg bg-surface-subtle p-3 text-sm text-slate-600">Le livreur doit d’abord déclarer son retour depuis son interface mobile.</p>}
          {canConfirm && <p className="mb-4 text-sm text-slate-600">Comptez physiquement chaque ligne. Le transfert vers l’entrepôt de retour n’est créé que si tout correspond.</p>}
          <div className="space-y-2">
            {remainingLines.map((line) => (
              <div key={line.name} className="grid gap-2 rounded-lg border border-hairline p-3 sm:grid-cols-[minmax(0,1fr)_130px_150px] sm:items-center">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{line.itemCode} {line.itemName ? `· ${line.itemName}` : ""}</p><p className="text-xs text-muted-foreground">{line.deliveryNote}{line.batchNo ? ` · lot ${line.batchNo}` : ""}</p></div>
                <p className="text-sm"><span className="text-muted-foreground">Attendu :</span> <strong>{line.remainingQuantity}</strong></p>
                <Input
                  aria-label={`Quantité comptée ${line.itemCode}`}
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Quantité comptée"
                  disabled={!canConfirm}
                  value={counts[line.name] ?? ""}
                  onChange={(event) => setCounts((current) => ({ ...current, [line.name]: event.target.value }))}
                />
              </div>
            ))}
            {!remainingLines.length && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Aucune marchandise restante pour cette tournée.</p>}
          </div>
          {error && <p role="alert" className="mt-3 flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</p>}
          {notice && <p role="status" className="mt-3 flex gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><Check className="h-4 w-4 shrink-0" />{notice}</p>}
          {canConfirm && <Button onClick={() => void confirm()} disabled={actions.fulfillment || (!allCounted && remainingLines.length > 0)} className="mt-4 w-full bg-brand-600 hover:bg-brand-700 sm:w-auto">
            {actions.fulfillment ? <LoaderCircle className="animate-spin" /> : <ClipboardCheck />}Confirmer le retour complet
          </Button>}
        </div>
      )}
    </article>
  );
}

export function ReturnControlPanel() {
  const { routes, error, isLoading, mutate } = usePendingReturnRoutes();

  return (
    <section className="flex flex-col gap-4" aria-labelledby="return-control-title">
      <div>
        <h2 id="return-control-title" className="font-semibold text-foreground">Retours à contrôler</h2>
        <p className="text-sm text-muted-foreground">Recomptage et retour du véhicule vers l’entrepôt. Indépendant du contrôle de caisse.</p>
      </div>
      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Chargement des retours…
        </p>
      )}
      {error ? <p role="alert" className="text-sm text-red-700">{apiErrorMessage(error)}</p> : null}
      {!isLoading && !error && routes.length === 0 && (
        <div className="rounded-lg border border-dashed border-hairline-strong bg-card">
          <EmptyState
            icon={RotateCcw}
            title="Aucun retour à traiter"
            description="Les tournées avec un reliquat à ramener apparaîtront ici après la déclaration du livreur."
          />
        </div>
      )}
      <div className="flex flex-col gap-3">
        {routes.map((route) => <ReturnRouteCard key={route.name} route={route} onUpdated={mutate} />)}
      </div>
    </section>
  );
}
