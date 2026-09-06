import { useCallback, useMemo, useState } from "react";
import type { DeliveryOutcome } from "@/shared/types/distribution";

export type WizardStep = "outcome" | "detail" | "evidence" | "payment";

export function wizardSteps(outcome: DeliveryOutcome): WizardStep[] {
  const steps: WizardStep[] = ["outcome"];
  if (outcome === "partial" || outcome === "failed") steps.push("detail");
  steps.push("evidence");
  if (outcome !== "failed") steps.push("payment");
  return steps;
}

/**
 * Wizard 4 étapes : le récapitulatif disparaît, le GPS n’est plus une étape,
 * et un tap sur le résultat avance automatiquement.
 */
export function useStopWizardSteps(outcome: DeliveryOutcome) {
  const [stepIndex, setStepIndex] = useState(0);
  const steps = useMemo(() => wizardSteps(outcome), [outcome]);
  const clamped = Math.min(stepIndex, steps.length - 1);
  const step = steps[clamped];

  const goNext = useCallback(() => {
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }, [steps.length]);

  const goBack = useCallback(() => {
    setStepIndex((current) => Math.max(current - 1, 0));
  }, []);

  const selectOutcome = useCallback((onSelect: (value: DeliveryOutcome) => void, next: DeliveryOutcome) => {
    onSelect(next);
    setStepIndex(1);
  }, []);

  return {
    step,
    steps,
    stepIndex: clamped,
    stepCount: steps.length,
    isFirst: clamped === 0,
    isLast: clamped === steps.length - 1,
    goNext,
    goBack,
    selectOutcome,
  };
}
