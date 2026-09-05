import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { divIcon } from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { ActivityDispatchNote, ActivityPayments, ActivityRouteSuggestion } from "@/shared/types/distribution";
import type { MapPoint } from "@/features/today/fleetProgress";

import "leaflet/dist/leaflet.css";

const ALGIERS: MapPoint = [36.7525, 3.042];

export interface CityCluster {
  city: string;
  count: number;
  late?: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

export function clusterUnassignedNotes(notes: ActivityDispatchNote[], today: string): CityCluster[] {
  const groups = new Map<string, CityCluster & { latSum: number; lngSum: number; geo: number }>();
  for (const note of notes) {
    if (note.routeId) continue;
    const city = note.customerCity || "Sans commune";
    const late = Boolean(note.requestedDate && note.requestedDate < today);
    const existing = groups.get(city);
    const hasGeo = note.latitude != null && note.longitude != null;
    if (existing) {
      existing.count += 1;
      existing.late = existing.late || late;
      if (hasGeo) {
        existing.latSum += note.latitude!;
        existing.lngSum += note.longitude!;
        existing.geo += 1;
      }
    } else {
      groups.set(city, {
        city,
        count: 1,
        late,
        latSum: hasGeo ? note.latitude! : 0,
        lngSum: hasGeo ? note.longitude! : 0,
        geo: hasGeo ? 1 : 0,
      });
    }
  }
  return [...groups.values()].map((group) => ({
    city: group.city,
    count: group.count,
    late: group.late,
    latitude: group.geo ? group.latSum / group.geo : null,
    longitude: group.geo ? group.lngSum / group.geo : null,
  }));
}

function FitClusterBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 12);
    else if (points.length > 1) map.fitBounds(points, { padding: [28, 28] });
    else map.setView(ALGIERS, 7);
  }, [map, points]);
  return null;
}

function clusterIcon(count: number, late?: boolean) {
  return divIcon({
    className: `distribution-map-cluster${late ? " distribution-map-cluster--late" : ""}`,
    html: `<span aria-label="${count} bons">${count}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export function DeliveryMapCard({
  clusters,
  onOpen,
}: {
  clusters: CityCluster[];
  onOpen?: () => void;
}) {
  const points = useMemo(
    () =>
      clusters.filter(
        (cluster): cluster is CityCluster & { latitude: number; longitude: number } =>
          cluster.latitude != null && cluster.longitude != null,
      ),
    [clusters],
  );
  const total = clusters.reduce((sum, cluster) => sum + cluster.count, 0);
  const bounds = points.map((cluster) => [cluster.latitude, cluster.longitude] as MapPoint);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center gap-2 border-b border-hairline">
        <CardTitle>Carte des livraisons</CardTitle>
        <div className="flex-1" />
        <span className="t-meta text-muted-foreground">{total} points</span>
      </CardHeader>
      <div className="relative h-[210px] bg-muted">
        <MapContainer
          center={bounds[0] || ALGIERS}
          zoom={bounds.length ? 11 : 7}
          scrollWheelZoom
          attributionControl={false}
          className="h-full w-full"
        >
          <FitClusterBounds points={bounds} />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {points.map((cluster) => (
            <Marker
              key={cluster.city}
              position={[cluster.latitude, cluster.longitude]}
              icon={clusterIcon(cluster.count, cluster.late)}
            >
              <Popup>
                <strong>{cluster.city}</strong>
                <br />
                {cluster.count} bon{cluster.count > 1 ? "s" : ""}
                {cluster.late ? " · en retard" : " · à planifier"}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        <div className="pointer-events-none absolute bottom-2.5 left-2.5 flex items-center gap-2.5 rounded-lg border border-hairline bg-card/95 px-2 py-1">
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

export function trendDelta(values: number[]): string | undefined {
  if (values.length < 8) return undefined;
  const previous = values.slice(0, Math.floor(values.length / 2)).reduce((sum, value) => sum + value, 0);
  const recent = values.slice(Math.floor(values.length / 2)).reduce((sum, value) => sum + value, 0);
  if (!previous && !recent) return undefined;
  if (!previous) return "+100 %";
  const percent = Math.round(((recent - previous) / previous) * 100);
  if (!percent) return undefined;
  return `${percent > 0 ? "+" : ""}${percent} %`;
}

export function TrendCard({
  values,
  labels,
}: {
  values: number[];
  labels?: [string, string, string];
}) {
  if (!values.length) return null;
  const max = Math.max(1, ...values);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const delta = trendDelta(values);
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
        {delta && (
          <StatusBadge tone={delta.startsWith("-") ? "danger" : "success"} size="sm">
            {delta}
          </StatusBadge>
        )}
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

export function CashierCard({ payments, onOpen }: { payments?: ActivityPayments; onOpen: () => void }) {
  const toControl = payments?.toControl ?? 0;
  const discrepancies = payments?.discrepancies ?? 0;
  const pending = payments?.pendingPayments ?? 0;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between border-b border-hairline">
        <CardTitle>Caisse</CardTitle>
        <Button variant="ghost" size="sm" onClick={onOpen}>
          Ouvrir
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="rounded-md border border-hairline p-3 text-left hover:border-brand-300 hover:bg-brand-50/40"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {discrepancies ? "Écarts à arbitrer" : toControl ? "À contrôler" : "Aucune tournée à contrôler"}
            </p>
            {(toControl > 0 || discrepancies > 0) && (
              <StatusBadge tone={discrepancies ? "danger" : "warning"} size="sm">
                {discrepancies ? "Écart" : "À contrôler"}
              </StatusBadge>
            )}
          </div>
          <p className="t-meta text-muted-foreground">
            {toControl} tournée(s) · {pending} paiement(s) en attente
          </p>
        </button>
      </CardContent>
    </Card>
  );
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
  suggestions: ActivityRouteSuggestion[];
  onPlanLate: () => void;
  onCreate: (suggestion: ActivityRouteSuggestion) => void;
}) {
  const navigate = useNavigate();
  return (
    <>
      <CardContent className="flex flex-col items-start gap-2.5">
        <p className="text-sm font-semibold">Aucune tournée lancée</p>
        <p className="t-body text-muted-foreground">
          {unassigned} bon(s) attendent une affectation, dont {lateCount} en retard.
          {suggestions.length > 0 && " Des regroupements par commune sont possibles."}
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

