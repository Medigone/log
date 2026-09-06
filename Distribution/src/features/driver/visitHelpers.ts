import type { RouteStop, RouteStopItem } from "@/shared/types/distribution";
import { isStopCompleted } from "@/features/driver/stopHelpers";

const DELIVERED = new Set(["Livré", "Annulé"]);
const FAILED = new Set(["Non Livré"]);
const TERMINAL = new Set(["Livré", "Partiellement Livré", "Non Livré", "Annulé"]);
const OPEN = ["Nouveau", "Préparé", "Enlevé"] as const;

export function visitKey(customer?: string | null, fallback?: string | null) {
  return (customer || "").trim() || (fallback || "").trim();
}

export function visitStatus(statuses: string[]) {
  const normalized = statuses.map((status) => status?.trim() || "Nouveau");
  if (!normalized.length) return "Nouveau";
  if (normalized.every((status) => DELIVERED.has(status))) {
    return normalized.every((status) => status === "Annulé") ? "Annulé" : "Livré";
  }
  if (normalized.every((status) => FAILED.has(status))) return "Non Livré";
  if (normalized.every((status) => TERMINAL.has(status))) return "Partiellement Livré";
  for (const status of OPEN) {
    if (normalized.includes(status)) return status;
  }
  if (normalized.includes("Partiellement Livré")) return "Partiellement Livré";
  return normalized[0];
}

function uniquePayments(stops: RouteStop[]) {
  const payments: RouteStop["payments"] = [];
  const seen = new Set<string>();
  for (const stop of stops) {
    for (const payment of stop.payments || []) {
      const marker = payment.name || `${payment.method}-${payment.amount}`;
      if (seen.has(marker)) continue;
      seen.add(marker);
      payments.push(payment);
    }
  }
  return payments;
}

function flattenItems(stops: RouteStop[]): RouteStopItem[] {
  return stops.flatMap((stop) =>
    (stop.items || []).map((item) => ({ ...item, deliveryNote: item.deliveryNote || stop.deliveryNote })),
  );
}

export function groupStopsIntoVisits(stops: RouteStop[]): RouteStop[] {
  const grouped = new Map<string, RouteStop[]>();
  const order: string[] = [];
  for (const stop of stops) {
    const key = visitKey(stop.customer, stop.deliveryNote);
    if (!grouped.has(key)) {
      grouped.set(key, []);
      order.push(key);
    }
    grouped.get(key)?.push(stop);
  }
  return order.map((key, index) => {
    const members = grouped.get(key) || [];
    const first = members[0];
    const payments = uniquePayments(members);
    const paid = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
    const grandTotal = members.reduce((sum, stop) => sum + (stop.grandTotal || 0), 0);
    const deliveryNotes = members.map((stop) => stop.deliveryNote);
    return {
      ...first,
      visitKey: key,
      sequence: index + 1,
      deliveryNote: first.deliveryNote,
      deliveryNotes,
      totalQuantity: members.reduce((sum, stop) => sum + (stop.totalQuantity || 0), 0),
      amountCollected: paid,
      amountToCollect: grandTotal ? Math.max(grandTotal - paid, 0) : members.reduce((sum, stop) => sum + (stop.amountToCollect || 0), 0),
      netTotal: members.reduce((sum, stop) => sum + (stop.netTotal || 0), 0),
      grandTotal,
      taxes: members.flatMap((stop) => stop.taxes || []),
      payments,
      status: visitStatus(members.map((stop) => stop.status)),
      packageCount: members.reduce((sum, stop) => sum + (stop.packageCount || 0), 0) || members.length,
      items: flattenItems(members),
      stops: members,
    };
  });
}

export function routeVisits(route: { visits?: RouteStop[]; stops: RouteStop[] }) {
  if (route.visits?.length) return route.visits;
  return groupStopsIntoVisits(route.stops || []);
}

export function visitNoteCount(stop: Pick<RouteStop, "deliveryNotes" | "stops">) {
  return stop.deliveryNotes?.length || stop.stops?.length || 1;
}

export function uniqueVisitCount(stops: Array<Pick<RouteStop, "customer" | "deliveryNote">>) {
  return new Set(stops.map((stop) => visitKey(stop.customer, stop.deliveryNote))).size;
}

export function visitNotesLabel(stop: Pick<RouteStop, "deliveryNote" | "deliveryNotes">) {
  const notes = stop.deliveryNotes?.length ? stop.deliveryNotes : [stop.deliveryNote];
  return notes.length > 1 ? `${notes.length} BL` : notes[0];
}

export function remainingVisits<T extends Pick<RouteStop, "status">>(stops: T[]) {
  return stops.filter((stop) => !isStopCompleted(stop));
}

export function collapseStopsByCustomer(stops: RouteStop[]) {
  return groupStopsIntoVisits(stops).flatMap((visit) => visit.stops || [visit]);
}

export function itemGroups(stop: RouteStop) {
  const items = stop.items || [];
  const groups: Array<{ deliveryNote: string; items: RouteStopItem[] }> = [];
  const index = new Map<string, { deliveryNote: string; items: RouteStopItem[] }>();
  for (const item of items) {
    const note = item.deliveryNote || stop.deliveryNote;
    let group = index.get(note);
    if (!group) {
      group = { deliveryNote: note, items: [] };
      index.set(note, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}
