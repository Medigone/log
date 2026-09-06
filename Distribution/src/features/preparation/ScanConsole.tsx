import type { RefObject } from "react";
import { ScanBarcode } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PickLine, ScanTone } from "@/features/preparation/pickScan";

const TONE_TEXT: Record<ScanTone, string> = {
  idle: "text-muted-foreground",
  ok: "text-emerald-700",
  warn: "text-amber-700",
  error: "text-destructive",
};

export function ScanConsole({
  lines,
  picked,
  lastKey,
  feedback,
  scanValue,
  onScanValueChange,
  onScan,
  step,
  totals,
  inputRef,
  disabled,
}: {
  lines: PickLine[];
  picked: Record<string, number>;
  lastKey: string | null;
  feedback: { text: string; tone: ScanTone };
  scanValue: string;
  onScanValueChange: (value: string) => void;
  onScan: (code: string) => void;
  step: number;
  totals: { picked: number; requested: number; percent: number; complete: boolean; partialLines: number };
  inputRef: RefObject<HTMLInputElement | null>;
  disabled?: boolean;
}) {
  const last = lastKey ? lines.find((line) => line.key === lastKey) : undefined;
  const lastPicked = last ? picked[last.key] ?? 0 : 0;
  const lastDone = last ? lastPicked >= last.requested : false;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-sm",
        feedback.tone === "error" && "border-destructive/30",
      )}
      aria-label="Scan des articles"
    >
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(272px, 1fr))" }}>
        <div className="flex min-w-0 flex-col gap-2.5 border-r p-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="t-micro whitespace-nowrap text-muted-foreground">Scan article</span>
            <span className="num whitespace-nowrap rounded bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
              +{step} / scan
            </span>
          </div>

          <Input
            ref={inputRef}
            value={scanValue}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={disabled}
            id="pick-scan-barcode"
            placeholder="Code puis Entrée"
            aria-label="Code-barres article"
            aria-invalid={feedback.tone === "error"}
            onChange={(event) => onScanValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              onScan(event.currentTarget.value);
            }}
            className={cn(
              "h-[52px] min-w-0 rounded-lg font-mono text-[17px]",
              feedback.tone === "error" && "border-destructive/40 bg-destructive/5",
            )}
          />

          <p className={cn("text-[12.5px] leading-snug", TONE_TEXT[feedback.tone])} aria-live="polite">
            {feedback.text || `Chaque scan ajoute ${step} unité${step > 1 ? "s" : ""} jusqu’à la quantité demandée.`}
          </p>
        </div>

        <div className={cn("flex min-w-0 flex-col gap-2 p-3.5", last ? (lastDone ? "bg-emerald-50/40" : "bg-amber-50/30") : "bg-muted/30")}>
          {last ? (
            <>
              <div className="flex items-center gap-2">
                <span className="t-micro text-muted-foreground">Dernier scan</span>
                <span
                  className={cn(
                    "ml-auto whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium",
                    lastDone ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800",
                  )}
                >
                  {lastDone ? "complet" : "en cours"}
                </span>
              </div>
              <p className="truncate text-[13px] font-medium">
                {last.itemCode} · {last.itemName}
              </p>
              <p className="flex items-baseline gap-1.5">
                <span className="num whitespace-nowrap text-[28px] font-medium leading-none">{lastPicked}</span>
                <span className="whitespace-nowrap text-[13px] text-muted-foreground">
                  / {last.requested} {last.uom ?? "u"}
                </span>
              </p>
              <div className="h-[5px] overflow-hidden rounded-full border bg-background">
                <div
                  className={cn("h-full", lastDone ? "bg-emerald-600" : "bg-amber-500")}
                  style={{ width: `${Math.round((lastPicked / Math.max(last.requested, 1)) * 100)}%` }}
                />
              </div>
              <p className={cn("text-xs font-medium", lastDone ? "text-emerald-700" : "text-amber-700")}>
                {lastDone ? "Quantité atteinte" : `Reste ${last.requested - lastPicked}`}
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-1.5 py-2 text-center">
              <ScanBarcode className="size-6 text-muted-foreground" />
              <p className="text-[12.5px] font-medium">En attente d’un scan</p>
              <p className="text-[11.5px] leading-snug text-muted-foreground">
                Le compteur de la ligne se met à jour à chaque lecture.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t bg-muted/30 px-3.5 py-2.5">
        <span className="num whitespace-nowrap text-[12.5px] font-medium">
          {totals.picked} / {totals.requested} unités prélevées
        </span>
        <div className="h-1.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full", totals.complete ? "bg-emerald-600" : "bg-foreground")}
            style={{ width: `${totals.percent}%` }}
          />
        </div>
        <span className="num whitespace-nowrap text-[11.5px] text-muted-foreground">{totals.percent}&nbsp;%</span>
        {totals.partialLines > 0 ? (
          <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-destructive">
            <span className="size-1.5 rounded-full bg-destructive" />
            {totals.partialLines} ligne{totals.partialLines > 1 ? "s" : ""} partielle
            {totals.partialLines > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>
    </section>
  );
}
