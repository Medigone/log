import type { ComponentType, ReactNode } from "react";
import { KpiTile } from "@/components/ui/kpi-tile";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/shared/design/statusTone";

export interface ActivityKpiItem {
  title: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  tone?: StatusTone;
  target?: string;
}

export function ActivityKpis({
  items,
  loading,
  onNavigate,
}: {
  items: ActivityKpiItem[];
  loading?: boolean;
  onNavigate: (target: string) => void;
}) {
  return (
    <section
      aria-label="Indicateurs d’activité"
      className={cn("grid gap-3 sm:grid-cols-2", items.length <= 3 ? "lg:grid-cols-3" : "lg:grid-cols-4")}
    >
      {items.map((item) => (
        <KpiTile
          key={item.title}
          icon={item.icon}
          tone={item.tone}
          label={item.title}
          value={loading ? "—" : item.value}
          hint={item.target ? <span className="font-medium text-brand-700">{item.hint} →</span> : item.hint}
          onClick={item.target ? () => onNavigate(item.target!) : undefined}
        />
      ))}
    </section>
  );
}
