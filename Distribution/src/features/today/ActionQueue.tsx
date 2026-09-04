import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/reui/badge";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatQuantity, formatShortDate } from "@/shared/format";
import type { StatusTone } from "@/shared/design/statusTone";
import type { ActivityDashboardData, ActivityDispatchNote } from "@/shared/types/distribution";

const ROW_LIMIT = 5;

export interface ActionRow {
  id: string;
  title: string;
  detail: string;
  target: string;
  badge?: string;
  badgeTone?: StatusTone;
}

export interface ActionGroup {
  id: string;
  title: string;
  count: number | string;
  target: string;
  rows: ActionRow[];
  extra: number;
  unit?: string;
}

function noteDate(note: ActivityDispatchNote) {
  return note.requestedDate || note.routeDate || "";
}

function sortUnassigned(notes: ActivityDispatchNote[], today: string) {
  return [...notes]
    .filter((note) => !note.routeId)
    .sort((a, b) => {
      const aDate = noteDate(a);
      const bDate = noteDate(b);
      const aOverdue = aDate && aDate < today ? 0 : 1;
      const bOverdue = bDate && bDate < today ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      return aDate.localeCompare(bDate);
    });
}

function buildActionGroups(
  data: ActivityDashboardData | undefined,
  { showCashier, today }: { showCashier: boolean; today: string },
): ActionGroup[] {
  const groups: ActionGroup[] = [];
  const toPick = data?.preparation?.toPick ?? 0;
  const pickLists = data?.preparation?.pickLists || [];
  if (toPick > 0 || pickLists.length) {
    const rows = pickLists.slice(0, ROW_LIMIT).map((pick) => ({
      id: pick.name,
      title: pick.name,
      detail: `${pick.salesOrderCount} commande(s) · ${formatQuantity(pick.remainingQty)} restant(s)`,
      target: `/preparation?pick_lists=${encodeURIComponent(pick.name)}`,
    }));
    groups.push({
      id: "prepare",
      title: "À préparer",
      count: toPick,
      unit: "commande(s)",
      target: "/preparation",
      rows,
      extra: Math.max(0, pickLists.length - rows.length),
    });
  }

  const unassignedNotes = sortUnassigned(data?.dispatch?.notes || [], today);
  const toPlan = data?.planning?.unassigned ?? data?.dispatch?.unassigned ?? unassignedNotes.length;
  if (toPlan > 0 || unassignedNotes.length) {
    const rows = unassignedNotes.slice(0, ROW_LIMIT).map((note) => {
      const overdue = noteDate(note) && noteDate(note) < today;
      return {
        id: note.deliveryNote,
        title: note.deliveryNote,
        detail: [note.customerName, noteDate(note) ? formatShortDate(noteDate(note)) : null, "Sans tournée"]
          .filter(Boolean)
          .join(" · "),
        target: overdue ? "/planning?status=En%20retard" : "/planning",
        badge: overdue ? "En retard" : note.lifecycle,
        badgeTone: (overdue ? "danger" : "warning") as StatusTone,
      };
    });
    groups.push({
      id: "plan",
      title: "À planifier",
      count: toPlan,
      unit: "bon(s)",
      target: "/planning",
      rows,
      extra: Math.max(0, (toPlan || unassignedNotes.length) - rows.length),
    });
  }

  const loads = data?.fulfillment?.toLoadRoutes || [];
  const returns = data?.fulfillment?.returnRoutes || [];
  const dockCount = (data?.fulfillment?.toLoad ?? 0) + (data?.fulfillment?.returnsPending ?? 0);
  if (dockCount > 0 || loads.length || returns.length) {
    const loadRows: ActionRow[] = loads.slice(0, ROW_LIMIT).map((route) => ({
      id: `load-${route.name}`,
      title: `À charger · ${route.vehicleLabel || route.name}`,
      detail: [route.driverName || "Livreur non assigné", route.date ? formatShortDate(route.date) : null]
        .filter(Boolean)
        .join(" · "),
      target: "/stock?focus=loaded",
      badge: route.loadingStatus || "À charger",
      badgeTone: "warning",
    }));
    const remaining = Math.max(0, ROW_LIMIT - loadRows.length);
    const returnRows: ActionRow[] = returns.slice(0, remaining).map((route) => ({
      id: `return-${route.name}`,
      title: `Retour · ${route.vehicleLabel || route.name}`,
      detail: route.loadingStatus || "Retour dépôt",
      target: "/stock?focus=route",
      badge: "Retour",
      badgeTone: "info",
    }));
    const rows = [...loadRows, ...returnRows];
    groups.push({
      id: "dock",
      title: "Quai",
      count: `${data?.fulfillment?.toLoad ?? 0} à charger · ${data?.fulfillment?.returnsPending ?? 0} retours`,
      unit: "(tournées)",
      target: "/stock",
      rows,
      extra: Math.max(0, loads.length + returns.length - rows.length),
    });
  }

  const toControl = data?.payments?.toControl ?? 0;
  const discrepancies = data?.payments?.discrepancies ?? 0;
  const cashierStatus = discrepancies ? "Écart" : "À contrôler";
  const cashierTarget = `/cashier?status=${encodeURIComponent(cashierStatus)}`;
  if (showCashier && (toControl > 0 || discrepancies > 0)) {
    groups.push({
      id: "cashier",
      title: "Caisse",
      count: toControl,
      unit: "tournée(s) à contrôler",
      target: cashierTarget,
      rows: [
        {
          id: "cashier-control",
          title: discrepancies ? "Écarts à arbitrer" : "Caisse à contrôler",
          detail: discrepancies
            ? `${discrepancies} écart(s) · ${toControl} tournée(s) à contrôler`
            : `${toControl} tournée(s) en attente de contrôle`,
          target: cashierTarget,
          badge: discrepancies ? "Écart" : "À contrôler",
          badgeTone: discrepancies ? "danger" : "warning",
        },
      ],
      extra: 0,
    });
  }

  return groups;
}

