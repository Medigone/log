import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CollectedItem {
  label: string;
  done: boolean;
  detail?: string;
  onReview?: () => void;
}

/**
 * Remplace l'ancienne étape « Récapitulatif » : rendu en bas de l'étape
 * Encaissement, il montre ce qui est déjà capturé sans écran supplémentaire.
 */
export function CollectedEvidenceList({
  gpsAccuracy,
  hasPhoto,
  signatureName,
  onReviewPhoto,
  onReviewSignature,
}: {
  gpsAccuracy?: number | null;
  hasPhoto: boolean;
  signatureName?: string | null;
  onReviewPhoto?: () => void;
  onReviewSignature?: () => void;
}) {
  const items: CollectedItem[] = [
    {
      label: "Position GPS",
      done: gpsAccuracy != null,
      detail: gpsAccuracy != null ? `${Math.round(gpsAccuracy)} m` : "Manquante",
    },
    { label: "Photo de livraison", done: hasPhoto, onReview: onReviewPhoto },
    {
      label: signatureName ? `Signature · ${signatureName}` : "Signature",
      done: Boolean(signatureName),
      onReview: onReviewSignature,
    },
  ];
  const allDone = items.every((item) => item.done);

  return (
    <Card density="touch" className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h4 className="text-sm font-semibold">Déjà collecté</h4>
        <span className={cn("text-xs", allDone ? "text-muted-foreground" : "font-semibold text-amber-700")}>
          {allDone ? "Tout est prêt" : "Éléments manquants"}
        </span>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2.5 border-b px-4 py-2.5 last:border-b-0">
            <span
              className={cn(
                "flex size-5.5 items-center justify-center rounded-full",
                item.done ? "bg-emerald-500 text-white" : "border border-dashed border-subtle text-subtle",
              )}
            >
              {item.done ? <Check className="size-3" strokeWidth={2.5} /> : null}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
            {item.onReview && item.done ? (
              <button type="button" onClick={item.onReview} className="text-xs text-muted-foreground">
                Revoir
              </button>
            ) : (
              <span className={cn("num text-xs", item.done ? "font-medium text-emerald-600" : "text-subtle")}>
                {item.detail}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
