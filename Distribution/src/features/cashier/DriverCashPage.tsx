import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, Check, LoaderCircle, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage, useDistributionMutations, useDriverCashBox, useDriverCashBoxes } from "@/shared/api/distribution";
import type { DriverCashAdjustmentInput } from "@/shared/types/distribution";

function money(value: number) {
  return `${new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 2 }).format(value)} DZD`;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("fr-DZ");
}

const adjustmentTypes: Array<DriverCashAdjustmentInput["type"]> = ["Remise", "Avance", "Ajustement"];

export function DriverCashPage({ canAdjust = false }: { canAdjust?: boolean }) {
  const [selected, setSelected] = useState("");
  const [type, setType] = useState<DriverCashAdjustmentInput["type"]>("Remise");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { data: listData, error: listError, isLoading: listLoading, mutate: refreshList } = useDriverCashBoxes();
  const boxes = useMemo(() => listData?.message || [], [listData?.message]);
  const { data, error: detailError, isLoading: detailLoading, mutate: refreshDetail } = useDriverCashBox(selected || undefined);
  const box = data?.message;
  const actions = useDistributionMutations();

  useEffect(() => {
    if (boxes.length && !boxes.some((row) => row.driver === selected)) setSelected(boxes[0].driver);
    if (!boxes.length) setSelected("");
  }, [boxes, selected]);

  const submit = async () => {
    if (!selected) return;
    setError("");
    setNotice("");
    try {
      await actions.postDriverCashAdjustment({
        driver: selected,
        type,
        amount: Number(amount || 0),
        reason: reason.trim(),
      });
      setNotice(type === "Remise" ? "Remise enregistrée." : `${type} enregistré.`);
      setAmount("");
      setReason("");
      await Promise.all([refreshList(), refreshDetail()]);
    } catch (submitError) {
      setError(apiErrorMessage(submitError));
    }
  };

  const selectedSummary = boxes.find((row) => row.driver === selected);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-blue-700">Fonds livreurs</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Caisses des livreurs</h1>
          <p className="mt-1 text-sm text-slate-500">Solde d’espèces imputé à chaque livreur. Les encaissements espèces y sont ajoutés dès la déclaration terrain ; un solde négatif est autorisé.</p>
        </div>
        <Button variant="outline" onClick={() => void Promise.all([refreshList(), selected ? refreshDetail() : Promise.resolve()])} disabled={listLoading} className="h-11 w-full sm:w-auto">
          {listLoading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
          Actualiser
        </Button>
      </header>

      {(listError || detailError) && <p role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="h-4 w-4 shrink-0" />{apiErrorMessage(listError || detailError)}</p>}
      {error && <p role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</p>}
      {notice && <p role="status" className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><Check className="h-4 w-4 shrink-0" />{notice}</p>}

      {listLoading && !boxes.length && <div className="grid min-h-48 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-blue-700" /></div>}

      {!listLoading && boxes.length === 0 && (
        <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white text-center">
          <div>
            <Wallet className="mx-auto h-10 w-10 text-slate-400" />
            <p className="mt-3 font-bold">Aucune caisse livreur</p>
            <p className="text-sm text-slate-500">Les caisses sont créées automatiquement pour chaque livreur.</p>
          </div>
        </div>
      )}

      {boxes.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <section className="space-y-2">
            {boxes.map((row) => {
              const active = row.driver === selected;
              const negative = row.balance < 0;
              return (
                <button
                  key={row.driver}
                  type="button"
                  onClick={() => { setSelected(row.driver); setError(""); setNotice(""); }}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${active ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">{row.driverName}</p>
                      <p className="text-xs text-slate-500">{row.driver}</p>
                    </div>
                    <Banknote className={`h-5 w-5 shrink-0 ${negative ? "text-red-600" : "text-emerald-700"}`} />
                  </div>
                  <p className={`mt-3 text-lg font-bold ${negative ? "text-red-700" : "text-slate-950"}`}>{money(row.balance)}</p>
                </button>
              );
            })}
          </section>

          <section className="space-y-4">
            {(detailLoading && !box) && <div className="grid min-h-40 place-items-center rounded-2xl border border-slate-200 bg-white"><LoaderCircle className="h-7 w-7 animate-spin text-blue-700" /></div>}
            {box && (
              <>
                <article className={`rounded-2xl border p-5 ${box.balance < 0 ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Solde actuel</p>
                  <h2 className="mt-1 text-2xl font-bold">{box.driverName}</h2>
                  <p className={`mt-3 text-3xl font-bold ${box.balance < 0 ? "text-red-700" : "text-slate-950"}`}>{money(box.balance)}</p>
                  <p className="mt-2 text-xs text-slate-500">Dernière mise à jour {formatDate(box.updatedAt || selectedSummary?.updatedAt)}</p>
                </article>

                {canAdjust && (
                  <form
                    className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
                    onSubmit={(event) => { event.preventDefault(); void submit(); }}
                  >
                    <div>
                      <h3 className="font-bold">Mouvement manuel</h3>
                      <p className="text-sm text-slate-500">Une remise diminue le solde, une avance l’augmente. Un ajustement accepte un montant signé.</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm font-semibold text-slate-700">Type
                        <select value={type} onChange={(event) => setType(event.target.value as DriverCashAdjustmentInput["type"])} className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 font-normal">
                          {adjustmentTypes.map((option) => <option key={option}>{option}</option>)}
                        </select>
                      </label>
                      <label className="text-sm font-semibold text-slate-700">Montant
                        <Input type="number" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1" />
                      </label>
                    </div>
                    <label className="block text-sm font-semibold text-slate-700">Motif
                      <Textarea value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1" placeholder="Expliquez le mouvement…" />
                    </label>
                    <div className="flex justify-end">
                      <Button type="submit" disabled={actions.driverCash || !reason.trim()} className="h-11 bg-blue-700 px-6 hover:bg-blue-800">
                        {actions.driverCash ? <LoaderCircle className="animate-spin" /> : <Check />}
                        Enregistrer
                      </Button>
                    </div>
                  </form>
                )}

                <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                  <h3 className="font-bold">Historique</h3>
                  {!box.movements?.length && <p className="mt-3 text-sm text-slate-500">Aucun mouvement pour l’instant.</p>}
                  {box.movements && box.movements.length > 0 && (
                    <ul className="mt-3 divide-y divide-slate-100">
                      {box.movements.map((movement) => (
                        <li key={movement.name} className="flex flex-wrap items-start justify-between gap-3 py-3">
                          <div>
                            <p className="font-semibold text-slate-900">{movement.type}</p>
                            <p className="text-xs text-slate-500">{formatDate(movement.date)}{movement.routeId ? ` · ${movement.routeId}` : ""}</p>
                            {movement.reason && <p className="mt-1 text-sm text-slate-600">{movement.reason}</p>}
                          </div>
                          <div className="text-right">
                            <p className={`font-bold ${movement.amount < 0 ? "text-red-700" : "text-emerald-700"}`}>{money(movement.amount)}</p>
                            <p className="text-xs text-slate-400">solde {money(movement.balanceAfter)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default DriverCashPage;
