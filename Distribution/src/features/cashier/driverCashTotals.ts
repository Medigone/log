import { formatMoney } from "@/shared/format";
import type { StatusTone } from "@/shared/design/statusTone";
import type { DriverCashBox, DriverCashMovement, DriverCashMovementType } from "@/shared/types/distribution";

export const CASH_STATES = ["À remettre", "À zéro", "Négatif", "Inactif"] as const;
export type CashState = (typeof CASH_STATES)[number];

export const CASH_SORTS = ["balance", "name", "updated"] as const;
export type CashSort = (typeof CASH_SORTS)[number];

export const ADJUSTMENT_TYPES = ["Remise", "Avance", "Ajustement"] as const;
export type CashAdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

export const MOVEMENT_FILTERS: DriverCashMovementType[] = ["Encaissement", "Remise", "Avance", "Ajustement"];

export const FLOW_WINDOW_DAYS = 30;

export interface DriverCashListKpis {
  circulation: number;
  openCount: number;
  toHandoverAmount: number;
  toHandoverCount: number;
  negativeAmount: number;
  negativeCount: number;
  inactiveCount: number;
}

export interface DriverCashFlowTotals {
  collected: number;
  collectedCount: number;
  handedOver: number;
  handedOverCount: number;
  adjustments: number;
  windowDays: number;
}

export function isActiveBox(box: DriverCashBox) {
  return box.active !== false;
}

export function cashState(box: DriverCashBox): CashState {
  if (!isActiveBox(box)) return "Inactif";
  if (box.balance < 0) return "Négatif";
  if (box.balance > 0) return "À remettre";
  return "À zéro";
}

export function cashStateTone(state: CashState): StatusTone {
  if (state === "Négatif") return "danger";
  if (state === "À remettre") return "warning";
  return "neutral";
}

export function driverInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

export function signedBalance(value: number) {
  if (Math.abs(value) < 0.000001) return formatMoney(0, { precise: true });
  const formatted = formatMoney(Math.abs(value), { precise: true });
  return `${value > 0 ? "+" : "−"}${formatted}`;
}

export function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

export function dayMonth(iso?: string | null) {
  if (!iso) return "—";
  const [, month, day] = iso.slice(0, 10).split("-");
  return day && month ? `${day}/${month}` : iso;
}

export function signedAdjustment(type: CashAdjustmentType, amount: number) {
  if (type === "Remise") return -Math.abs(amount);
  if (type === "Avance") return Math.abs(amount);
  return amount;
}

export function driverCashListKpis(boxes: DriverCashBox[]): DriverCashListKpis {
  const active = boxes.filter(isActiveBox);
  const positive = boxes.filter((box) => box.balance > 0);
  const negative = boxes.filter((box) => box.balance < 0);
  return {
    circulation: active.reduce((sum, box) => sum + box.balance, 0),
    openCount: active.length,
    toHandoverAmount: positive.reduce((sum, box) => sum + box.balance, 0),
    toHandoverCount: positive.length,
    negativeAmount: negative.reduce((sum, box) => sum + box.balance, 0),
    negativeCount: negative.length,
    inactiveCount: boxes.filter((box) => !isActiveBox(box)).length,
  };
}

export function displayedBalanceTotal(boxes: DriverCashBox[]) {
  return boxes.reduce((sum, box) => sum + box.balance, 0);
}

export function matchesSearch(box: DriverCashBox, query: string) {
  if (!query) return true;
  return [box.driverName, box.driver, box.name]
    .filter(Boolean)
    .some((value) => value.toLocaleLowerCase("fr").includes(query));
}

export function filterCashBoxes(boxes: DriverCashBox[], states: Set<CashState>, query: string) {
  const needle = query.trim().toLocaleLowerCase("fr");
  return boxes.filter((box) => {
    if (states.size) {
      if (!states.has(cashState(box))) return false;
    } else if (!isActiveBox(box)) {
      return false;
    }
    return matchesSearch(box, needle);
  });
}

export function sortCashBoxes(boxes: DriverCashBox[], sort: CashSort) {
  return [...boxes].sort((left, right) => {
    if (sort === "name") return left.driverName.localeCompare(right.driverName, "fr");
    if (sort === "updated") {
      const leftStamp = left.lastMovement?.date || left.updatedAt || "";
      const rightStamp = right.lastMovement?.date || right.updatedAt || "";
      return rightStamp.localeCompare(leftStamp) || left.driverName.localeCompare(right.driverName, "fr");
    }
    if (right.balance !== left.balance) return right.balance - left.balance;
    return left.driverName.localeCompare(right.driverName, "fr");
  });
}

export function firstPositiveBox(boxes: DriverCashBox[]) {
  return boxes.find((box) => box.balance > 0);
}

export function cashStateCounts(boxes: DriverCashBox[]) {
  const counts: Record<CashState, number> = {
    "À remettre": 0,
    "À zéro": 0,
    Négatif: 0,
    Inactif: 0,
  };
  for (const box of boxes) counts[cashState(box)] += 1;
  return counts;
}

function inFlowWindow(date: string | undefined, now: Date) {
  if (!date) return true;
  const stamp = new Date(date);
  if (Number.isNaN(stamp.getTime())) return true;
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - FLOW_WINDOW_DAYS);
  return stamp >= cutoff;
}

export function cashFlowTotals(movements: DriverCashMovement[], now = new Date()): DriverCashFlowTotals {
  const recent = movements.filter((movement) => inFlowWindow(movement.date, now));
  const collections = recent.filter((movement) => movement.type === "Encaissement");
  const handovers = recent.filter((movement) => movement.type === "Remise");
  const adjustments = recent.filter((movement) => movement.type === "Avance" || movement.type === "Ajustement");
  return {
    collected: collections.reduce((sum, movement) => sum + movement.amount, 0),
    collectedCount: collections.length,
    handedOver: handovers.reduce((sum, movement) => sum + Math.abs(movement.amount), 0),
    handedOverCount: handovers.length,
    adjustments: adjustments.reduce((sum, movement) => sum + movement.amount, 0),
    windowDays: FLOW_WINDOW_DAYS,
  };
}

export function parseCashStates(value: string | null) {
  return new Set((value || "").split("|").filter((item): item is CashState => (CASH_STATES as readonly string[]).includes(item)));
}

export function parseCashSort(value: string | null): CashSort {
  return CASH_SORTS.includes(value as CashSort) ? (value as CashSort) : "balance";
}

export function movementMatches(
  movement: DriverCashMovement,
  types: Set<DriverCashMovementType>,
  query: string,
) {
  if (types.size && !types.has(movement.type)) return false;
  const needle = query.trim().toLocaleLowerCase("fr");
  if (!needle) return true;
  return [movement.type, movement.reason, movement.routeId, movement.name]
    .filter(Boolean)
    .some((value) => String(value).toLocaleLowerCase("fr").includes(needle));
}
