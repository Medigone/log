import { useNavigate } from "react-router-dom";
import type { ActivityPipeline } from "@/shared/types/distribution";


const STEPS: Array<{ key: keyof ActivityPipeline; label: string; target: string; cashier?: boolean }> = [
  { key: "toPrepare", label: "À préparer", target: "/preparation" },
  { key: "toPlan", label: "BL à planifier", target: "/planning" },
  { key: "toDispatch", label: "Prêts à expédier", target: "/planning" },
  { key: "live", label: "Tournées live", target: "/deliveries" },
  { key: "returning", label: "Retours", target: "/stock" },
  { key: "cashier", label: "Caisse", target: "/cashier", cashier: true },
];

export function PipelineStrip({
  pipeline,
  showCashier,
}: {
  pipeline: ActivityPipeline;
  showCashier: boolean;
}) {
  const navigate = useNavigate();
  const steps = STEPS.filter((step) => showCashier || !step.cashier);
  return (
    <section aria-label="Pipeline logistique" className={`grid gap-2 sm:grid-cols-2 ${showCashier ? "lg:grid-cols-3 xl:grid-cols-6" : "lg:grid-cols-5"}`}>
      {steps.map((step, index) => (
        <button
          key={step.key}
          type="button"
          onClick={() => navigate(step.target)}
          className="rounded-lg border border-hairline bg-card p-3.5 text-left shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50/50"
        >
          <p className="t-micro text-muted-foreground">
            {index + 1}. {step.label}
          </p>
          <p className="num mt-1 text-2xl font-semibold tracking-tight text-foreground">{pipeline[step.key]}</p>
        </button>
      ))}
    </section>
  );
}
