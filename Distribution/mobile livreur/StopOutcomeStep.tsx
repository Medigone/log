import { Check, X } from "lucide-react";
import type { DeliveryOutcome, RouteStop } from "@/shared/types/distribution";
import { formatDinars } from "@/features/driver/driverMobile";
import { cn } from "@/lib/utils";

function HalfDisc() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
    </svg>
  );
}

/**
 * Étape 1 — un tap suffit : la sélection avance l'étape (voir useStopWizardSteps).
 * « Livré en totalité » porte le montant, il n'y a plus de bouton Continuer.
 */
export function StopOutcomeStep({
  stop,
  gpsAccuracy,
  onRetryGps,
  onSelect,
}: {
  stop: RouteStop;
  gpsAccuracy?: number | null;
  onRetryGps: () => void;
  onSelect: (outcome: DeliveryOutcome) => void;
}) {
  const options: Array<{
    value: DeliveryOutcome;
    label: string;
    hint: string;
    icon: React.ReactNode;
    primary?: boolean;
  }> = [
    {
      value: "full",
      label: "Livré en totalité",
      hint: `${stop.totalQuantity} articles · ${formatDinars(stop.totalAmount || 0)}`,
      icon: <Check className="size-6" strokeWidth={2.25} />,
      primary: true,
    },
    {
      value: "partial",
      label: "Livraison partielle",
      hint: "Saisir les quantités livrées",
      icon: <HalfDisc />,
    },
    {
      value: "failed",
      label: "Échec de livraison",
      hint: "Motif obligatoire",
      icon: <X className="size-5" strokeWidth={2} />,
    },
  ];

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h3 className="text-base font-semibold">Résultat de l'arrêt</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Un tap suffit — l'étape suivante s'ouvre automatiquement.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className={cn(
              "flex items-center gap-3.5 rounded-touch px-4 text-left transition-colors",
              option.primary
                ? "h-21 bg-emerald-600 text-white hover:bg-emerald-700"
                : "h-18 border-[1.5px] border-border bg-background hover:border-brand-300 hover:bg-brand-50/40",
            )}
          >
            <span
              className={cn(
                "flex items-center justify-center rounded-full",
                option.primary
                  ? "size-11 bg-white/20"
                  : option.value === "failed"
                    ? "size-10 bg-rose-50 text-rose-600"
                    : "size-10 bg-muted text-muted-foreground",
              )}
            >
              {option.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block font-semibold tracking-tight", option.primary ? "text-lg" : "text-[17px]")}>
                {option.label}
              </span>
              <span className={cn("mt-0.5 block text-xs", option.primary ? "text-white/85" : "text-muted-foreground")}>
                {option.hint}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2.5 rounded-lg border bg-background px-3.5 py-2.5">
        <span
          className={cn(
            "size-2 rounded-full",
            gpsAccuracy != null ? "animate-pulse bg-emerald-500" : "bg-amber-500",
          )}
        />
        <p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground">
          {gpsAccuracy != null ? (
            <>
              GPS acquis en arrière-plan · <span className="num">{Math.round(gpsAccuracy)} m</span>
            </>
          ) : (
            "Position en cours d'acquisition"
          )}
        </p>
        <button type="button" onClick={onRetryGps} className="text-xs font-semibold text-muted-foreground">
          Reprendre
        </button>
      </div>
    </div>
  );
}
