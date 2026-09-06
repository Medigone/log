import { useEffect, useState } from "react";
import { AlertTriangle, Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Textarea } from "@/components/ui/textarea";
import { ADJUSTMENT_TYPES, signedAdjustment, type CashAdjustmentType } from "@/features/cashier/driverCashTotals";
import { cn } from "@/lib/utils";

export function DriverCashDialog({
  open,
  onOpenChange,
  driverName,
  currentBalance,
  defaultType = "Remise",
  defaultAmount = "",
  submitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverName: string;
  currentBalance: number;
  defaultType?: CashAdjustmentType;
  defaultAmount?: string;
  submitting: boolean;
  error: string;
  onSubmit: (payload: { type: CashAdjustmentType; amount: number; reason: string }) => void;
}) {
  const [type, setType] = useState<CashAdjustmentType>(defaultType);
  const [amount, setAmount] = useState(defaultAmount);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setType(defaultType);
    setAmount(defaultAmount);
    setReason("");
  }, [open, defaultType, defaultAmount]);

  const parsedAmount = Number(amount || 0);
  const previewDelta = signedAdjustment(type, parsedAmount);
  const previewBalance = currentBalance + previewDelta;
  const canSubmit = Boolean(reason.trim()) && Math.abs(parsedAmount) > 0.000001 && !submitting;
  const blocker = !reason.trim() || Math.abs(parsedAmount) <= 0.000001 ? "Montant et motif obligatoires." : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            onSubmit({ type, amount: parsedAmount, reason: reason.trim() });
          }}
        >
          <DialogHeader>
            <DialogTitle>Opération de caisse</DialogTitle>
            <DialogDescription>
              {driverName}. Une remise diminue le solde, une avance l’augmente. Un ajustement accepte un montant signé. Le motif est obligatoire — l’opération est horodatée et attribuée à son auteur.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {error ? (
              <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <AlertTriangle className="size-4 shrink-0" />
                {error}
              </p>
            ) : null}
            <div>
              <span className="t-micro text-muted-foreground">Type</span>
              <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg border border-hairline bg-surface-subtle p-1">
                {ADJUSTMENT_TYPES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={type === option}
                    onClick={() => setType(option)}
                    className={cn(
                      "h-8 rounded-md text-xs font-medium",
                      type === option ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="t-micro text-muted-foreground">Montant</span>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="num"
                aria-label="Montant"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="t-micro text-muted-foreground">Motif</span>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Expliquez le mouvement…"
              />
            </label>
            {amount !== "" ? (
              <p className="rounded-md bg-surface-subtle p-3 t-body text-muted-foreground">
                Le solde passera de{" "}
                <Money value={currentBalance} precise signed className="font-semibold text-foreground" /> à{" "}
                <Money value={previewBalance} precise signed className="font-semibold text-foreground" />
                {previewDelta !== 0 ? (
                  <>
                    {" "}
                    ({previewDelta > 0 ? "+" : ""}
                    <Money value={previewDelta} precise className="font-semibold text-foreground" />)
                  </>
                ) : null}
                .
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            {blocker ? <p className="mr-auto text-xs text-muted-foreground">{blocker}</p> : null}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? <LoaderCircle className="animate-spin" /> : <Check />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