export function ActionQueue({
  data,
  showCashier,
  today,
  role = "responsable",
}: {
  data?: ActivityDashboardData;
  showCashier: boolean;
  today: string;
  role?: string;
}) {
  const navigate = useNavigate();
  const groups = buildActionGroups(data, { showCashier, today })
    .filter((group) => role !== "preparateur" || group.id === "prepare")
    .sort((a, b) => role === "planificateur" ? Number(b.id === "plan") - Number(a.id === "plan") : 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>À traiter</CardTitle>
        <p className="t-body text-muted-foreground">Files en attente, y compris les jours précédents.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!groups.length && (
          <Empty><EmptyHeader><EmptyTitle>Rien à traiter pour le moment.</EmptyTitle></EmptyHeader></Empty>
        )}
        {groups.map((group) => (
          <section key={group.id} aria-label={group.title} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-baseline gap-2 text-sm font-medium">
                {group.title}
                <Badge variant="secondary">{group.count} {group.unit}</Badge>
              </p>
              <Button variant="ghost" size="sm" onClick={() => navigate(group.target)}>
                Voir tout
              </Button>
            </div>
            {!group.rows.length && (
              <button
                type="button"
                onClick={() => navigate(group.target)}
                className="w-full rounded-md border border-hairline p-3 text-left hover:border-brand-300 hover:bg-brand-50/40"
              >
                <p className="t-body text-muted-foreground">Ouvrir la file · {group.count} élément(s)</p>
              </button>
            )}
            {group.rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => navigate(row.target)}
                className="w-full rounded-md border border-hairline p-3 text-left hover:border-brand-300 hover:bg-brand-50/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.title}</p>
                    <p className="truncate t-meta text-muted-foreground">{row.detail}</p>
                  </div>
                  {row.badge && (
                    <StatusBadge tone={row.badgeTone || "info"} size="sm">
                      {row.badge}
                    </StatusBadge>
                  )}
                </div>
              </button>
            ))}
            {group.extra > 0 && (
              <p className="t-meta text-muted-foreground">+ {group.extra} autre(s)</p>
            )}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
