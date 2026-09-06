import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PickLine } from "@/features/preparation/pickScan";

export function PickLinesTable({
  lines,
  picked,
  lastKey,
  step,
  query,
  onQueryChange,
  pendingOnly,
  onPendingOnlyChange,
  onSetQuantity,
  readOnly,
}: {
  lines: PickLine[];
  picked: Record<string, number>;
  lastKey: string | null;
  step: number;
  query: string;
  onQueryChange: (value: string) => void;
  pendingOnly: boolean;
  onPendingOnlyChange: (value: boolean) => void;
  onSetQuantity: (key: string, value: number) => void;
  readOnly?: boolean;
}) {
  const term = query.trim().toLowerCase();
  const visible = lines
    .filter((line) => {
      const value = picked[line.key] ?? 0;
      if (pendingOnly && value >= line.requested) return false;
      if (!term) return true;
      return [line.itemCode, line.itemName, line.barcode, line.warehouse, line.salesOrder]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    })
    .sort((left, right) => {
      const lc = (picked[left.key] ?? 0) >= left.requested ? 1 : 0;
      const rc = (picked[right.key] ?? 0) >= right.requested ? 1 : 0;
      return lc - rc;
    });

  const grid = "grid grid-cols-[30px_minmax(0,1.6fr)_minmax(0,1.1fr)_152px_64px]";

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
        <h2 className="text-[13.5px] font-semibold">Lignes à prélever</h2>
        <span className="num rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{lines.length}</span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Article, entrepôt, commande…"
          aria-label="Filtrer les lignes"
          className="ml-auto h-[30px] w-[200px] rounded-lg border px-2.5 text-[12.5px] outline-none focus:border-muted-foreground"
        />
        <button
          type="button"
          onClick={() => onPendingOnlyChange(!pendingOnly)}
          aria-pressed={pendingOnly}
          className={cn(
            "flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium",
            pendingOnly ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
          )}
        >
          <span className="size-1.5 rounded-full bg-amber-500" /> Restants
        </button>
      </div>

      <div className={cn(grid, "t-micro border-b bg-muted/40 px-3 text-muted-foreground")}>
        <div className="py-2" />
        <div className="min-w-0 truncate py-2">Article</div>
        <div className="min-w-0 truncate py-2">Entrepôt · Cde</div>
        <div className="py-2 text-center">Prélevé / demandé</div>
        <div className="py-2 text-right">{readOnly ? "" : "Action"}</div>
      </div>

      {visible.map((line) => {
        const value = picked[line.key] ?? 0;
        const done = value >= line.requested;
        const started = value > 0;
        return (
          <div
            key={line.key}
            className={cn(
              grid,
              "items-center border-b px-3",
              lastKey === line.key && "bg-emerald-50/40",
              done && "opacity-60",
            )}
          >
            <div className="py-2.5">
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full border-[1.5px] text-[11px] font-bold",
                  done && "border-emerald-600 bg-emerald-100 text-emerald-700",
                  !done && started && "border-amber-500 bg-amber-100 text-amber-700",
                  !started && "border-border bg-background text-muted-foreground",
                )}
                aria-hidden
              >
                {done ? "✓" : started ? "◐" : "○"}
              </span>
            </div>

            <div className="flex min-w-0 flex-col gap-1 py-2 pr-2">
              <span className="truncate text-[13px] font-medium">
                {line.itemCode} · {line.itemName}
              </span>
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="h-1 min-w-6 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full", done ? "bg-emerald-600" : started ? "bg-amber-500" : "bg-border")}
                    style={{ width: `${Math.round((value / Math.max(line.requested, 1)) * 100)}%` }}
                  />
                </div>
                <span
                  className={cn(
                    "num shrink-0 whitespace-nowrap text-[10.5px]",
                    done ? "text-emerald-700" : "text-amber-700",
                  )}
                >
                  {done ? "complet" : `reste ${line.requested - value}`}
                </span>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-0.5 py-2 pr-2">
              <span className="truncate text-[12.5px] text-muted-foreground">
                {line.warehouse || "Entrepôt non défini"}
              </span>
              <span className="num truncate text-[11px] text-muted-foreground/70">{line.salesOrder}</span>
            </div>

            <div className="flex items-center justify-center gap-1.5 py-2">
              {readOnly ? null : (
                <button
                  type="button"
                  aria-label={`Retirer ${step}`}
                  onClick={() => onSetQuantity(line.key, value - step)}
                  className="grid size-[26px] shrink-0 place-items-center rounded-md border text-muted-foreground hover:bg-muted"
                >
                  <Minus className="size-3.5" />
                </button>
              )}
              <span
                className={cn(
                  "num whitespace-nowrap text-[13.5px] font-medium",
                  done ? "text-emerald-700" : started ? "text-foreground" : "text-muted-foreground",
                )}
                aria-label={`Quantité prélevée ${line.itemCode}`}
              >
                {value} / {line.requested}
              </span>
              {readOnly ? null : (
                <button
                  type="button"
                  aria-label={`Ajouter ${step}`}
                  onClick={() => onSetQuantity(line.key, value + step)}
                  className="grid size-[26px] shrink-0 place-items-center rounded-md border text-muted-foreground hover:bg-muted"
                >
                  <Plus className="size-3.5" />
                </button>
              )}
            </div>

            <div className="py-2 text-right">
              {readOnly ? null : (
                <button
                  type="button"
                  onClick={() => onSetQuantity(line.key, done ? 0 : line.requested)}
                  className={cn(
                    "whitespace-nowrap text-[11.5px] font-medium hover:underline",
                    done ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {done ? "Remettre à 0" : "Tout"}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
          <div className="grid size-8 place-items-center rounded-lg border border-dashed text-muted-foreground">✓</div>
          <p className="text-[13px] font-semibold">
            {pendingOnly ? "Plus rien à prélever" : "Aucune ligne ne correspond"}
          </p>
          <p className="max-w-[320px] text-[12.5px] leading-relaxed text-muted-foreground">
            {pendingOnly
              ? "Toutes les lignes de cette liste sont au complet."
              : "Aucune ligne pour cette recherche ou ce filtre."}
          </p>
          <button
            type="button"
            onClick={() => {
              onQueryChange("");
              onPendingOnlyChange(false);
            }}
            className="mt-1 h-[30px] rounded-lg border px-3 text-[12.5px] font-medium hover:bg-muted"
          >
            Réinitialiser les filtres
          </button>
        </div>
      ) : null}
    </section>
  );
}
