import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, ClipboardCheck, Route, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader } from "@/components/ui/page-header";
import { apiErrorMessage, usePlanningBoard } from "@/shared/api/distribution";
import type { StatusTone } from "@/shared/design/statusTone";

const DAY_FLOW = [
  ["1", "Préparer", "Prélever et contrôler les commandes"],
  ["2", "Planifier", "Affecter les BL aux ressources"],
  ["3", "Livrer", "Guider les arrêts et collecter les preuves"],
] as const;

function localDate() {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function TodayPage() {
  const navigate = useNavigate();
  const { data, error, isLoading } = usePlanningBoard(localDate());
  const board = data?.message;
  const active = board?.routes.filter((route) => ["Publiée", "En cours"].includes(route.lifecycle)).length || 0;
  const exceptions = board?.routes.flatMap((route) => route.stops).filter((stop) => ["Partiellement Livré", "Non Livré"].includes(stop.status)).length || 0;
  const indicators: Array<{
    title: string;
    value: number;
    icon: typeof ClipboardCheck;
    tone: StatusTone;
    action: string;
    target: string;
  }> = [
    { title: "BL prêts à planifier", value: board?.unassigned.length || 0, icon: ClipboardCheck, tone: "info", action: "Affecter aux tournées", target: "/planning" },
    { title: "Tournées actives", value: active, icon: Route, tone: "success", action: "Suivre les livraisons", target: "/deliveries" },
    { title: "Exceptions à traiter", value: exceptions, icon: AlertCircle, tone: exceptions ? "warning" : "neutral", action: "Voir les résultats terrain", target: "/deliveries" },
  ];
  return (
    <>
      <PageHeader
        eyebrow="Vue opérationnelle"
        title="Aujourd’hui"
        description={`Les priorités du ${new Date().toLocaleDateString("fr-FR")}.`}
        actions={
          <Button onClick={() => navigate("/planning")}>
            Ouvrir le planning
            <ArrowRight />
          </Button>
        }
      />

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {apiErrorMessage(error)}
        </div>
      )}

      <section aria-label="Indicateurs du jour" className="grid gap-3 md:grid-cols-3">
        {indicators.map((item) => (
          <KpiTile
            key={item.title}
            icon={item.icon}
            tone={item.tone}
            label={item.title}
            value={isLoading ? "—" : item.value}
            hint={
              <span className="font-medium text-brand-700">
                {item.action} →
              </span>
            }
            onClick={() => navigate(item.target)}
          />
        ))}
      </section>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Flux de la journée</CardTitle>
            <p className="t-body text-muted-foreground">Une lecture simple de l’avancement opérationnel.</p>
          </div>
          <Truck className="size-5 shrink-0 text-subtle" />
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {DAY_FLOW.map(([step, title, description]) => (
            <div key={step} className="rounded-md border border-hairline bg-surface-subtle p-4">
              <span className="num mb-3 grid size-8 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                {step}
              </span>
              <h3 className="t-section">{title}</h3>
              <p className="mt-1 t-body text-muted-foreground">{description}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
