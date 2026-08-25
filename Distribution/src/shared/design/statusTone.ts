/**
 * Source unique des couleurs de statut de l'application.
 *
 * Chaque vocabulaire métier (statut de planification, cycle de vie d'une
 * tournée, état de caisse, état d'un arrêt) est réduit à l'une des cinq
 * tonalités ci-dessous, puis rendu avec les mêmes classes partout.
 */

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export interface ToneStyle {
  tone: StatusTone;
  /** Pastille de statut : fond teinté + texte lisible. */
  badge: string;
  /** Surface de carte : bordure teintée + fond très léger. */
  surface: string;
  /** Aplat plein : pastille de séquence, pastille d'icône. */
  solid: string;
  /** Rail vertical à gauche d'une ligne de tableau. */
  rail: string;
  /** Même rail, en ombre interne — applicable à une cellule de tableau. */
  railInset: string;
  /** Point de 8px. */
  dot: string;
  /** Texte seul, sur fond blanc. */
  text: string;
}

export const TONES: Record<StatusTone, ToneStyle> = {
  success: {
    tone: "success",
    badge: "bg-emerald-100 text-emerald-800",
    surface: "border-emerald-300 bg-emerald-50/60",
    solid: "bg-emerald-600 text-white",
    rail: "bg-emerald-500",
    railInset: "shadow-[inset_3px_0_0_var(--color-emerald-500)]",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
  },
  warning: {
    tone: "warning",
    badge: "bg-amber-100 text-amber-900",
    surface: "border-amber-300 bg-amber-50/60",
    solid: "bg-amber-500 text-white",
    rail: "bg-amber-500",
    railInset: "shadow-[inset_3px_0_0_var(--color-amber-500)]",
    dot: "bg-amber-500",
    text: "text-amber-700",
  },
  danger: {
    tone: "danger",
    badge: "bg-red-100 text-red-800",
    surface: "border-red-300 bg-red-50/50",
    solid: "bg-red-600 text-white",
    rail: "bg-red-500",
    railInset: "shadow-[inset_3px_0_0_var(--color-red-500)]",
    dot: "bg-red-500",
    text: "text-red-700",
  },
  info: {
    tone: "info",
    badge: "bg-brand-100 text-brand-800",
    surface: "border-brand-300 bg-brand-50",
    solid: "bg-brand-600 text-white",
    rail: "bg-brand-600",
    railInset: "shadow-[inset_3px_0_0_var(--color-brand-600)]",
    dot: "bg-brand-600",
    text: "text-brand-700",
  },
  neutral: {
    tone: "neutral",
    badge: "bg-slate-100 text-slate-700",
    surface: "border-hairline bg-white",
    solid: "bg-slate-100 text-slate-700",
    rail: "bg-slate-300",
    railInset: "shadow-[inset_3px_0_0_var(--color-slate-300)]",
    dot: "bg-slate-400",
    text: "text-slate-600",
  },
};

export function toneStyle(tone: StatusTone): ToneStyle {
  return TONES[tone];
}

/** Statut d'un BL sur l'écran de planification. */
export function planningStatusTone(status: string): StatusTone {
  if (["À revalider", "À repréparer", "Exception"].includes(status)) return "warning";
  if (["Publié", "En cours"].includes(status)) return "info";
  if (status === "Terminé") return "success";
  return "neutral";
}

/** Cycle de vie d'une tournée. */
export function routeLifecycleTone(lifecycle: string): StatusTone {
  if (lifecycle === "Publiée" || lifecycle === "En cours") return "info";
  if (lifecycle === "Retour dépôt" || lifecycle === "Contrôle caisse") return "warning";
  if (lifecycle === "Terminée") return "success";
  if (lifecycle === "Annulée") return "danger";
  return "neutral";
}

/** État d'un contrôle de caisse. */
export function cashStatusTone(status: string): StatusTone {
  if (status === "Validée") return "success";
  if (status === "Écart") return "danger";
  if (status === "À contrôler") return "warning";
  return "neutral";
}
