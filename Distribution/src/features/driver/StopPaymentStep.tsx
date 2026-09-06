import { useState } from "react";
import { Camera, ChevronLeft, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollectedEvidenceList } from "@/features/driver/CollectedEvidenceList";
import { formatDriverMoney } from "@/features/driver/driverMobile";
import { cn } from "@/lib/utils";
import type { EvidenceInput, PaymentInput, RouteStop } from "@/shared/types/distribution";

export function StopPaymentStep({
  stop,
  evidence,
  payment,
  paymentEnabled,
  suggestedAmount,
  stepIndex,
  stepCount,
  saving,
  error,
  onPaymentChange,
  onToggleCollect,
  onChequePhoto,
  onReviewEvidence,
  onBack,
  onConfirm,
}: {
  stop: RouteStop;
  evidence: Partial<EvidenceInput>;
  payment: Partial<PaymentInput>;
  paymentEnabled: boolean;
  suggestedAmount: number;
  stepIndex: number;
  stepCount: number;
  saving: boolean;
  error?: string;
  onPaymentChange: (patch: Partial<PaymentInput>) => void;
  onToggleCollect: (enabled: boolean) => void;
  onChequePhoto: (file?: File) => void;
  onReviewEvidence: () => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const [customAmount, setCustomAmount] = useState(
    payment.amount != null && payment.amount !== suggestedAmount,
  );
  const method = payment.method || "cash";
  const amount = payment.amount ?? suggestedAmount;
  const located = evidence.latitude != null && evidence.longitude != null;
  const collecting = paymentEnabled;
  const confirmCollect = collecting && amount > 0;

  const chooseExact = () => {
    setCustomAmount(false);
    onToggleCollect(true);
    onPaymentChange({ amount: suggestedAmount });
  };

  const chooseCustom = () => {
    setCustomAmount(true);
    onToggleCollect(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="shrink-0 border-b px-4 pb-3 pt-2.5">
        <span className="mx-auto mb-3 block h-1 w-9 rounded-full bg-border" />
        <p className="num t-meta text-muted-foreground">
          {stop.deliveryNote} · étape {stepIndex + 1} / {stepCount}
        </p>
        <h2 className="mt-1 pr-12 text-[19px] font-semibold tracking-tight">Encaissement</h2>
        <div className="mt-3 flex gap-1" aria-hidden="true">
          {Array.from({ length: stepCount }, (_, index) => (
            <span
              key={index}
              className={cn("h-1 flex-1 rounded-sm", index <= stepIndex ? "bg-foreground" : "bg-border")}
            />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto bg-surface-subtle px-4 py-4">
        {error ? (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="space-y-3.5 rounded-2xl border bg-background p-4">
          <div>
            <p className="num t-micro tracking-[0.09em] text-muted-foreground uppercase">Montant suggéré</p>
            <p className="num mt-1 text-[34px] leading-none font-medium tracking-tight">
              {formatDriverMoney(suggestedAmount, true)}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {stop.amountToCollect && suggestedAmount !== stop.amountToCollect
                ? `Facture estimée · BL ${formatDriverMoney(stop.amountToCollect, false)}`
                : "Total du bon · modifiable"}
            </p>
          </div>

          <div className="flex gap-[3px] rounded-xl bg-muted p-[3px]">
            {(["cash", "cheque"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onPaymentChange({ method: value })}
                className={cn(
                  "h-[46px] flex-1 rounded-[9px] text-[14.5px]",
                  method === value ? "bg-foreground font-semibold text-background" : "font-medium text-muted-foreground",
                )}
              >
                {value === "cash" ? "Espèces" : "Chèque"}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={chooseExact}
            className={cn(
              "h-11 flex-1 rounded-[10px] text-[13.5px] font-medium",
                collecting && !customAmount && "border-foreground",
              )}
            >
              Montant exact
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={chooseCustom}
              className={cn(
                "h-11 flex-1 rounded-[10px] text-[13.5px] font-medium",
                collecting && customAmount && "border-foreground",
              )}
            >
              Autre montant
            </Button>
          </div>

          {customAmount ? (
            <Input
              type="number"
              min="0"
              step="0.01"
              value={payment.amount ?? ""}
              onChange={(event) => onPaymentChange({ amount: Number(event.target.value) })}
              className="num h-14 rounded-touch text-base"
              placeholder="Montant DZD"
              aria-label="Montant encaissé"
            />
          ) : null}

          {method === "cheque" ? (
            <div className="space-y-2">
              <Input
                value={payment.chequeNumber || ""}
                onChange={(event) => onPaymentChange({ chequeNumber: event.target.value })}
                className="h-14 rounded-touch text-base"
                placeholder="Numéro du chèque"
              />
              <label className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-touch border text-sm font-semibold">
                <Camera className="size-4" />
                {payment.chequePhotoData ? "Photo du chèque ajoutée" : "Photo du chèque"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => onChequePhoto(event.target.files?.[0])}
                />
              </label>
              <Input
                type="date"
                value={payment.collectionDate || ""}
                onChange={(event) => onPaymentChange({ collectionDate: event.target.value })}
                className="h-14 rounded-touch text-base"
                aria-label="Date d’encaissement"
              />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => onToggleCollect(false)}
            className={cn(
              "flex h-11 w-full items-center justify-center text-[13.5px] font-medium text-muted-foreground",
              !collecting && "font-semibold",
            )}
          >
            Je n’encaisse rien maintenant
          </button>
        </div>

        <CollectedEvidenceList
          gpsAccuracy={evidence.accuracy}
          hasGps={located}
          hasPhoto={Boolean(evidence.photoData)}
          hasSignature={Boolean(evidence.signatureData)}
          onReviewPhoto={evidence.photoData ? onReviewEvidence : undefined}
          onReviewSignature={evidence.signatureData ? onReviewEvidence : undefined}
        />
      </div>

      <div className="shrink-0 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-2.5">
          <Button type="button" variant="outline" onClick={onBack} disabled={saving} className="h-[3.5rem] w-[6.25rem]">
            <ChevronLeft />
            Retour
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="h-[3.5rem] flex-1 flex-col gap-0 py-1 whitespace-normal"
          >
            {saving ? <LoaderCircle className="animate-spin" /> : null}
            <span className="text-[15.5px] font-semibold">
              {confirmCollect ? "Encaisser et valider" : "Valider l’arrêt"}
            </span>
            {confirmCollect ? (
              <span className="num text-xs font-medium opacity-70">{formatDriverMoney(amount, true)}</span>
            ) : null}
          </Button>
        </div>
      </div>
    </div>
  );
}
