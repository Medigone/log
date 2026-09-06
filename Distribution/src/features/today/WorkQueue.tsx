import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { formatQuantity, formatShortDate } from "@/shared/format";
import type { StatusTone } from "@/shared/design/statusTone";
import type { ActivityDashboardData } from "@/shared/types/distribution";

type Stage = "prep" | "plan" | "load" | "road";

export interface QueueItem {
  id: string;
  ref: string;
  client: string;
  city?: string;
  date?: string;
  note: string;
  status: string;
  tone: StatusTone;
  load?: string;
  stage: Stage;
  late: boolean;
  target: string;
}

const COLUMNS: { stage: Stage; step: number; title: string; empty: string }[] = [
  { stage: "prep", step: 1, title: "À préparer", empty: "Rien à prélever" },
  { stage: "plan", step: 2, title: "À planifier", empty: "Tous les bons sont affectés" },
  { stage: "load", step: 3, title: "À charger", empty: "Aucune tournée au quai" },
  { stage: "road", step: 4, title: "En tournée", empty: "Aucune tournée en cours" },
];

/** Dérive la file de travail depuis le dashboard d’activité (aucun endpoint supplémentaire). */
export function buildQueueItems(data: ActivityDashboardData | undefined, today: string): QueueItem[] {
  const items: QueueItem[] = [];

  const readyToComplete = data?.preparation?.readyToComplete ?? 0;
  if (readyToComplete > 0) {
    items.push({
      id: "prep-complete",
      ref: "Reliquats à prélever",
      client: `${readyToComplete} commande(s)`,
      note: "Stock revenu · à prélever",
      status: "À compléter",
      tone: "warning",
      stage: "prep",
      late: false,
      target: "/preparation?complete=1",
    });
  }

  for (const pick of data?.preparation?.pickLists ?? []) {
    items.push({
      id: pick.name,
      ref: pick.name,
      client: `${pick.salesOrderCount} commande(s)`,
      note: "À prélever",
      status: "À préparer",
      tone: "info",
      load: pick.remainingQty ? `${formatQuantity(pick.remainingQty)} art.` : undefined,
      stage: "prep",
      late: false,
      target: `/preparation?pick_lists=${encodeURIComponent(pick.name)}`,
    });
  }

  for (const note of data?.dispatch?.notes ?? []) {
    if (note.routeId) continue;
    const date = note.requestedDate || note.routeDate || "";
    const late = Boolean(date && date < today);
    items.push({
      id: note.deliveryNote,
      ref: note.deliveryNote,
      client: note.customerName || note.deliveryNote,
      city: note.customerCity || undefined,
      date: date ? formatShortDate(date) : undefined,
      note: "Prêt · sans tournée",
      status: late ? "En retard" : note.lifecycle,
      tone: late ? "danger" : "warning",
      load: note.qty ? `${formatQuantity(note.qty)} art.` : undefined,
      stage: "plan",
      late,
      target: late ? "/planning?status=En%20retard" : "/planning",
    });
  }

  for (const route of data?.fulfillment?.toLoadRoutes ?? []) {
    items.push({
      id: `load-${route.name}`,
      ref: route.vehicleLabel || route.name,
      client: route.driverName || "Livreur non assigné",
      date: route.date ? formatShortDate(route.date) : undefined,
      note: "Au quai",
      status: route.loadingStatus || "À charger",
      tone: "warning",
      stage: "load",
      late: false,
      target: "/stock?focus=loaded",
    });
  }

  for (const route of data?.fleet?.liveRoutes ?? []) {
    items.push({
      id: `road-${route.name}`,
      ref: route.vehicleLabel || route.name,
      client: route.driverName || "Livreur non assigné",
      note: "En cours",
      status: route.lifecycle,
      tone: "info",
      stage: "road",
      late: false,
      target: `/planning/routes/${route.name}`,
    });
  }

  return items;
}

