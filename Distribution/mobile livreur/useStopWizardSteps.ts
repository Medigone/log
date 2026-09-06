import { useCallback, useMemo, useState } from "react";
import type { DeliveryOutcome } from "@/shared/types/distribution";

export type WizardStep = "outcome" | "quantities" | "evidence" | "payment";

/**
 * Le wizard passe de 5 à 4 étapes :
 *  - le récapitulatif final disparaît (fondu dans « payment » via CollectedEvidenceList)
 *  - « quantities » est sauté pour un résultat « full » ou « failed »
 *  - la sélection du résultat avance automatiquement (plus de bouton Continuer)
 * Le GPS n'est plus une étape : le déclencher au montage du wizard.
 */
export function useStopWizardSteps(outcome?: DeliveryOutcome) {
  const [step, setStep] = useState<WizardStep>("outcome");

  const steps = useMemo<WizardStep[]>(
    () => (outcome === "partial" ? ["outcome", "quantities", "evidence", "payment"] : ["outcome", "evidence", "payment"]),
    [outcome],
  );

  const index = Math.max(steps.indexOf(step), 0);

  const goNext = useCallback(() => {
    setStep((current) => steps[Math.min(steps.indexOf(current) + 1, steps.length - 1)]);
  }, [steps]);

  const goBack = useCallback(() => {
    setStep((current) => steps[Math.max(steps.indexOf(current) - 1, 0)]);
  }, [steps]);

  /** Un tap sur le résultat sélectionne ET avance. */
  const selectOutcome = useCallback(
    (next: DeliveryOutcome, onSelect: (value: DeliveryOutcome) => void) => {
      onSelect(next);
      setStep(next === "partial" ? "quantities" : "evidence");
    },
    [],
  );

  return {
    step,
    setStep,
    steps,
    stepIndex: index,
    stepCount: steps.length,
    isFirst: index === 0,
    isLast: index === steps.length - 1,
    goNext,
    goBack,
    selectOutcome,
  };
}
