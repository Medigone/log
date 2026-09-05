import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Carte des livraisons
 * Placeholder fidèle à la maquette. En production : Leaflet / MapLibre,
 * les pastilles restent un agrégat par ville de dispatch.notes.
 * ------------------------------------------------------------------ */

export interface CityCluster {
  city: string;
  count: number;
  late?: boolean;
  /** position relative dans la carte, 0 → 1 (remplacé par lat/lng en production) */
  x: number;
  y: number;
}

export function DeliveryMapCard({
  clusters,
  totalKm,
  onOpen,
}: {
  clusters: CityCluster[];
  totalKm?: number;
  onOpen?: () => void;
}) {
  const points = clusters.reduce((sum, c) => sum + c.count, 0);
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center gap-2 border-b border-hairline">
        <CardTitle>Carte des livraisons</CardTitle>
        <div className="flex-1" />
        <span className="t-meta text-muted-foreground">
          {points} points{totalKm ? ` · ${totalKm} km` : ""}
        </span>
      </CardHeader>
      <div
        className="relative h-[210px] bg-muted"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      >
        {clusters.map((cluster, index) => {
          const last = index === clusters.length - 1;
          return (
            <div
              key={cluster.city}
              // la pastille la plus à droite est ancrée par `right` : sinon elle est
              // coupée par l’overflow-hidden de la Card
              className="absolute flex items-center gap-1.5 whitespace-nowrap"
              style={
                last
                  ? { right: "8%", top: `${cluster.y * 100}%` }
                  : { left: `${cluster.x * 100}%`, top: `${cluster.y * 100}%` }
              }
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[10.5px] font-semibold text-background shadow",
                  cluster.late ? "bg-destructive" : "bg-foreground",
                )}
              >
                {cluster.count}
              </span>
              <span className="rounded border border-hairline bg-card px-1.5 py-px text-[11px] font-medium">
                {cluster.city}
              </span>
            </div>
          );
        })}
        <div className="absolute bottom-2.5 left-2.5 flex items-center gap-2.5 rounded-lg border border-hairline bg-card/95 px-2 py-1">
          <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-destructive" /> En retard
          </span>
          <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-foreground" /> À planifier
          </span>
        </div>
        {onOpen && (
          <Button variant="outline" size="sm" className="absolute right-2.5 top-2.5" onClick={onOpen}>
            Ouvrir la carte
          </Button>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Tendance 14 jours
 * ------------------------------------------------------------------ */

export function TrendCard({
  values,
  labels,
  delta,
}: {
  /** 14 valeurs, la dernière = aujourd’hui */
  values: number[];
  labels?: [string, string, string];
  delta?: string;
}) {
  const max = Math.max(1, ...values);
  const average = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start gap-2 border-b border-hairline">
        <div className="flex flex-col">
          <CardTitle>Bons expédiés · 14 jours</CardTitle>
          <p className="t-meta text-muted-foreground">
            Moyenne {average.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} / jour
          </p>
        </div>
        <div className="flex-1" />
        {delta && <StatusBadge tone="success" size="sm">{delta}</StatusBadge>}
      </CardHeader>
      <CardContent className="flex h-[92px] items-end gap-1 pt-3.5">
        {values.map((value, index) => (
          <div key={index} className="flex h-full flex-1 flex-col justify-end" title={`${value} bons`}>
            <div
              className={cn(
                "rounded-t-sm",
                index === values.length - 1
                  ? "bg-foreground"
                  : value === 0
                    ? "bg-muted"
                    : "bg-border",
              )}
              style={{ height: `${Math.max(3, Math.round((value / max) * 64))}px` }}
            />
          </div>
        ))}
      </CardContent>
      {labels && (
        <div className="num flex justify-between px-3.5 pb-3 text-[10px] text-muted-foreground">
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Ressources véhicules
 * ------------------------------------------------------------------ */

export interface VehicleResource {
  id: string;
  plate: string;
  tonnage: string;
  driverName?: string;
  detail: string;
  available: boolean;
}

export function ResourcesCard({ vehicles }: { vehicles: VehicleResource[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between border-b border-hairline">
        <CardTitle>Ressources</CardTitle>
        <span className="t-meta text-muted-foreground">{vehicles.length} véhicules</span>
      </CardHeader>
      <div className="flex flex-col">
        {vehicles.map((vehicle) => (
          <div
            key={vehicle.id}
            className="flex items-center gap-2.5 border-b border-hairline px-3.5 py-2.5 last:border-b-0"
          >
            <span className="num flex size-[30px] items-center justify-center rounded-lg bg-muted text-[10px] font-medium text-muted-foreground">
              {vehicle.tonnage}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[12.5px] font-medium">{vehicle.plate}</span>
              <span className="truncate text-[11px] text-muted-foreground">
                {[vehicle.driverName, vehicle.detail].filter(Boolean).join(" · ")}
              </span>
            </div>
            <StatusBadge tone={vehicle.available ? "success" : "neutral"} size="sm">
              {vehicle.available ? "Disponible" : "Indispo."}
            </StatusBadge>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * État vide « Tournées du jour » — remplace « Aucune tournée active. »
 * ------------------------------------------------------------------ */

export interface RouteSuggestion {
  id: string;
  label: string;
  detail: string;
  noteIds: string[];
}

export function NoActiveRoutes({
  unassigned,
  lateCount,
  suggestions,
  onPlanLate,
  onCreate,
}: {
  unassigned: number;
  lateCount: number;
  suggestions: RouteSuggestion[];
  onPlanLate: () => void;
  onCreate: (suggestion: RouteSuggestion) => void;
}) {
  const navigate = useNavigate();
  return (
    <>
      <CardContent className="flex flex-col items-start gap-2.5">
        <p className="text-sm font-semibold">Aucune tournée lancée</p>
        <p className="t-body text-muted-foreground">
          {unassigned} bon(s) attendent une affectation, dont {lateCount} en retard.
          {suggestions.length > 0 && " Des regroupements par axe sont possibles."}
        </p>
        {lateCount > 0 ? (
          <Button size="sm" onClick={onPlanLate}>
            Planifier les {lateCount} bons en retard
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => navigate("/planning")}>
            Ouvrir la planification
          </Button>
        )}
      </CardContent>
      {suggestions.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-hairline bg-muted/30 px-3.5 py-3">
          <p className="num text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            Regroupements suggérés
          </p>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => onCreate(suggestion)}
              className="flex items-center gap-2.5 rounded-lg border border-hairline bg-card p-2.5 text-left hover:border-brand-300"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12.5px] font-medium">{suggestion.label}</span>
                <span className="truncate text-[11px] text-muted-foreground">{suggestion.detail}</span>
              </span>
              <Badge variant="secondary">Créer</Badge>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
