import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/shared/api/distribution";
import { useReceivables } from "@/shared/api/receivables";
import { ReceivablesKpis, ReceivablesTable, type ReceivableFilter } from "@/features/receivables/ReceivablesPanel";

/** Créances clients au jour : indicateurs globaux, puis balance âgée par client. */
export function ReceivablesPage() {
  const { data, error, isLoading, isValidating, mutate } = useReceivables();
  const [filter, setFilter] = useState<ReceivableFilter>("all");
  const result = data?.message;

  return (
    <>
      <PageHeader
        eyebrow="Pilotage"
        title="Créances clients"
        description="Ce que les clients doivent, ce qui est échu, ce qui arrive à échéance et qui relancer en priorité."
        actions={
          <Button variant="outline" onClick={() => void mutate()} disabled={isValidating}>
            <RefreshCw className={cn(isValidating && "animate-spin")} /> Actualiser
          </Button>
        }
      />

      {error ? (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(error)}
        </p>
      ) : null}

      <ReceivablesKpis data={result} filter={filter} onPick={setFilter} />
      <ReceivablesTable data={result} isLoading={isLoading} filter={filter} onFilterChange={setFilter} />
    </>
  );
}
