import { cn } from "@/lib/utils";
import type { ScanLogEntry } from "./usePickScan";

const TONE_TEXT = {
  idle: "text-muted-foreground",
  ok: "text-foreground",
  warn: "text-amber-700",
  error: "text-destructive",
} as const;

/**
 * Scan journal. Answers "j'ai bipé une fois de trop" without going through manual entry:
 * each successful scan can be undone until the final check.
 */
export function ScanJournal({
  log,
  onUndo,
}: {
  log: ScanLogEntry[];
  onUndo: (entry: ScanLogEntry) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label="Journal des scans">
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <h2 className="text-[13px] font-semibold">Journal des scans</h2>
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{log.length}</span>
        <p className="ml-auto text-xs text-muted-foreground">Chaque scan est annulable jusqu’au contrôle final.</p>
      </div>

      {log.map((entry) => (
        <div
          key={entry.id}
          className="grid grid-cols-[74px_minmax(0,1fr)_120px_96px_78px] items-center border-b px-3 last:border-b-0"
        >
          <div className="py-2 font-mono text-[11.5px] text-muted-foreground">{entry.time}</div>
          <div className={cn("min-w-0 truncate py-2 pr-2 text-[12.5px]", TONE_TEXT[entry.tone])}>{entry.label}</div>
          <div className="truncate py-2 font-mono text-[11.5px] text-muted-foreground">{entry.code}</div>
          <div className="py-2 font-mono text-[11.5px] text-muted-foreground">
            {entry.tone === "ok" ? `+${entry.amount}` : entry.tone === "warn" ? "ignoré" : "—"}
          </div>
          <div className="py-2 text-right">
            {entry.tone === "ok" && entry.key && (
              <button
                type="button"
                onClick={() => onUndo(entry)}
                className="text-[11.5px] font-medium text-muted-foreground hover:underline"
              >
                Annuler
              </button>
            )}
          </div>
        </div>
      ))}

      {log.length === 0 && (
        <p className="px-3 py-5 text-center text-[12.5px] text-muted-foreground">Aucun scan pour l’instant.</p>
      )}
    </section>
  );
}
