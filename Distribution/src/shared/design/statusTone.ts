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
  if (status === "En retard") return "danger";
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

/** Solde d'une caisse livreur. */
export function cashBalanceTone(balance: number): StatusTone {
  if (balance < 0) return "danger";
  if (balance > 0) return "warning";
  return "neutral";
}

/** Type de mouvement de caisse livreur. */
export function cashMovementTone(type: string): StatusTone {
  if (type === "Encaissement" || type === "Avance") return "success";
  if (type === "Remise" || type === "Retour tournée") return "warning";
  if (type === "Ajustement") return "info";
  return "neutral";
}

interface VehicleStockToneInput {
  active?: boolean;
  missingWarehouse?: boolean;
  totalQuantity?: number;
  activeRoutes?: unknown[];
}

/** Occupation opérationnelle d'un camion (tournée, chargé, vide, entrepôt). */
export function vehicleStockTone(vehicle: VehicleStockToneInput): StatusTone {
  if (vehicle.active === false) return "neutral";
  if (vehicle.missingWarehouse) return "warning";
  if (vehicle.activeRoutes?.length) return "info";
  if ((vehicle.totalQuantity || 0) > 0) return "success";
  return "neutral";
}

/** Statut parc du véhicule. */
export function vehicleStatusTone(status?: string, active = true): StatusTone {
  if (!active) return "danger";
  if (status === "Disponible") return "success";
  if (status === "En maintenance") return "warning";
  if (status === "Hors service") return "danger";
  return "neutral";
}

/** Statut RH du livreur. */
export function driverStatusTone(status?: string, active = true): StatusTone {
  if (!active) return "danger";
  if (status === "Actif") return "success";
  if (status === "En congé") return "warning";
  if (status === "Indisponible") return "danger";
  return "neutral";
}

/** Alerte de document (permis, assurance, CT). */
export function documentAlertTone(alert?: string | null): StatusTone {
  if (alert === "expired" || alert === "missing") return "danger";
  if (alert === "expiring" || alert === "due" || alert === "upcoming") return "warning";
  if (alert === "valid") return "success";
  return "neutral";
}

/** Statut d'une fiche d'entretien véhicule. */
export function entretienStatusTone(status?: string): StatusTone {
  if (status === "Terminé") return "success";
  if (status === "En Cours") return "warning";
  if (status === "Programmé") return "info";
  return "neutral";
}

/** Action d'historique d'affectation flotte. */
export function assignmentActionTone(action?: string): StatusTone {
  if (action === "Affectation") return "success";
  if (action === "Réaffectation") return "info";
  if (action === "Désaffectation") return "warning";
  return "neutral";
}

/** Progression d'une ligne de prélèvement. */
export function pickLineTone(picked: number, requested: number): StatusTone {
  if (picked === requested) return "success";
  if (picked > requested) return "danger";
  return "warning";
}

/** État d'une liste de prélèvement (brouillon vs soumise). */
export function pickListStatusTone(docstatus?: number): StatusTone {
  if (docstatus === 1) return "success";
  if (docstatus === 0) return "warning";
  return "neutral";
}

const DESK_ORDER_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  Draft: { label: "Brouillon", tone: "neutral" },
  "On Hold": { label: "En attente", tone: "warning" },
  "To Pay": { label: "À payer", tone: "warning" },
  "To Deliver and Bill": { label: "À livrer et facturer", tone: "info" },
  "To Bill": { label: "À facturer", tone: "info" },
  "To Deliver": { label: "À livrer", tone: "info" },
  Completed: { label: "Terminée", tone: "success" },
  Cancelled: { label: "Annulée", tone: "danger" },
  Closed: { label: "Clôturée", tone: "warning" },
};

/** Statut Sales Order hérité du Desk. */
export function salesOrderDeskStatus(status?: string | null): { label: string; tone: StatusTone } {
  if (!status) return { label: "Statut inconnu", tone: "neutral" };
  return DESK_ORDER_STATUS[status] || { label: status, tone: "neutral" };
}

export type OrderPickListState = "none" | "draft" | "submitted";

export function orderPickListState(order: {
  pick_lists?: Array<{ name: string; docstatus: number }>;
  draft_pick_lists?: string[];
  draft_pick_list?: string;
  existing_pick_list?: string;
}): OrderPickListState {
  const lists = order.pick_lists || [];
  if (lists.some((pickList) => Number(pickList.docstatus) === 0)) return "draft";
  if (lists.some((pickList) => Number(pickList.docstatus) === 1)) return "submitted";
  if (order.draft_pick_lists?.length || order.draft_pick_list) return "draft";
  if (order.existing_pick_list) return "draft";
  return "none";
}

export function orderPickListStatus(
  state: OrderPickListState,
  order?: { pick_incomplete?: boolean },
): { label: string; tone: StatusTone } {
  if (state === "draft") {
    return order?.pick_incomplete
      ? { label: "Liste incomplète", tone: "warning" }
      : { label: "Liste brouillon", tone: "warning" };
  }
  if (state === "submitted") {
    return order?.pick_incomplete
      ? { label: "Liste partielle", tone: "warning" }
      : { label: "Liste soumise", tone: "success" };
  }
  return { label: "Aucune liste", tone: "neutral" };
}
