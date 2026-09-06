import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { isLiveRoute, lateDeparture, plural, routeStopCounts, stopProgress } from "@/features/today/fleetProgress";
import type { DistributionRoute, RouteLifecycle } from "@/shared/types/distribution";

const LIFECYCLE_DOT: Record<string, string> = {
  Publiée: "bg-blue-500",
  "En cours": "bg-emerald-600",
  "Retour dépôt": "bg-amber-500",
  Terminée: "bg-muted-foreground/40",
};

const LIFECYCLE_ORDER: RouteLifecycle[] = ["Publiée", "En cours", "Retour dépôt", "Terminée"];

function Tile({
  label,
  badge,
  value,
  unit,
  valueTone,
  children,
  pressed,
  onClick,
}: {
  label: string;
  badge?: { text: string; tone: "danger" | "success" | "neutral" };
  value: string;
  unit: string;
  valueTone?: "danger";
  children: ReactNode;
  pressed?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border border-hairline bg-card p-3.5 text-left",
        "hover:border-brand-300 hover:bg-brand-50/40",
        pressed && "border-foreground",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="num whitespace-nowrap text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </span>
        {badge && (
          <span
            className={cn(
              "whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium",
              badge.tone === "danger" && "bg-destructive/10 text-destructive",
              badge.tone === "success" && "bg-emerald-50 text-emerald-700",
              badge.tone === "neutral" && "bg-muted text-muted-foreground",
            )}
          >
            {badge.text}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "num whitespace-nowrap text-[30px] font-semibold leading-none tracking-tight",
            valueTone === "danger" && "text-destructive",
          )}
        >
          {value}
        </span>
        <span className="t-meta text-muted-foreground">{unit}</span>
      </div>
      {children}
    </button>
  );
}

function Bar({ pct, tone }: { pct: number; tone: "foreground" | "success" | "danger" }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full",
          tone === "success" && "bg-emerald-600",
          tone === "danger" && "bg-destructive",
          tone === "foreground" && "bg-foreground",
        )}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

export type KpiFocus = "all" | "live" | "delivered" | "failed" | "late";

export function DeliveriesKpis({
  routes,
  isLoading,
  focus,
  onFocus,
}: {
  routes: DistributionRoute[];
  isLoading?: boolean;
  focus: KpiFocus;
  onFocus: (focus: KpiFocus) => void;
}) {
  const counts = routeStopCounts(routes);
  const liveRoutes = routes.filter(isLiveRoute);
  const lateRoutes = routes.filter((route) => lateDeparture(route));
  const liveRemaining = liveRoutes.reduce((sum, route) => sum + stopProgress(route).remaining, 0);
  const donePct = counts.total ? Math.round((counts.delivered / counts.total) * 100) : 0;
  const dash = isLoading ? "—" : null;

  const byLifecycle = LIFECYCLE_ORDER.map((lifecycle) => ({
    lifecycle,
    count: routes.filter((route) => route.lifecycle === lifecycle).length,
  })).filter((entry) => entry.count > 0);

  const routeUnit = (() => {
    if (!routes.length) return "aucune tournée publiée";
    const parts: string[] = [];
    if (liveRoutes.length) parts.push(`${liveRoutes.length} en cours`);
    if (lateRoutes.length) {
      parts.push(`${lateRoutes.length} ${lateRoutes.length > 1 ? "non parties" : "non partie"}`);
    }
    return parts.join(" · ") || "aucune en cours";
  })();

  return (
    <section aria-label="Indicateurs du jour" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        label="Tournées du jour"
        value={dash ?? String(routes.length)}
        unit={routeUnit}
        pressed={focus === "all"}
        onClick={() => onFocus("all")}
      >
        <div className="flex h-1 gap-0.5">
          {byLifecycle.map((entry) => (
            <div
              key={entry.lifecycle}
              className={cn("rounded-full", LIFECYCLE_DOT[entry.lifecycle])}
              style={{ flex: entry.count }}
            />
          ))}
        </div>
      </Tile>

      <Tile
        label="Sur le terrain"
        badge={{ text: "live", tone: "success" }}
        value={dash ?? String(liveRoutes.length)}
        unit={`${liveRoutes.length > 1 ? "véhicules" : "véhicule"} · ${plural(liveRemaining, "arrêt")} restant${liveRemaining > 1 ? "s" : ""}`}
        pressed={focus === "live"}
        onClick={() => onFocus("live")}
      >
        <Bar pct={routes.length ? (liveRoutes.length / routes.length) * 100 : 0} tone="success" />
      </Tile>

      <Tile
        label="Arrêts livrés"
        badge={{ text: `${donePct}\u00a0%`, tone: "neutral" }}
        value={dash ?? String(counts.delivered)}
        unit={`sur ${counts.total} arrêts planifiés`}
        pressed={focus === "delivered"}
        onClick={() => onFocus("delivered")}
      >
        <Bar pct={donePct} tone="foreground" />
      </Tile>

      <Tile
        label="Échecs"
        badge={{ text: counts.failed ? "à traiter" : "RAS", tone: counts.failed ? "danger" : "neutral" }}
        value={dash ?? String(counts.failed)}
        valueTone={counts.failed ? "danger" : undefined}
        unit={counts.failed ? `${plural(counts.failed, "arrêt")} · ${counts.failed} BL à replanifier` : "arrêt en échec"}
        pressed={focus === "failed"}
        onClick={() => onFocus("failed")}
      >
        <Bar pct={counts.total ? (counts.failed / counts.total) * 100 : 0} tone="danger" />
      </Tile>
    </section>
  );
}
