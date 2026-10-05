import { useState } from "react";
import { presetRange, type PeriodPreset } from "@/features/analytics/analyticsShared";

/** Période analysée : raccourcis (30 j, 90 j…) ou plage libre, comme « Aide à la décision ». */
export function usePeriod(initial: Exclude<PeriodPreset, "custom"> = "30") {
  const [preset, setPreset] = useState<PeriodPreset>(initial);
  const [range, setRange] = useState(() => presetRange(initial));
  const [draft, setDraft] = useState(range);

  const pickPreset = (value: Exclude<PeriodPreset, "custom">) => {
    const next = presetRange(value);
    setPreset(value);
    setRange(next);
    setDraft(next);
  };
  const pickRange = (next: { from: string; to: string }) => {
    setDraft(next);
    if (next.from && next.to) {
      setPreset("custom");
      setRange(next);
    }
  };
  return { preset, range, draft, pickPreset, pickRange };
}
