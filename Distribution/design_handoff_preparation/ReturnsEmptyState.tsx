import { useNavigate } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/reui/badge";

/**
 * Onglet Retours quand il n’y a rien à contrôler — le cas courant.
 * Remplace le tableau vide : explique d’où vient un retour, et donne le contexte 30 jours.
 * Le tableau de ReturnControlPanel reste utilisé dès que `routes.length > 0`.
 */
export function ReturnsEmptyState({
  metrics,
}: {
  metrics?: {
    /** retours déclarés sur 30 jours */
    declared: number;
    /** écarts de comptage → exceptions responsable */
    discrepancies: number;
    /** délai moyen entre retour dépôt et contrôle, en minutes */
    averageControlDelay: number;
  };
}) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center gap-2.5 border-b border-hairline">
          <CardTitle>Retours à contrôler</CardTitle>
          <Badge variant="secondary">0</Badge>
          <div className="flex-1" />
          <p className="t-meta text-muted-foreground">
            Recomptage véhicule → entrepôt. Indépendant du contrôle de caisse.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-2 py-11 text-center">
          <span className="flex size-9 items-center justify-center rounded-[10px] border border-dashed border-input text-muted-foreground">
            <ClipboardCheck className="size-4" />
          </span>
          <p className="text-sm font-semibold">Aucun retour en attente</p>
          <p className="t-body max-w-[380px] text-muted-foreground">
            Un retour apparaît ici dès qu’un livreur le déclare depuis son mobile. Aucune tournée n’a
            de marchandise restante aujourd’hui.
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/deliveries")}>
              Voir les tournées du jour
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/stock?focus=route")}>
              Historique des retours
            </Button>
          </div>
        </CardContent>
      </Card>

      {metrics && (
        <section aria-label="Retours · 30 jours" className="grid gap-3 sm:grid-cols-3">
          <MetricTile
            label="Retours déclarés · 30 j"
            value={metrics.declared}
            unit="tournées"
          />
          <MetricTile
            label="Écarts de comptage"
            value={metrics.discrepancies}
            unit="exceptions responsable"
          />
          <MetricTile
            label="Délai moyen de contrôle"
            value={metrics.averageControlDelay}
            unit="minutes après retour dépôt"
          />
        </section>
      )}
    </div>
  );
}

function MetricTile({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-hairline bg-card p-3.5">
      <span className="num whitespace-nowrap text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className="num text-2xl font-semibold leading-none tracking-tight">{value}</span>
        <span className="t-meta text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}
