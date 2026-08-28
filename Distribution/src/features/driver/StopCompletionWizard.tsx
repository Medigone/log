import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, ChevronLeft, LocateFixed, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage, useDistributionMutations } from "@/shared/api/distribution";
import { formatMoney } from "@/shared/format";
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
import { SignaturePad } from "@/features/driver/SignaturePad";
import { estimatedCollectableAmount, validateStopForm } from "@/features/driver/validation";
import {
  compressImage,
  FAILURE_REASONS,
  readStopForm,
  stopFormKey,
  type SavedStopForm,
} from "@/features/driver/stopHelpers";

export type WizardStep = "outcome" | "detail" | "evidence" | "payment" | "summary";

const STEP_LABELS: Record<WizardStep, string> = {
  outcome: "Résultat",
  detail: "Détail",
  evidence: "Preuves",
  payment: "Encaissement",
  summary: "Récapitulatif",
};

const OUTCOME_LABELS: Record<DeliveryOutcome, string> = {
  delivered: "Livré",
  partial: "Partiel",
  failed: "Échec",
};

export function wizardSteps(outcome: DeliveryOutcome): WizardStep[] {
  const steps: WizardStep[] = ["outcome"];
  if (outcome === "partial" || outcome === "failed") steps.push("detail");
  steps.push("evidence");
  if (outcome !== "failed") steps.push("payment");
  steps.push("summary");
  return steps;
}

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
  if (step === "evidence") {
    return validateStopForm({ ...input, paymentEnabled: false });
  }
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
  const draftKey = stopFormKey(routeId, stop.deliveryNote);
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
  const [stepIndex, setStepIndex] = useState(0);
  const actions = useDistributionMutations();
  const suggestedAmount = useMemo(
    () => estimatedCollectableAmount(stop, outcome, quantities),
    [outcome, quantities, stop],
  );
  const lastSuggested = useRef(suggestedAmount);
  const steps = wizardSteps(outcome);
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isFirst = stepIndex === 0;
  const isLast = step === "summary";
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

  const photo = async (file?: File) => {
    if (!file) return;
    try {
      const photoData = await compressImage(file);
      setEvidence((current) => ({ ...current, photoData }));
    } catch {
      setError("La photo n’a pas pu être préparée.");
    }
  };

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
      outcome,
      items: (stop.items || []).map((item) => ({
        itemName: item.name,
        deliveredQuantity: outcome === "partial" ? quantities[item.name] || 0 : item.remainingQuantity,
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
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  };

  const goBack = () => {
    setError("");
    setStepIndex((current) => Math.max(current - 1, 0));
  };

  const gpsOk =
    evidence.latitude != null &&
    !(stop.requiresCustomerGeolocation && outcome !== "failed" && (evidence.accuracy == null || evidence.accuracy > 50));

  return (
    <Sheet open onOpenChange={(open) => !open && !saving && onClose()}>
      <SheetContent side="bottom" aria-label={`Résultat ${stop.deliveryNote}`} className="max-h-[95vh] rounded-t-touch">
        <SheetHeader>
          <p className="t-meta font-semibold text-brand-700">
            {stop.deliveryNote} · {Math.min(stepIndex, steps.length - 1) + 1}/{steps.length}
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
            <fieldset>
              <legend className="t-section">Résultat de l’arrêt</legend>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(
                  [
                    ["delivered", "Livré"],
                    ["partial", "Partiel"],
                    ["failed", "Échec"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={outcome === value}
                    onClick={() => setOutcome(value)}
                    className={`h-20 rounded-touch border text-base font-semibold transition-colors ${
                      outcome === value
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-hairline-strong bg-white text-slate-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {step === "detail" && outcome === "partial" && (
            <fieldset>
              <legend className="t-section">Quantités livrées maintenant</legend>
              <div className="mt-3 space-y-2">
                {stop.items?.map((item) => (
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

          {step === "evidence" && (
            <div className="space-y-3">
              {stop.requiresCustomerGeolocation && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                  <p className="font-semibold">GPS client à collecter</p>
                  <p className="mt-1 text-amber-800">
                    Une position précise à 50 m ou moins sera conservée pour les prochaines livraisons.
                  </p>
                </div>
              )}
              <Button type="button" variant="outline" size="touch" onClick={() => locate(true)} className="w-full" disabled={locating}>
                {locating ? <LoaderCircle className="animate-spin" /> : <LocateFixed />}
                {locating
                  ? "Localisation…"
                  : evidence.latitude != null
                    ? "Reprendre la localisation"
                    : stop.requiresCustomerGeolocation
                      ? "Localiser ce client"
                      : "Enregistrer la position GPS"}
              </Button>
              {evidence.latitude != null && (
                <p
                  className={`num text-center t-meta font-semibold ${
                    stop.requiresCustomerGeolocation && outcome !== "failed" && (evidence.accuracy == null || evidence.accuracy > 50)
                      ? "text-red-700"
                      : "text-emerald-700"
                  }`}
                >
                  Précision : {Math.round(evidence.accuracy || 0)} m
                  {stop.requiresCustomerGeolocation &&
                  outcome !== "failed" &&
                  evidence.accuracy != null &&
                  evidence.accuracy > 50
                    ? " · recommencez pour atteindre 50 m ou moins"
                    : ""}
                </p>
              )}
              {outcome !== "failed" && (
                <>
                  <label className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-touch border border-hairline-strong bg-white text-sm font-semibold">
                    <Camera className="size-4" />
                    {evidence.photoData ? "Photo ajoutée" : "Ajouter une photo"}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={(event) => photo(event.target.files?.[0])}
                    />
                  </label>
                  <p className="text-center t-meta font-semibold text-subtle">OU</p>
                  <SignaturePad onChange={(signatureData) => setEvidence((current) => ({ ...current, signatureData }))} />
                  {evidence.signatureData && (
                    <Input
                      value={evidence.signerName || ""}
                      onChange={(event) => setEvidence((current) => ({ ...current, signerName: event.target.value }))}
                      className="h-12 text-base"
                      placeholder="Nom du signataire"
                    />
                  )}
                </>
              )}
            </div>
          )}

          {step === "payment" && (
            <div className="space-y-3">
              <p className="t-body text-muted-foreground">
                Passez cette étape si vous n’encaissez rien maintenant.
                {outcome === "partial"
                  ? ` Facture estimée : ${formatMoney(suggestedAmount)} sur un BL de ${formatMoney(stop.amountToCollect)}.`
                  : ` Facture estimée : ${formatMoney(suggestedAmount)}.`}
              </p>
              {!paymentEnabled ? (
                <Button type="button" variant="outline" size="touch" className="w-full" onClick={() => setPaymentEnabled(true)}>
                  Déclarer un encaissement
                </Button>
              ) : (
                <div className="space-y-3 rounded-touch border border-hairline bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="t-section">Encaissement</p>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setPaymentEnabled(false)}>
                      Ne pas encaisser
                    </Button>
                  </div>
                  <NativeSelect
                    size="touch"
                    aria-label="Mode de paiement"
                    value={payment.method}
                    onChange={(event) =>
                      setPayment((current) => ({ ...current, method: event.target.value as PaymentInput["method"] }))
                    }
                  >
                    <option value="cash">Espèces</option>
                    <option value="cheque">Chèque</option>
                  </NativeSelect>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payment.amount ?? ""}
                    onChange={(event) => setPayment((current) => ({ ...current, amount: Number(event.target.value) }))}
                    className="num h-14 rounded-touch text-base"
                    placeholder="Montant DZD"
                  />
                  {payment.method === "cheque" && (
                    <>
                      <Input
                        value={payment.chequeNumber || ""}
                        onChange={(event) => setPayment((current) => ({ ...current, chequeNumber: event.target.value }))}
                        className="h-14 rounded-touch text-base"
                        placeholder="Numéro du chèque"
                      />
                      <label className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-touch border border-hairline-strong text-sm font-semibold">
                        <Camera className="size-4" />
                        {payment.chequePhotoData ? "Photo du chèque ajoutée" : "Photo du chèque"}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="sr-only"
                          onChange={(event) => chequePhoto(event.target.files?.[0])}
                        />
                      </label>
                      <Input
                        type="date"
                        value={payment.collectionDate || ""}
                        onChange={(event) =>
                          setPayment((current) => ({ ...current, collectionDate: event.target.value }))
                        }
                        className="h-14 rounded-touch text-base"
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {step === "summary" && (
            <dl className="space-y-3 rounded-touch border border-hairline bg-white p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Résultat</dt>
                <dd className="font-semibold">{OUTCOME_LABELS[outcome]}</dd>
              </div>
              {outcome === "failed" && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Motif</dt>
                  <dd className="font-semibold">{failureReason}</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">GPS</dt>
                <dd className={`num font-semibold ${gpsOk ? "text-emerald-700" : "text-red-700"}`}>
                  {evidence.latitude != null ? `${Math.round(evidence.accuracy || 0)} m` : "Manquant"}
                </dd>
              </div>
              {outcome !== "failed" && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Preuve</dt>
                  <dd className="font-semibold">{evidence.photoData ? "Photo" : evidence.signatureData ? "Signature" : "Manquante"}</dd>
                </div>
              )}
              {outcome !== "failed" && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Encaissement</dt>
                  <dd className="num font-semibold">
                    {paymentEnabled && payment.amount
                      ? `${formatMoney(payment.amount)} · ${payment.method === "cheque" ? "Chèque" : "Espèces"}`
                      : "Aucun"}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </SheetBody>

        <SheetFooter className="gap-2">
          {isFirst ? (
            <Button variant="outline" size="touch" onClick={onClose} className="flex-1" disabled={saving}>
              Annuler
            </Button>
          ) : (
            <Button variant="outline" size="touch" onClick={goBack} className="flex-1" disabled={saving}>
              <ChevronLeft />
              Retour
            </Button>
          )}
          <Button size="touch" onClick={goNext} disabled={saving} className="flex-[2]">
            {saving ? <LoaderCircle className="animate-spin" /> : isLast ? <Check /> : null}
            {isLast ? "Valider l’arrêt" : "Continuer"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
