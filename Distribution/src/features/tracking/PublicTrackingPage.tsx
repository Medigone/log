import { Check, Circle, LoaderCircle, PackageCheck, ShieldCheck, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiErrorMessage, usePublicTracking } from "@/shared/api/distribution";
import { getStopVisualStyle } from "@/features/planning/stopStatus";
import { formatDateTime } from "@/shared/format";

export function PublicTrackingPage({ deliveryNote }: { deliveryNote: string }) {
  const { data, error, isLoading } = usePublicTracking(deliveryNote);
  const tracking = data?.message;

  return (
    <main className="min-h-screen bg-surface-subtle px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-md bg-brand-600 text-white">
              <Truck className="size-5" />
            </span>
            <div>
              <p className="font-semibold text-foreground">IntraPro Distribution</p>
              <p className="t-meta text-muted-foreground">Suivi du bon de livraison</p>
            </div>
          </div>
          <ShieldCheck className="size-5 text-emerald-600" />
        </header>

        {isLoading && (
          <div className="grid min-h-80 place-items-center rounded-lg border border-hairline bg-card">
            <LoaderCircle className="size-7 animate-spin text-brand-600" />
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800">
            {apiErrorMessage(error)}
          </div>
        )}

        {tracking && (
          <>
            <Card className="p-6">
              <p className="t-micro text-muted-foreground">Bon de livraison</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <h1 className="t-display">{tracking.name}</h1>
                <StatusBadge tone={getStopVisualStyle(tracking.status).tone}>{tracking.status}</StatusBadge>
              </div>
            </Card>

            <Card>
              <CardHeader className="px-6 pt-6">
                <CardTitle>Progression</CardTitle>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <ol className="space-y-4">
                  {tracking.steps.map((step) => (
                    <li key={step.key} className="flex gap-3">
                      <span
                        className={`grid size-8 shrink-0 place-items-center rounded-full ${
                          step.completed ? "bg-emerald-100 text-emerald-700" : "bg-surface-subtle text-subtle"
                        }`}
                      >
                        {step.completed ? <Check className="size-4" /> : <Circle className="size-3" />}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{step.label}</p>
                        <p className="num t-meta text-muted-foreground">
                          {step.completed_at
                            ? formatDateTime(step.completed_at)
                            : step.completed
                              ? "Étape confirmée"
                              : "En attente"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center gap-2 px-6 pt-6">
                <PackageCheck className="size-5 shrink-0 text-brand-600" />
                <CardTitle>Articles</CardTitle>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <div className="divide-y divide-hairline">
                  {tracking.articles.map((article) => (
                    <div key={article.item_code} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{article.item_name}</p>
                        <p className="truncate t-meta text-muted-foreground">{article.item_code}</p>
                      </div>
                      <p className="num shrink-0 text-sm font-semibold text-slate-700">
                        {article.delivered_quantity} / {article.quantity}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <p className="text-center t-meta text-subtle">
              Cette page publique affiche uniquement l’avancement et les articles.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
