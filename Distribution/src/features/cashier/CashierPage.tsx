import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Banknote, Check, CircleDollarSign, LoaderCircle, ReceiptText, RefreshCw } from "lucide-react";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Money } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { Toolbar } from "@/components/ui/toolbar";
import { apiErrorMessage, useCashierReconciliation, useCashierRoutes, useDistributionMutations } from "@/shared/api/distribution";
import { formatMoney } from "@/shared/format";
import type { CashCollection, CashReconciliationInput, InvoiceAllocation } from "@/shared/types/distribution";

function isoDate(offsetDays = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

/** Le contrôle de caisse compte au centime. */
function money(value: number) {
  return formatMoney(value, { precise: true });
}

interface PaymentEdit {
  countedAmount: string;
  chequeNumber: string;
  allocations: InvoiceAllocation[];
}

function paymentEdits(payments: CashCollection[]) {
  return Object.fromEntries(payments.map((payment) => [payment.name, {
    countedAmount: String(payment.countedAmount || payment.amount),
    chequeNumber: payment.chequeNumber || "",
    allocations: payment.allocations.map((allocation) => ({ ...allocation })),
  }])) as Record<string, PaymentEdit>;
}

export function CashierPage({ canResolveDiscrepancy = false }: { canResolveDiscrepancy?: boolean }) {
  const [searchParams] = useSearchParams();
  const [dateFrom, setDateFrom] = useState(isoDate(-7));
  const [dateTo, setDateTo] = useState(isoDate());
  const [status, setStatus] = useState(() => searchParams.get("status") || "");
  const [selectedRoute, setSelectedRoute] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [reason, setReason] = useState("");
  const [edits, setEdits] = useState<Record<string, PaymentEdit>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { data: routesData, error: routesError, isLoading: routesLoading, mutate: refreshRoutes } = useCashierRoutes(dateFrom, dateTo, status);
  const routes = useMemo(() => routesData?.message || [], [routesData?.message]);
  const { data, error: detailError, isLoading: detailLoading, mutate: refreshDetail } = useCashierReconciliation(selectedRoute || undefined);
  const reconciliation = data?.message;
  const actions = useDistributionMutations();

  useEffect(() => {
    if (routes.length && !routes.some((route) => route.name === selectedRoute)) setSelectedRoute(routes[0].name);
    if (!routes.length) setSelectedRoute("");
  }, [routes, selectedRoute]);

  useEffect(() => {
    if (!reconciliation) return;
    setCountedCash(String(reconciliation.declaredCash));
    setEdits(paymentEdits(reconciliation.payments));
    setReason(reconciliation.discrepancyReason || "");
    setError("");
  }, [reconciliation]);

  const selected = routes.find((route) => route.name === selectedRoute);
  const countedCheques = useMemo(() => reconciliation?.payments
    .filter((payment) => payment.method === "Chèque")
    .reduce((sum, payment) => sum + Number(edits[payment.name]?.countedAmount || 0), 0) || 0, [edits, reconciliation]);
  const countedTotal = Number(countedCash || 0) + countedCheques;
  const hasDifference = Boolean(reconciliation && Math.abs(countedTotal - reconciliation.declaredTotal) > 0.000001);

  const updateAllocation = (paymentId: string, index: number, amount: string) => {
    setEdits((current) => {
      const payment = current[paymentId];
      if (!payment) return current;
      const allocations = payment.allocations.map((allocation, allocationIndex) => allocationIndex === index
        ? { ...allocation, allocatedAmount: Number(amount || 0) }
        : allocation);
      return { ...current, [paymentId]: { ...payment, allocations } };
    });
  };

  const submit = async (resolveDiscrepancy = false) => {
    if (!reconciliation || !selected) return;
    setError("");
    setNotice("");
    const payload: CashReconciliationInput = {
      routeId: reconciliation.routeId,
      expectedRevision: selected.revision,
      requestId: crypto.randomUUID(),
      countedCash: Number(countedCash || 0),
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
      setNotice(result.reconciliation.requiresManagerApproval
        ? "Écart enregistré. Aucun paiement comptable n’a été créé; une validation Responsable est requise."
        : "Caisse validée, écritures de paiement créées, caisse livreur remise.");
      await Promise.all([refreshDetail(), refreshRoutes()]);
    } catch (submitError) {
      setError(apiErrorMessage(submitError));
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Contrôle financier"
        title="Caisse des tournées"
        description="Contrôle financier indépendant du retour stock. Comptez les espèces, vérifiez chaque chèque et la ventilation avant de créer les règlements ERPNext."
        actions={
          <Button
            variant="outline"
            onClick={() => void Promise.all([refreshRoutes(), selectedRoute ? refreshDetail() : Promise.resolve()])}
            disabled={routesLoading}
          >
            <RefreshCw />
            Actualiser
          </Button>
        }
      />

      <Toolbar>
        <InputGroup className="w-36 bg-background">
          <InputGroupAddon>
            <span className="text-muted-foreground">Du</span>
          </InputGroupAddon>
          <InputGroupInput type="date" aria-label="Du" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </InputGroup>
        <InputGroup className="w-36 bg-background">
          <InputGroupAddon>
            <span className="text-muted-foreground">Au</span>
          </InputGroupAddon>
          <InputGroupInput type="date" aria-label="Au" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </InputGroup>
        <FilterSelect
          label="État"
          value={status || "all"}
          onChange={(value) => setStatus(value === "all" ? "" : value)}
          options={[
            { value: "all", label: "Tous" },
            { value: "À contrôler", label: "À contrôler" },
            { value: "Écart", label: "Écart" },
            { value: "Validée", label: "Validée" },
            { value: "Sans encaissement", label: "Sans encaissement" },
          ]}
        />
        <FilterSelect
          label="Tournée"
          value={selectedRoute || "all"}
          onChange={(value) => setSelectedRoute(value === "all" ? "" : value)}
          options={[
            { value: "all", label: "Sélectionner" },
            ...routes.map((route) => ({
              value: route.name,
              label: `${route.name} · ${route.driverName || route.driver}`,
            })),
          ]}
        />
      </Toolbar>

      {(routesError || detailError) && (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(routesError || detailError)}
        </p>
      )}
      {error && (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <Check className="size-4 shrink-0" />
          {notice}
        </p>
      )}

      {(routesLoading || (selectedRoute && detailLoading)) && (
        <div className="grid min-h-48 place-items-center">
          <LoaderCircle className="size-7 animate-spin text-brand-600" />
        </div>
      )}
      {!routesLoading && routes.length === 0 && (
        <div className="rounded-lg border border-dashed border-hairline-strong bg-card">
          <EmptyState
            icon={Banknote}
            title="Aucune tournée à contrôler"
            description="Élargissez la période. Les encaissements sont contrôlables dès qu’ils sont déclarés, sans attendre le retour stock."
          />
        </div>
      )}

      {reconciliation && selected && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile label="Déclaré espèces" value={money(reconciliation.declaredCash)} />
            <KpiTile label="Déclaré chèques" value={money(reconciliation.declaredCheques)} />
            <KpiTile label="Total compté" value={money(countedTotal)} tone={hasDifference ? "warning" : "info"} />
            <KpiTile label="Comptabilisé" value={money(reconciliation.validatedTotal)} tone="success" />
          </section>

          <Card>
            <CardHeader className="flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle>Comptage physique</CardTitle>
                <p className="t-body text-muted-foreground">
                  Les montants ne génèrent aucun Payment Entry tant que le contrôle complet n’est pas validé.
                </p>
              </div>
              <label className="flex shrink-0 flex-col gap-1.5 sm:w-52">
                <span className="t-micro text-muted-foreground">Espèces réellement comptées</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={countedCash}
                  onChange={(event) => setCountedCash(event.target.value)}
                  className="num"
                />
              </label>
            </CardHeader>
            <CardContent className="pb-4" />
          </Card>

          <section className="space-y-3">
            {reconciliation.payments.map((payment) => {
              const edit = edits[payment.name];
              const allocated = edit?.allocations.reduce((sum, allocation) => sum + allocation.allocatedAmount, 0) || 0;
              const isCheque = payment.method === "Chèque";

              return (
                <Card key={payment.name} className="overflow-hidden">
                  <header className="flex flex-wrap items-center gap-3 border-b border-hairline p-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                      {isCheque ? <ReceiptText className="size-5" /> : <CircleDollarSign className="size-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="t-section">{payment.customerName || payment.customer}</h3>
                      <p className="truncate t-meta text-muted-foreground">
                        {payment.deliveryNote} · {payment.salesInvoice || "Facture non créée"}
                      </p>
                    </div>
                    <div className="text-right">
                      <Money value={payment.amount} precise className="block font-semibold" />
                      <p className="t-meta text-muted-foreground">{payment.status}</p>
                    </div>
                  </header>

                  <div className="space-y-4 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex flex-col gap-1.5">
                        <span className="t-micro text-muted-foreground">
                          {isCheque ? "Montant du chèque vérifié" : "Montant de la déclaration"}
                        </span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={!isCheque}
                          value={edit?.countedAmount ?? ""}
                          onChange={(event) =>
                            setEdits((current) => ({
                              ...current,
                              [payment.name]: { ...current[payment.name], countedAmount: event.target.value },
                            }))
                          }
                          className="num"
                        />
                      </label>
                      {isCheque && (
                        <label className="flex flex-col gap-1.5">
                          <span className="t-micro text-muted-foreground">Numéro du chèque</span>
                          <Input
                            value={edit?.chequeNumber ?? ""}
                            onChange={(event) =>
                              setEdits((current) => ({
                                ...current,
                                [payment.name]: { ...current[payment.name], chequeNumber: event.target.value },
                              }))
                            }
                          />
                        </label>
                      )}
                    </div>

                    <div>
                      <p className="t-micro text-muted-foreground">Ventilation des factures</p>
                      <div className="mt-2 space-y-2">
                        {edit?.allocations.map((allocation, index) => (
                          <div
                            key={allocation.salesInvoice}
                            className="grid gap-2 rounded-md bg-surface-subtle p-3 sm:grid-cols-[minmax(0,1fr)_140px] sm:items-center"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{allocation.salesInvoice}</p>
                              <p className="num t-meta text-muted-foreground">
                                Solde {money(allocation.outstandingBefore)}
                                {allocation.dueDate ? ` · échéance ${allocation.dueDate}` : ""}
                              </p>
                            </div>
                            <Input
                              aria-label={`Montant affecté à ${allocation.salesInvoice}`}
                              type="number"
                              min="0"
                              max={allocation.outstandingBefore}
                              step="0.01"
                              value={allocation.allocatedAmount}
                              onChange={(event) => updateAllocation(payment.name, index, event.target.value)}
                              className="num"
                            />
                          </div>
                        ))}
                      </div>
                      <p className="num mt-2 t-meta text-muted-foreground">
                        Affecté : {money(allocated)} · avance client : {money(Math.max(payment.amount - allocated, 0))}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}

            {!reconciliation.payments.length && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                Aucun encaissement déclaré. Le contrôle de caisse n’est pas requis. Le préparateur confirme le retour stock séparément.
              </div>
            )}
          </section>

          {hasDifference && (
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                <AlertTriangle className="size-4 shrink-0" />
                Écart de <span className="num">{money(countedTotal - reconciliation.declaredTotal)}</span>
              </p>
              <label className="mt-3 flex flex-col gap-1.5">
                <span className="t-micro text-amber-900">Motif obligatoire</span>
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="bg-white"
                  placeholder="Décrivez l’écart constaté…"
                />
              </label>
            </section>
          )}

          {reconciliation.status === "Écart" && !canResolveDiscrepancy && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
              Écart transmis au Responsable. Aucun Payment Entry ne sera créé avant sa décision.
            </p>
          )}

          {reconciliation.status !== "Validée" &&
            reconciliation.payments.length > 0 &&
            (reconciliation.status !== "Écart" || canResolveDiscrepancy) && (
              <div className="flex justify-end">
                <Button
                  size="lg"
                  onClick={() => void submit(reconciliation.status === "Écart" && canResolveDiscrepancy)}
                  disabled={
                    actions.cashier || ((hasDifference || reconciliation.status === "Écart") && !reason.trim())
                  }
                >
                  {actions.cashier ? <LoaderCircle className="animate-spin" /> : <Check />}
                  {reconciliation.status === "Écart" && canResolveDiscrepancy
                    ? "Approuver et comptabiliser l’écart"
                    : "Valider le contrôle de caisse"}
                </Button>
              </div>
            )}

          {reconciliation.status === "Validée" && (
            <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
              <Check className="size-4 shrink-0" />
              Caisse validée · <span className="num">{money(reconciliation.validatedTotal)}</span> comptabilisés.
            </p>
          )}
        </>
      )}
    </>
  );
}

export default CashierPage;