export function WorkQueue({
  data,
  today,
  /** Ids pré-sélectionnés (ex. CTA « Planifier les N bons en retard ») */
  presetSelection,
  onCreateRoute,
}: {
  data?: ActivityDashboardData;
  today: string;
  presetSelection?: string[];
  onCreateRoute?: (ids: string[]) => void;
}) {
  const navigate = useNavigate();
  const all = useMemo(() => buildQueueItems(data, today), [data, today]);
  const showLoad = all.some((item) => item.load);

  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [query, setQuery] = useState("");
  const [lateOnly, setLateOnly] = useState(false);
  const [readyOnly, setReadyOnly] = useState(false);
  const [selection, setSelection] = useState<Record<string, true>>({});

  const presetKey = (presetSelection ?? []).join("|");
  useEffect(() => {
    if (!presetSelection?.length) return;
    setSelection(Object.fromEntries(presetSelection.map((id) => [id, true as const])));
    setView("table");
  }, [presetKey, presetSelection]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((item) => {
      if (
        q &&
        ![item.ref, item.client, item.city ?? ""].some((v) => v.toLowerCase().includes(q))
      )
        return false;
      if (lateOnly && !item.late) return false;
      if (readyOnly && item.status !== "Préparé") return false;
      return true;
    });
  }, [all, query, lateOnly, readyOnly]);

  const selectedIds = Object.keys(selection).filter((id) => all.some((item) => item.id === id));
  const planIds = selectedIds.filter((id) => all.find((item) => item.id === id)?.stage === "plan");
  const toggle = (id: string) =>
    setSelection((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });

  const chip = (active: boolean) =>
    cn(
      "flex h-[30px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium",
      active
        ? "border-foreground bg-foreground text-background"
        : "border-hairline bg-card text-muted-foreground hover:border-brand-300",
    );

  const tableCols = showLoad
    ? "grid-cols-[34px_minmax(0,1.25fr)_minmax(0,1fr)_92px_108px_88px_34px]"
    : "grid-cols-[34px_minmax(0,1.25fr)_minmax(0,1fr)_92px_108px_34px]";

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex min-h-[53px] items-center gap-2.5 border-b border-hairline px-3 py-[11px]">
        <h2 className="text-sm font-semibold leading-none">File de travail</h2>
        <span className="num rounded-[5px] bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
          {all.length} bons
        </span>
        <div className="flex-1" />
        <div className="flex gap-0.5 rounded-lg bg-muted p-0.5" role="group" aria-label="Mode d’affichage">
          {(["kanban", "table"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[12.5px] font-medium",
                view === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {mode === "kanban" ? "Pipeline" : "Tableau"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-muted px-3 py-2.5">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrer par référence ou client…"
          aria-label="Filtrer la file de travail"
          className="h-[30px] w-[230px] bg-background text-[13px] shadow-none"
        />
        <button type="button" className={chip(lateOnly)} onClick={() => setLateOnly((v) => !v)}>
          <span className="size-1.5 rounded-full bg-destructive" /> En retard
        </button>
        <button type="button" className={chip(readyOnly)} onClick={() => setReadyOnly((v) => !v)}>
          <span className="size-1.5 rounded-full bg-[#d97706]" /> Préparé
        </button>
        <div className="flex-1" />
        <span className="num text-[11px] text-muted-foreground">
          {rows.length} / {all.length} bons
        </span>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 bg-foreground px-3 py-2 text-background">
          <span className="text-sm font-medium">
            {selectedIds.length} bon{selectedIds.length > 1 ? "s" : ""} sélectionné
            {selectedIds.length > 1 ? "s" : ""}
          </span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="secondary"
            disabled={!planIds.length}
            onClick={() => onCreateRoute?.(planIds)}
          >
            Créer une tournée
          </Button>
          <Button size="sm" variant="ghost" className="text-background/60" onClick={() => setSelection({})}>
            Effacer
          </Button>
        </div>
      )}

      {all.length === 0 ? (
        <CardContent className="py-10">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Rien à traiter pour le moment.</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </CardContent>
      ) : rows.length === 0 ? (
        <CardContent className="py-10">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Aucun bon ne correspond</EmptyTitle>
            </EmptyHeader>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery("");
                setLateOnly(false);
                setReadyOnly(false);
              }}
            >
              Réinitialiser les filtres
            </Button>
          </Empty>
        </CardContent>
      ) : view === "kanban" ? (
        <div className="grid gap-px bg-hairline sm:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map((column) => {
            const cards = rows.filter((row) => row.stage === column.stage);
            return (
              <div key={column.stage} className="flex min-h-[300px] flex-col bg-card">
                <div className="flex items-center gap-1.5 border-b border-hairline bg-muted/40 px-2.5 py-2.5">
                  <span className="num whitespace-nowrap text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">
                    {column.step} · {column.title}
                  </span>
                  <Badge variant="secondary">{cards.length}</Badge>
                </div>
                <div className="flex flex-col gap-2 p-2">
                  {cards.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => toggle(card.id)}
                      className={cn(
                        "flex flex-col gap-1.5 rounded-lg border border-hairline p-2.5 text-left hover:border-brand-300",
                        selection[card.id] && "bg-muted/50",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="num truncate text-[11.5px] font-medium">{card.ref}</span>
                        <div className="flex-1" />
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            card.late ? "bg-destructive" : "bg-muted-foreground/40",
                          )}
                        />
                      </div>
                      <span className="truncate text-xs text-muted-foreground">{card.client}</span>
                      <div className="flex flex-wrap items-center justify-between gap-x-1.5 gap-y-0.5">
                        <span
                          className={cn(
                            "whitespace-nowrap text-[11px]",
                            card.late ? "text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {card.date ?? "—"}
                        </span>
                        {card.load && (
                          <span className="num whitespace-nowrap text-[10.5px] text-muted-foreground">
                            {card.load}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                  {cards.length === 0 && (
                    <p className="rounded-lg border border-dashed border-hairline px-2.5 py-3.5 text-center text-[11.5px] text-muted-foreground">
                      {column.empty}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          <div className={cn("grid border-b border-hairline bg-muted/40 px-3 num text-[10px] uppercase tracking-[0.06em] text-muted-foreground", tableCols)}>
            <span className="py-1.5" />
            <span className="py-1.5">Référence</span>
            <span className="py-1.5">Client · Ville</span>
            <span className="py-1.5">Livraison</span>
            <span className="py-1.5">Statut</span>
            {showLoad && <span className="py-1.5 text-right">Qté</span>}
            <span className="py-1.5" />
          </div>
          {rows.map((row) => (
            <div
              key={row.id}
              role="button"
              tabIndex={0}
              onClick={() => toggle(row.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggle(row.id);
                }
              }}
              className={cn(
                "grid cursor-pointer items-center border-b border-hairline px-3 hover:bg-muted/40",
                tableCols,
                selection[row.id] && "bg-muted/50",
              )}
            >
              <span className="py-2.5">
                <span
                  className={cn(
                    "flex size-[15px] items-center justify-center rounded border text-[10px] font-bold",
                    selection[row.id]
                      ? "border-foreground bg-foreground text-background"
                      : "border-input",
                  )}
                >
                  {selection[row.id] ? "✓" : ""}
                </span>
              </span>
              <span className="flex min-w-0 flex-col py-2.5 pr-2">
                <span className="num truncate text-[12.5px] font-medium">{row.ref}</span>
                <span className="truncate text-[11px] text-muted-foreground">{row.note}</span>
              </span>
              <span className="flex min-w-0 flex-col py-2.5 pr-2">
                <span className="truncate text-[13px]">{row.client}</span>
                <span className="truncate text-[11px] text-muted-foreground">{row.city ?? "—"}</span>
              </span>
              <span
                className={cn(
                  "py-2.5 text-[12.5px]",
                  row.late ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {row.date ?? "—"}
              </span>
              <span className="py-2.5">
                <StatusBadge tone={row.tone} size="sm">
                  {row.status}
                </StatusBadge>
              </span>
              {showLoad && (
                <span className="num py-2.5 text-right text-xs text-muted-foreground">
                  {row.load ?? "—"}
                </span>
              )}
              <span className="py-2.5 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Actions ${row.ref}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    navigate(row.target);
                  }}
                >
                  ⋯
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
