import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage, useDistributionMutations } from "@/shared/api/distribution";
import {
  confirmOperation,
  markOperationAttempt,
  queueOperation,
} from "@/shared/persistence/pendingOperations";
import type {
  DeliveryOutcome,
  EvidenceInput,
  PaymentInput,
  RouteStop,
  StopCompletionPayload,
  StopCompletionResult,
} from "@/shared/types/distribution";
import { StopEvidenceStep } from "@/features/driver/StopEvidenceStep";
import { StopOutcomeStep } from "@/features/driver/StopOutcomeStep";
import { StopPaymentStep } from "@/features/driver/StopPaymentStep";
import { estimatedCollectableAmount, validateStopForm } from "@/features/driver/validation";
import {
  compressImage,
  FAILURE_REASONS,
  readStopForm,
  stopFormKey,
  type SavedStopForm,
} from "@/features/driver/stopHelpers";
import { itemGroups, visitKey, visitNotesLabel } from "@/features/driver/visitHelpers";
import { useStopWizardSteps, wizardSteps, type WizardStep } from "@/features/driver/useStopWizardSteps";
import { cn } from "@/lib/utils";

export { wizardSteps, type WizardStep };

const STEP_LABELS: Record<WizardStep, string> = {
  outcome: "Résultat",
  detail: "Détail",
  evidence: "Preuves",
  payment: "Encaissement",
};

export function validateWizardStep(
  step: WizardStep,
  input: Parameters<typeof validateStopForm>[0],
): string {
  if (step === "outcome") return "";
  if (step === "detail") {
    if (input.outcome === "partial" && !Object.values(input.quantities).some((quantity) => quantity > 0)) {
      return "Saisissez au moins une quantité livrée.";
    }
    if (input.outcome === "failed" && (!input.failureReason || !input.comment.trim())) {
      return "Le motif et le commentaire sont obligatoires.";
    }
    return "";
  }
  if (step === "evidence") return "";
  if (step === "payment") {
    if (!input.paymentEnabled) return "";
    return validateStopForm(input);
  }
  return validateStopForm(input);
}

