import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, Check, LoaderCircle, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage, useDistributionMutations, useDriverCashBox, useDriverCashBoxes } from "@/shared/api/distribution";
import { formatDateTime } from "@/shared/format";
import type { DriverCashAdjustmentInput, DriverCashMovement } from "@/shared/types/distribution";

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

  const movementColumns: Array<DataTableColumn<DriverCashMovement>> = [
    {
      id: "type",
      header: "Mouvement",
      sortValue: (movement) => movement.type,
      cell: (movement) => (
        <div className="min-w-0">
          <p className="font-medium">{movement.type}</p>
          <p className="num truncate t-meta text-muted-foreground">
            {formatDateTime(movement.date)}
            {movement.routeId ? ` · ${movement.routeId}` : ""}
          </p>
          {movement.reason && <p className="mt-0.5 t-meta text-slate-600">{movement.reason}</p>}
        </div>
      ),
    },
    {
      id: "amount",
      header: "Montant",
      width: "150px",
      align: "right",
      numeric: true,
      sortValue: (movement) => movement.amount,
      cell: (movement) => (
        <Money
          value={movement.amount}
          precise
          className={`font-semibold ${movement.amount < 0 ? "text-red-700" : "text-emerald-700"}`}
        />
      ),
    },
    {
      id: "balance",
      header: "Solde après",
      width: "150px",
      align: "right",
      numeric: true,
      hideBelow: "sm",
      sortValue: (movement) => movement.balanceAfter,
      cell: (movement) => <Money value={movement.balanceAfter} precise signed className="text-muted-foreground" />,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Fonds livreurs"
        title="Caisses des livreurs"
        description="Solde d’espèces imputé à chaque livreur. Les encaissements espèces y sont ajoutés dès la déclaration terrain ; la validation de tournée les remet automatiquement. Un solde négatif est autorisé."
        actions={
          <Button
            variant="outline"
            onClick={() => void Promise.all([refreshList(), selected ? refreshDetail() : Promise.resolve()])}
            disabled={listLoading}
          >
            {listLoading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            Actualiser
          </Button>
        }
      />

      {(listError || detailError) && (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(listError || detailError)}
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

      {listLoading && !boxes.length && (
        <div className="grid min-h-48 place-items-center">
          <LoaderCircle className="size-7 animate-spin text-brand-600" />
        </div>
      )}

      {!listLoading && boxes.length === 0 && (
        <div className="rounded-lg border border-dashed border-hairline-strong bg-card">
          <EmptyState
            icon={Wallet}
            title="Aucune caisse livreur"
            description="Les caisses sont créées automatiquement pour chaque livreur."
          />
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
                  aria-pressed={active}
                  className={`w-full rounded-lg border p-4 text-left shadow-card transition-colors ${active ? "border-brand-300 bg-brand-50" : "border-hairline bg-card hover:border-hairline-strong"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="t-section text-foreground">{row.driverName}</p>
                      <p className="t-meta text-muted-foreground">{row.driver}</p>
                    </div>
                    <Banknote className={`size-5 shrink-0 ${negative ? "text-red-600" : "text-emerald-700"}`} />
                  </div>
                  <Money value={row.balance} precise signed className="mt-3 block text-lg font-semibold" />
                </button>
              );
            })}
          </section>

          <section className="space-y-4">
            {detailLoading && !box && (
              <div className="grid min-h-40 place-items-center rounded-lg border border-hairline bg-card">
                <LoaderCircle className="size-7 animate-spin text-brand-600" />
              </div>
            )}
            {box && (
              <>
                <Card className={`p-5 ${box.balance < 0 ? "border-red-200 bg-red-50" : ""}`}>
                  <p className="t-micro text-muted-foreground">Solde actuel</p>
                  <h2 className="mt-1 t-display">{box.driverName}</h2>
                  <Money value={box.balance} precise signed className="mt-3 block text-3xl font-semibold tracking-tight" />
                  <p className="num mt-2 t-meta text-muted-foreground">
                    Dernière mise à jour {formatDateTime(box.updatedAt || selectedSummary?.updatedAt)}
                  </p>
                </Card>

                {canAdjust && (
                  <form
                    className="space-y-3 rounded-lg border border-hairline bg-card p-4 shadow-card sm:p-5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submit();
                    }}
                  >
                    <div>
                      <h3 className="t-section">Mouvement manuel</h3>
                      <p className="t-body text-muted-foreground">
                        La validation de tournée remet automatiquement les espèces. Une remise manuelle diminue le solde, une avance l’augmente. Un ajustement accepte un montant signé.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex flex-col gap-1.5">
                        <span className="t-micro text-muted-foreground">Type</span>
                        <NativeSelect
                          value={type}
                          onChange={(event) => setType(event.target.value as DriverCashAdjustmentInput["type"])}
                        >
                          {adjustmentTypes.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </NativeSelect>
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="t-micro text-muted-foreground">Montant</span>
                        <Input
                          type="number"
                          step="0.01"
                          value={amount}
                          onChange={(event) => setAmount(event.target.value)}
                          className="num"
                        />
                      </label>
                    </div>
                    <label className="flex flex-col gap-1.5">
                      <span className="t-micro text-muted-foreground">Motif</span>
                      <Textarea
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Expliquez le mouvement…"
                      />
                    </label>
                    <div className="flex justify-end">
                      <Button type="submit" size="lg" disabled={actions.driverCash || !reason.trim()}>
                        {actions.driverCash ? <LoaderCircle className="animate-spin" /> : <Check />}
                        Enregistrer
                      </Button>
                    </div>
                  </form>
                )}

                <section className="space-y-2">
                  <h3 className="t-section">Historique</h3>
                  <DataTable
                    label={`Mouvements de caisse de ${box.driverName}`}
                    columns={movementColumns}
                    rows={box.movements || []}
                    rowKey={(movement) => movement.name}
                    rowTone={(movement) => (movement.amount < 0 ? "danger" : "success")}
                    maxHeight="max-h-[50vh]"
                    empty={
                      <p className="py-8 text-center t-body text-muted-foreground">Aucun mouvement pour l’instant.</p>
                    }
                  />
                </section>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export default DriverCashPage;
