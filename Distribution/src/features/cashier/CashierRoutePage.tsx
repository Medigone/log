import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { CashPaymentsTable } from "@/features/cashier/CashPaymentsTable";
import {
  cashBlocker,
  detailCounted,
  formatSignedMoney,
  hasMaterialGap,
  paymentEdits,
  plural,
  routeMatchesQuery,
  type PaymentEdit,
} from "@/features/cashier/cashTotals";
import { apiErrorMessage, useCashierReconciliation, useCashierRoutes, useDistributionMutations } from "@/shared/api/distribution";
import { cashStatusTone, TONES } from "@/shared/design/statusTone";
import { formatMoney, formatShortDate } from "@/shared/format";
import type { CashReconciliationInput } from "@/shared/types/distribution";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

function isoDate(offsetDays = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function CashierRoutePage({ canResolveDiscrepancy = false }: { canResolveDiscrepancy?: boolean }) {
  const { routeId = "" } = useParams();
  const decodedId = decodeURIComponent(routeId);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dateFrom = searchParams.get("from") || isoDate(-7);
  const dateTo = searchParams.get("to") || isoDate();
  const query = searchParams.get("q") || "";
  const driver = searchParams.get("driver") || "";
  const statuses = useMemo(
    () => new Set((searchParams.get("status") || "").split("|").map((item) => item.trim()).filter(Boolean)),
    [searchParams],
  );
  const listQuery = searchParams.toString();
  const listHref = listQuery ? `/cashier?${listQuery}` : "/cashier";

  const [countedCash, setCountedCash] = useState("");
  const [reason, setReason] = useState("");
  const [edits, setEdits] = useState<Record<string, PaymentEdit>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const { data: routesData, error: routesError, isLoading: routesLoading, mutate: refreshRoutes } = useCashierRoutes(dateFrom, dateTo, "");
  const routes = useMemo(() => {
    const all = routesData?.message || [];
    const needle = query.trim().toLocaleLowerCase("fr");
    return all.filter((route) => {
      if (driver && route.driver !== driver) return false;
      if (statuses.size && !statuses.has(route.cash.status)) return false;
      return routeMatchesQuery(route, needle);
    });
  }, [driver, query, routesData?.message, statuses]);
  const index = routes.findIndex((route) => route.name === decodedId);
  const selected = routes[index] || routesData?.message?.find((route) => route.name === decodedId);
  const { data, error: detailError, isLoading, mutate: refreshDetail } = useCashierReconciliation(decodedId || undefined);
  const reconciliation = data?.message;
  const actions = useDistributionMutations();
  const locked = reconciliation?.status === "Validée";
  const counted = detailCounted(reconciliation, countedCash, edits);
  const blocker = reconciliation
    ? cashBlocker({
        status: reconciliation.status,
        payments: reconciliation.payments,
        edits,
        countedCash: counted.countedCash,
        declaredTotal: reconciliation.declaredTotal,
        reason,
        canResolveDiscrepancy,
      })
    : null;

  useEffect(() => {
    if (!reconciliation) return;
    setCountedCash(String(reconciliation.declaredCash));
    setEdits(paymentEdits(reconciliation.payments));
    setReason(reconciliation.discrepancyReason || "");
    setError("");
    setExpanded(null);
  }, [reconciliation]);

  const patchEdit = (paymentId: string, patch: Partial<PaymentEdit>) => {
    setEdits((current) => ({
      ...current,
      [paymentId]: { ...current[paymentId], ...patch },
    }));
  };

  const submit = async (resolveDiscrepancy = false) => {
    if (!reconciliation || !selected) return;
    setError("");
    setNotice("");
    const payload: CashReconciliationInput = {
      routeId: reconciliation.routeId,
      expectedRevision: selected.revision,
      requestId: crypto.randomUUID(),
      countedCash: counted.countedCash,
      reason: reason.trim() || undefined,
      payments: reconciliation.payments.map((payment) => ({
        paymentId: payment.name,
        countedAmount: Number(edits[payment.name]?.countedAmount || 0),
        chequeNumber: edits[payment.name]?.chequeNumber || undefined,
        allocations: edits[payment.name]?.allocations || [],
      })),
    };
    try {
      const result = resolveDiscrepancy
        ? await actions.resolveCashDiscrepancy(payload)
        : await actions.validateCashReconciliation(payload);
      setNotice(
        result.reconciliation.requiresManagerApproval
          ? "Écart enregistré. Aucun paiement comptable n’a été créé; une validation Responsable est requise."
          : `Caisse validée · ${formatMoney(counted.countedTotal, { precise: true })} comptabilisés · caisse livreur remise à zéro.`,
      );
      await Promise.all([refreshDetail(), refreshRoutes()]);
    } catch (submitError) {
      setError(apiErrorMessage(submitError));
    }
  };

  const go = (offset: number) => {
    const next = routes[index + offset];
    if (!next) return;
    navigate(`/cashier/${encodeURIComponent(next.name)}${listQuery ? `?${listQuery}` : ""}`);
  };

  const fourthTile = locked
    ? {
        label: "Comptabilisé",
        value: formatMoney(reconciliation?.validatedTotal || 0, { precise: true }),
        tone: "success" as const,
      }
    : {
        label: "Écart",
        value: formatSignedMoney(counted.gap),
        tone: hasMaterialGap(counted.gap) ? ("danger" as const) : ("neutral" as const),
      };

  return (
    <>
      <PageHeader
        breadcrumb={
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate(listHref)}>
              <ChevronLeft />
              Toutes les tournées
            </Button>
            {index >= 0 && routes.length ? (
              <div className="flex items-center gap-1">
                <span className="num text-xs text-muted-foreground">
                  {index + 1} / {routes.length}
                </span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Tournée précédente" disabled={index <= 0} onClick={() => go(-1)}>
                  <ChevronLeft />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Tournée suivante" disabled={index >= routes.length - 1} onClick={() => go(1)}>
                  <ChevronRight />
                </Button>
              </div>
            ) : null}
          </div>
        }
        title={<span className="num">{decodedId}</span>}
        meta={
          reconciliation ? (
            <StatusBadge tone={cashStatusTone(reconciliation.status)}>{reconciliation.status}</StatusBadge>
          ) : null
        }
        description={
          selected ? (
            <span>
              {selected.driverName || selected.driver} · {selected.vehicleLabel || selected.vehicle || "Véhicule non affecté"} · tournée du{" "}
              {formatShortDate(selected.date)} · {plural(reconciliation?.payments.length || 0, "encaissement", "encaissements")}
            </span>
          ) : null
        }
        actions={
          <>
            <Button variant="outline" onClick={() => void Promise.all([refreshDetail(), refreshRoutes()])} disabled={isLoading || routesLoading}>
              <RefreshCw />
              Actualiser
            </Button>
          </>
        }
      />

      {(routesError || detailError || error) && (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(routesError || detailError) || error}
        </p>
      )}
      {notice && (
        <p role="status" className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <Check className="size-4 shrink-0" />
          {notice}
        </p>
      )}

      {isLoading && !reconciliation ? (
        <div className="grid min-h-48 place-items-center">
          <LoaderCircle className="size-7 animate-spin text-brand-600" />
        </div>
      ) : null}

      {reconciliation ? (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile label="Déclaré espèces" value={formatMoney(reconciliation.declaredCash, { precise: true })} />
            <KpiTile label="Déclaré chèques" value={formatMoney(reconciliation.declaredCheques, { precise: true })} />
            <KpiTile label="Total compté" value={formatMoney(counted.countedTotal, { precise: true })} />
            <KpiTile
              label={fourthTile.label}
              value={fourthTile.value}
              tone={fourthTile.tone}
              className={fourthTile.tone === "danger" ? TONES.danger.surface : fourthTile.tone === "success" ? TONES.success.surface : undefined}
            />
          </section>

          <section className="flex flex-col gap-4 rounded-xl border border-hairline bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Comptage physique</h2>
              <p className="t-body text-muted-foreground">
                Aucun Payment Entry n'est créé tant que le contrôle complet n'est pas validé.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="flex w-[180px] flex-col gap-1.5">
                <span className="t-micro text-muted-foreground">Espèces comptées</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={countedCash}
                  disabled={locked}
                  aria-label="Espèces comptées"
                  onChange={(event) => setCountedCash(event.target.value)}
                  className="num"
                />
              </label>
              <label className="flex w-[180px] flex-col gap-1.5">
                <span className="t-micro text-muted-foreground">Chèques vérifiés</span>
                <Input readOnly value={formatMoney(counted.countedCheques, { precise: true })} className="num bg-muted" />
                <span className="text-[11px] text-muted-foreground">
                  {plural(counted.chequeCount, "chèque", "chèques")}
                </span>
              </label>
            </div>
          </section>

          <CashPaymentsTable
            reconciliation={reconciliation}
            edits={edits}
            expanded={expanded}
            readOnly={locked}
            onToggle={(paymentId) => setExpanded((current) => (current === paymentId ? null : paymentId))}
            onEdit={patchEdit}
          />

          {hasMaterialGap(counted.gap) && !locked ? (
            <section className={cn("rounded-lg border p-4", TONES.danger.surface)}>
              <p className="flex items-center gap-2 text-sm font-semibold text-red-900">
                <span className="size-1.5 rounded-full bg-red-500" />
                Écart de {formatMoney(Math.abs(counted.gap), { precise: true })}.{" "}
                {counted.gap > 0 ? "Surplus en caisse" : "Manque en caisse"} — motif obligatoire avant transmission au
                responsable.
              </p>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-3 bg-background"
                placeholder="Décrivez l'écart constaté (billet manquant, chèque non remis, erreur de rendu…)"
              />
            </section>
          ) : null}

          {blocker ? (
            <div className="sticky bottom-0 z-20 -mx-4 mt-auto flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              <div>
                <p className={cn("text-sm font-semibold", blocker.tone === "success" ? "text-emerald-700" : blocker.tone === "danger" ? "text-red-700" : "text-foreground")}>
                  {blocker.title}
                </p>
                <p className="text-xs text-muted-foreground">{blocker.detail}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="t-micro text-muted-foreground">Total compté</p>
                  <p className="num text-base font-semibold">{formatMoney(counted.countedTotal, { precise: true })}</p>
                </div>
                <Button
                  size="lg"
                  variant={blocker.buttonVariant}
                  disabled={blocker.buttonDisabled || actions.cashier || !selected}
                  onClick={() => void submit(blocker.submitAsResolve)}
                >
                  {actions.cashier ? <LoaderCircle className="animate-spin" /> : null}
                  {blocker.buttonLabel}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export default CashierRoutePage;