export function StopCompletionWizard({
  stop,
  routeId,
  routeRevision,
  onDone,
  onClose,
  onPending,
}: {
  stop: RouteStop;
  routeId: string;
  routeRevision: number;
  onDone: (result: StopCompletionResult) => Promise<void>;
  onClose: () => void;
  onPending: () => void;
}) {
  const draftKey = stopFormKey(routeId, visitKey(stop.customer, stop.deliveryNote) || stop.deliveryNote);
  const restored = useMemo(() => readStopForm(draftKey), [draftKey]);
  const [requestId] = useState(restored.requestId || crypto.randomUUID());
  const [outcome, setOutcome] = useState<DeliveryOutcome>(restored.outcome || "delivered");
  const [quantities, setQuantities] = useState<Record<string, number>>(restored.quantities || {});
  const [failureReason, setFailureReason] = useState(restored.failureReason || "");
  const [comment, setComment] = useState(restored.comment || "");
  const [evidence, setEvidence] = useState<Partial<EvidenceInput>>(restored.evidence || {});
  const [paymentEnabled, setPaymentEnabled] = useState(restored.paymentEnabled || false);
  const [payment, setPayment] = useState<Partial<PaymentInput>>(restored.payment || { method: "cash" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const actions = useDistributionMutations();
  const groups = useMemo(() => itemGroups(stop), [stop]);
  const suggestedAmount = useMemo(
    () => estimatedCollectableAmount(stop, outcome, quantities),
    [outcome, quantities, stop],
  );
  const lastSuggested = useRef(suggestedAmount);
  const { step, steps, stepIndex, isFirst, isLast, goNext: advance, goBack, selectOutcome } = useStopWizardSteps(outcome);
  const validationInput = {
    outcome,
    quantities,
    failureReason,
    comment,
    evidence,
    paymentEnabled,
    payment,
    amountToCollect: suggestedAmount,
    requiresCustomerGeolocation: stop.requiresCustomerGeolocation,
  };

  useEffect(() => {
    const draft: SavedStopForm = {
      requestId,
      outcome,
      quantities,
      failureReason,
      comment,
      evidence,
      paymentEnabled,
      payment,
    };
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [comment, draftKey, evidence, failureReason, outcome, payment, paymentEnabled, quantities, requestId]);

  useEffect(() => {
    const previous = lastSuggested.current;
    lastSuggested.current = suggestedAmount;
    if (!paymentEnabled || outcome === "failed") return;
    setPayment((current) => {
      if (current.amount != null && current.amount !== 0 && current.amount !== previous) return current;
      if (current.amount === suggestedAmount) return current;
      return { ...current, amount: suggestedAmount || undefined };
    });
  }, [outcome, paymentEnabled, suggestedAmount]);

  const locate = (manual = false) => {
    if (!navigator.geolocation) {
      if (manual) setError("Position GPS indisponible. Autorisez la localisation puis réessayez.");
      return;
    }
    if (manual) setError("");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setEvidence((current) => ({
          ...current,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }));
        setLocating(false);
      },
      () => {
        setLocating(false);
        if (manual) setError("Position GPS indisponible. Autorisez la localisation puis réessayez.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  useEffect(() => {
    if (restored.evidence?.latitude != null && restored.evidence?.longitude != null) return;
    locate();
    // GPS une seule fois à l'ouverture ; le tap manuel relance via locate().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chequePhoto = async (file?: File) => {
    if (!file) return;
    try {
      const chequePhotoData = await compressImage(file);
      setPayment((current) => ({ ...current, chequePhotoData }));
    } catch {
      setError("La photo du chèque n’a pas pu être préparée.");
    }
  };

  const submit = async () => {
    const invalid = validateStopForm(validationInput);
    if (invalid) {
      setError(invalid);
      return;
    }
    const payload: StopCompletionPayload = {
      requestId,
      routeId,
      routeRevision,
      deliveryNote: stop.deliveryNote,
      deliveryNotes: stop.deliveryNotes?.length ? stop.deliveryNotes : [stop.deliveryNote],
      visitKey: visitKey(stop.customer, stop.deliveryNote),
      outcome,
      items: (stop.items || []).map((item) => ({
        itemName: item.name,
        deliveredQuantity: outcome === "partial" ? quantities[item.name] || 0 : item.remainingQuantity,
        deliveryNote: item.deliveryNote || stop.deliveryNote,
      })),
      evidence: {
        latitude: evidence.latitude as number,
        longitude: evidence.longitude as number,
        accuracy: evidence.accuracy,
        photoData: evidence.photoData,
        signatureData: evidence.signatureData,
        signerName: evidence.signerName,
        comment,
      },
      failureReason: outcome === "failed" ? failureReason : undefined,
      failureComment: outcome === "failed" ? comment : undefined,
      payment: paymentEnabled ? (payment as PaymentInput) : undefined,
    };
    queueOperation(payload);
    markOperationAttempt(requestId);
    setSaving(true);
    setError("");
    try {
      const result = await actions.completeStop(payload);
      confirmOperation(requestId);
      localStorage.removeItem(draftKey);
      await onDone(result);
      onClose();
    } catch (submitError) {
      onPending();
      setError(`${apiErrorMessage(submitError)} Le formulaire reste enregistré pour une nouvelle tentative.`);
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    const invalid = validateWizardStep(step, validationInput);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError("");
    if (isLast) {
      void submit();
      return;
    }
    advance();
  };

  const goPrev = () => {
    setError("");
    goBack();
  };

  const reviewEvidence = () => {
    setError("");
    goBack();
  };

  const confirmLabel = "Continuer";

  return (
    <Sheet open onOpenChange={(open) => !open && !saving && onClose()}>
      <SheetContent
        side="bottom"
        aria-label={`Résultat ${visitNotesLabel(stop)}`}
        showCloseButton={step !== "evidence"}
        className={cn(
          "max-h-[95vh] rounded-t-touch",
          step === "evidence" && "h-[95vh] gap-0 overflow-hidden p-0",
          step === "payment" && "max-h-[95vh] gap-0 overflow-hidden p-0",
        )}
      >
        {step === "evidence" ? (
          <StopEvidenceStep
            stop={stop}
            evidence={evidence}
            locating={locating}
            stepIndex={stepIndex}
            stepCount={steps.length}
            amount={suggestedAmount}
            nextLabel={isLast ? "Valider l’arrêt" : "Continuer"}
            saving={saving}
            error={error}
            onRetryGps={() => locate(true)}
            onChange={(patch) => {
              setError("");
              setEvidence((current) => ({ ...current, ...patch }));
            }}
            onBack={goPrev}
            onContinue={goNext}
          />
        ) : step === "payment" ? (
          <StopPaymentStep
            stop={stop}
            evidence={evidence}
            payment={payment}
            paymentEnabled={paymentEnabled}
            suggestedAmount={suggestedAmount}
            stepIndex={stepIndex}
            stepCount={steps.length}
            saving={saving}
            error={error}
            onPaymentChange={(patch) => {
              setError("");
              setPayment((current) => ({ ...current, ...patch }));
            }}
            onToggleCollect={(enabled) => {
              setError("");
              setPaymentEnabled(enabled);
            }}
            onChequePhoto={(file) => void chequePhoto(file)}
            onReviewEvidence={reviewEvidence}
            onBack={goPrev}
            onConfirm={goNext}
          />
        ) : (
          <>
        <SheetHeader>
          <p className="t-meta font-semibold text-brand-700">
            {visitNotesLabel(stop)} · {Math.min(stepIndex, steps.length - 1) + 1}/{steps.length}
          </p>
          <SheetTitle>{stop.customerName}</SheetTitle>
          <p className="t-meta text-muted-foreground">{STEP_LABELS[step]}</p>
          <div className="mt-3 flex gap-1" aria-hidden="true">
            {steps.map((item, index) => (
              <span
                key={item}
                className={`h-1 flex-1 rounded-full ${index <= stepIndex ? "bg-brand-600" : "bg-slate-200"}`}
              />
            ))}
          </div>
        </SheetHeader>

        <SheetBody className="space-y-4 bg-surface-subtle">
          {error && (
            <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          )}

          {step === "outcome" && (
            <StopOutcomeStep
              stop={stop}
              gpsAccuracy={evidence.accuracy}
              locating={locating}
              onRetryGps={() => locate(true)}
              onSelect={(value) => {
                setError("");
                selectOutcome(setOutcome, value);
              }}
            />
          )}

          {step === "detail" && outcome === "partial" && (
            <fieldset>
              <legend className="t-section">Quantités livrées maintenant</legend>
              <div className="mt-3 space-y-4">
                {groups.map((group) => (
                  <div key={group.deliveryNote} className="space-y-2">
                    {groups.length > 1 ? (
                      <p className="num t-meta font-semibold text-muted-foreground">{group.deliveryNote}</p>
                    ) : null}
                    {group.items.map((item) => (
                  <label key={item.name} className="flex items-center gap-3 rounded-touch border border-hairline bg-white p-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.itemName}</span>
                      <span className="num t-meta text-muted-foreground">Reste {item.remainingQuantity}</span>
                    </span>
                    <Input
                      type="number"
                      min="0"
                      max={item.remainingQuantity}
                      step="any"
                      value={quantities[item.name] ?? ""}
                      onChange={(event) =>
                        setQuantities((current) => ({ ...current, [item.name]: Number(event.target.value) }))
                      }
                      className="num h-12 w-24 text-base"
                      aria-label={`Quantité ${item.itemName}`}
                    />
                  </label>
                    ))}
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          {step === "detail" && outcome === "failed" && (
            <div className="space-y-3">
              <label className="block">
                <span className="t-section">Motif</span>
                <NativeSelect
                  size="touch"
                  value={failureReason}
                  onChange={(event) => setFailureReason(event.target.value)}
                  className="mt-2"
                >
                  <option value="">Sélectionner</option>
                  {FAILURE_REASONS.map((reason) => (
                    <option key={reason}>{reason}</option>
                  ))}
                </NativeSelect>
              </label>
              <label className="block">
                <span className="t-section">Commentaire</span>
                <Textarea value={comment} onChange={(event) => setComment(event.target.value)} className="mt-2 min-h-24 bg-white" />
              </label>
            </div>
          )}
        </SheetBody>

        <SheetFooter className="gap-2">
          {isFirst ? (
            <Button variant="outline" size="touch" onClick={onClose} className="flex-1" disabled={saving}>
              Annuler
            </Button>
          ) : (
            <Button variant="outline" size="touch" onClick={goPrev} className="flex-1" disabled={saving}>
              <ChevronLeft />
              Retour
            </Button>
          )}
          {isFirst ? null : (
            <Button size="touch" onClick={goNext} disabled={saving} className="flex-[2]">
              {saving ? <LoaderCircle className="animate-spin" /> : isLast ? <Check /> : null}
              {confirmLabel}
            </Button>
          )}
        </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
