import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, Check, CircleDollarSign, LoaderCircle, ReceiptText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage, useCashierReconciliation, useCashierRoutes, useDistributionMutations } from "@/shared/api/distribution";
import type { CashCollection, CashReconciliationInput, InvoiceAllocation } from "@/shared/types/distribution";

function isoDate(offsetDays = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function money(value: number) {
  return `${new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 2 }).format(value)} DZD`;
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
  const [dateFrom, setDateFrom] = useState(isoDate(-7));
  const [dateTo, setDateTo] = useState(isoDate());
  const [status, setStatus] = useState("");
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
        : "Caisse validée et écritures de paiement créées.");
      await Promise.all([refreshDetail(), refreshRoutes()]);
    } catch (submitError) {
      setError(apiErrorMessage(submitError));
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-bold text-blue-700">Contrôle financier</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Caisse des tournées</h1>
        <p className="mt-1 text-sm text-slate-500">Comptez les espèces, vérifiez chaque chèque et contrôlez la ventilation avant de créer les règlements ERPNext.</p>
      </header>

      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <label className="text-sm font-semibold text-slate-700">Du<Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1" /></label>
        <label className="text-sm font-semibold text-slate-700">Au<Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-1" /></label>
        <label className="text-sm font-semibold text-slate-700">État<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 font-normal"><option value="">Tous</option><option>À contrôler</option><option>Écart</option><option>Validée</option><option>Sans encaissement</option></select></label>
        <label className="text-sm font-semibold text-slate-700">Tournée<select value={selectedRoute} onChange={(event) => setSelectedRoute(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 font-normal"><option value="">Sélectionner</option>{routes.map((route) => <option key={route.name} value={route.name}>{route.name} · {route.driverName || route.driver}</option>)}</select></label>
      </section>

      {(routesError || detailError) && <p role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="h-4 w-4 shrink-0" />{apiErrorMessage(routesError || detailError)}</p>}
      {error && <p role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</p>}
      {notice && <p role="status" className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><Check className="h-4 w-4 shrink-0" />{notice}</p>}

      {(routesLoading || (selectedRoute && detailLoading)) && <div className="grid min-h-48 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-blue-700" /></div>}
      {!routesLoading && routes.length === 0 && <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white text-center"><div><Banknote className="mx-auto h-10 w-10 text-slate-400" /><p className="mt-3 font-bold">Aucune tournée à contrôler</p><p className="text-sm text-slate-500">Élargissez la période ou attendez la confirmation du retour stock.</p></div></div>}

      {reconciliation && selected && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase text-slate-400">Déclaré espèces</p><p className="mt-2 text-xl font-bold">{money(reconciliation.declaredCash)}</p></article>
            <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase text-slate-400">Déclaré chèques</p><p className="mt-2 text-xl font-bold">{money(reconciliation.declaredCheques)}</p></article>
            <article className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-bold uppercase text-blue-700">Total compté</p><p className="mt-2 text-xl font-bold text-blue-950">{money(countedTotal)}</p></article>
            <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-bold uppercase text-emerald-700">Comptabilisé</p><p className="mt-2 text-xl font-bold text-emerald-950">{money(reconciliation.validatedTotal)}</p></article>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-bold">Comptage physique</h2><p className="text-sm text-slate-500">Les montants ne génèrent aucun Payment Entry tant que le contrôle complet n’est pas validé.</p></div><label className="text-sm font-semibold">Espèces réellement comptées<Input type="number" min="0" step="0.01" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} className="mt-1 sm:w-52" /></label></div>
          </section>

          <section className="space-y-3">
            {reconciliation.payments.map((payment) => {
              const edit = edits[payment.name];
              const allocated = edit?.allocations.reduce((sum, allocation) => sum + allocation.allocatedAmount, 0) || 0;
              return <article key={payment.name} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-blue-50 text-blue-700">{payment.method === "Chèque" ? <ReceiptText className="h-5 w-5" /> : <CircleDollarSign className="h-5 w-5" />}</span>
                  <div className="min-w-0 flex-1"><h3 className="font-bold">{payment.customerName || payment.customer}</h3><p className="text-xs text-slate-500">{payment.deliveryNote} · {payment.salesInvoice || "Facture non créée"}</p></div>
                  <div className="text-right"><p className="font-bold">{money(payment.amount)}</p><p className="text-xs font-semibold text-slate-500">{payment.status}</p></div>
                </header>
                <div className="space-y-4 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-semibold">{payment.method === "Chèque" ? "Montant du chèque vérifié" : "Montant de la déclaration"}<Input type="number" min="0" step="0.01" disabled={payment.method !== "Chèque"} value={edit?.countedAmount ?? ""} onChange={(event) => setEdits((current) => ({ ...current, [payment.name]: { ...current[payment.name], countedAmount: event.target.value } }))} className="mt-1" /></label>
                    {payment.method === "Chèque" && <label className="text-sm font-semibold">Numéro du chèque<Input value={edit?.chequeNumber ?? ""} onChange={(event) => setEdits((current) => ({ ...current, [payment.name]: { ...current[payment.name], chequeNumber: event.target.value } }))} className="mt-1" /></label>}
                  </div>
                  <div><p className="text-xs font-bold uppercase text-slate-400">Ventilation des factures</p><div className="mt-2 space-y-2">{edit?.allocations.map((allocation, index) => <div key={allocation.salesInvoice} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_140px]"><div><p className="text-sm font-bold">{allocation.salesInvoice}</p><p className="text-xs text-slate-500">Solde {money(allocation.outstandingBefore)}{allocation.dueDate ? ` · échéance ${allocation.dueDate}` : ""}</p></div><Input aria-label={`Montant affecté à ${allocation.salesInvoice}`} type="number" min="0" max={allocation.outstandingBefore} step="0.01" value={allocation.allocatedAmount} onChange={(event) => updateAllocation(payment.name, index, event.target.value)} /></div>)}</div><p className="mt-2 text-xs text-slate-500">Affecté : {money(allocated)} · avance client : {money(Math.max(payment.amount - allocated, 0))}</p></div>
                </div>
              </article>;
            })}
            {!reconciliation.payments.length && <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Aucun encaissement déclaré. La tournée pourra être clôturée après le retour stock et la facturation.</div>}
          </section>

          {hasDifference && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="flex gap-2 text-sm font-bold text-amber-950"><AlertTriangle className="h-4 w-4" />Écart de {money(countedTotal - reconciliation.declaredTotal)}</p><label className="mt-3 block text-sm font-semibold text-amber-950">Motif obligatoire<Textarea value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 bg-white" placeholder="Décrivez l’écart constaté…" /></label></section>}

          {reconciliation.status === "Écart" && !canResolveDiscrepancy && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">Écart transmis au Responsable. Aucun Payment Entry ne sera créé avant sa décision.</p>}
          {reconciliation.status !== "Validée" && reconciliation.payments.length > 0 && (reconciliation.status !== "Écart" || canResolveDiscrepancy) && <div className="flex justify-end"><Button onClick={() => void submit(reconciliation.status === "Écart" && canResolveDiscrepancy)} disabled={actions.cashier || ((hasDifference || reconciliation.status === "Écart") && !reason.trim())} className="h-12 bg-blue-700 px-6 hover:bg-blue-800">{actions.cashier ? <LoaderCircle className="animate-spin" /> : <Check />}{reconciliation.status === "Écart" && canResolveDiscrepancy ? "Approuver et comptabiliser l’écart" : "Valider le contrôle de caisse"}</Button></div>}
          {reconciliation.status === "Validée" && <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-800"><Check />Caisse validée · {money(reconciliation.validatedTotal)} comptabilisés.</p>}
        </>
      )}
      <Button variant="outline" onClick={() => void Promise.all([refreshRoutes(), selectedRoute ? refreshDetail() : Promise.resolve()])} disabled={routesLoading} className="w-full sm:w-auto"><RefreshCw />Actualiser</Button>
    </div>
  );
}

export default CashierPage;
