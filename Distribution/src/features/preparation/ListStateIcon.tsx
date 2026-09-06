import { AlertTriangle, Check, Circle, CircleDashed, Contrast } from "lucide-react";
import { cn } from "@/lib/utils";

export type ListState = "submitted" | "partial" | "incomplete" | "draft" | "none";

const CONFIG: Record<
  ListState,
  { label: string; ring: string; fill: string; text: string; Icon: typeof Check }
> = {
  submitted: {
    label: "Liste soumise",
    ring: "border-emerald-600",
    fill: "bg-emerald-100",
    text: "text-emerald-700",
    Icon: Check,
  },
  partial: {
    label: "Liste partielle",
    ring: "border-amber-600",
    fill: "bg-amber-100",
    text: "text-amber-700",
    Icon: Contrast,
  },
  incomplete: {
    label: "Liste incomplète",
    ring: "border-amber-600",
    fill: "bg-amber-100",
    text: "text-amber-700",
    Icon: Contrast,
  },
  draft: {
    label: "Liste brouillon",
    ring: "border-input",
    fill: "bg-card",
    text: "text-muted-foreground",
    Icon: CircleDashed,
  },
  none: {
    label: "Aucune liste",
    ring: "border-input",
    fill: "bg-muted/40",
    text: "text-muted-foreground/70",
    Icon: Circle,
  },
};

/**
 * Remplace le badge texte de la colonne « État liste ».
 * Toujours accompagné d’un title + aria-label : l’icône seule n’est pas suffisante.
 */
export function ListStateIcon({
  state,
  orderChanged,
  className,
}: {
  state: ListState;
  orderChanged?: boolean;
  className?: string;
}) {
  const { label, ring, fill, text, Icon } = CONFIG[state];
  const title = orderChanged ? `${label} · commande modifiée` : label;
  return (
    <span className={cn("flex items-center justify-center gap-1", className)} title={title}>
      <span
        aria-label={label}
        role="img"
        className={cn("flex size-5 items-center justify-center rounded-full border", ring, fill, text)}
      >
        <Icon className="size-3" strokeWidth={3} />
      </span>
      {orderChanged && (
        <AlertTriangle className="size-3.5 shrink-0 text-amber-600" aria-label="Commande modifiée" />
      )}
      <span className="sr-only">{title}</span>
    </span>
  );
}

export function listStateFromDocstatus(docstatus?: number): ListState {
  return docstatus === 1 ? "submitted" : "draft";
}

export function listStateFromOrder({
  hasList,
  submitted,
  remaining,
}: {
  hasList: boolean;
  submitted: boolean;
  remaining: number;
}): ListState {
  if (!hasList) return "none";
  if (remaining > 0) return "partial";
  return submitted ? "submitted" : "draft";
}
