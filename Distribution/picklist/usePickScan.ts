import { useCallback, useMemo, useRef, useState } from "react";

export interface PickLine {
  /** `${itemCode}-${warehouse ?? ""}` */
  key: string;
  itemCode: string;
  itemName: string;
  /** Item barcode, when the API exposes one. */
  barcode?: string;
  warehouse?: string;
  salesOrder?: string;
  requested: number;
  uom?: string;
}

export type ScanTone = "idle" | "ok" | "warn" | "error";

export interface ScanLogEntry {
  id: string;
  /** Undefined for unknown-code errors. */
  key?: string;
  amount: number;
  code: string;
  label: string;
  time: string;
  tone: ScanTone;
}

function now() {
  const date = new Date();
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

/**
 * Scan state for the pick step: resolve a code, increment within bounds, keep a
 * cancellable journal. Quantities stay local until the existing "save picked
 * quantities" mutation runs — the scan itself never hits the API.
 */
export function usePickScan(lines: PickLine[], packSize = 1) {
  const step = Math.max(1, packSize);
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [scanValue, setScanValue] = useState("");
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; tone: ScanTone }>({ text: "", tone: "idle" });
  const [log, setLog] = useState<ScanLogEntry[]>([]);
  const seq = useRef(0);

  const byCode = useMemo(() => {
    const map = new Map<string, PickLine>();
    for (const line of lines) {
      if (line.barcode) map.set(line.barcode.toLowerCase(), line);
      map.set(line.itemCode.toLowerCase(), line);
    }
    return map;
  }, [lines]);

  const push = useCallback((entry: Omit<ScanLogEntry, "id" | "time">) => {
    seq.current += 1;
    setLog((current) => [{ ...entry, id: `scan-${seq.current}`, time: now() }, ...current].slice(0, 20));
  }, []);

  const setQuantity = useCallback(
    (key: string, value: number) => {
      const line = lines.find((entry) => entry.key === key);
      if (!line) return;
      const next = Math.max(0, Math.min(line.requested, value));
      setPicked((current) => ({ ...current, [key]: next }));
      setLastKey(key);
      setFeedback({
        text: `${line.itemCode} · ${next} / ${line.requested}`,
        tone: next >= line.requested ? "ok" : "warn",
      });
    },
    [lines],
  );

  const applyScan = useCallback(
    (raw: string) => {
      const code = raw.trim();
      setScanValue("");
      inputRef.current?.focus();
      if (!code) return;

      const line = byCode.get(code.toLowerCase());
      if (!line) {
        setFeedback({ text: `Code inconnu : ${code} — aucune ligne de cette liste.`, tone: "error" });
        push({ code, label: "Code non reconnu", amount: 0, tone: "error" });
        return;
      }

      const current = picked[line.key] ?? 0;
      if (current >= line.requested) {
        setLastKey(line.key);
        setFeedback({ text: `Quantité déjà atteinte pour ${line.itemCode} — scan ignoré.`, tone: "warn" });
        push({ key: line.key, code, label: `${line.itemName} · quantité déjà atteinte`, amount: 0, tone: "warn" });
        return;
      }

      const next = Math.min(line.requested, current + step);
      setPicked((state) => ({ ...state, [line.key]: next }));
      setLastKey(line.key);
      setFeedback({
        text: `${line.itemCode} · ${next} / ${line.requested}${next >= line.requested ? " — ligne complète" : ""}`,
        tone: "ok",
      });
      push({ key: line.key, code, label: line.itemName, amount: next - current, tone: "ok" });
    },
    [byCode, picked, push, step],
  );

  const undo = useCallback(
    (entry: ScanLogEntry) => {
      if (!entry.key || entry.amount <= 0) return;
      setQuantity(entry.key, (picked[entry.key] ?? 0) - entry.amount);
      setLog((current) => current.filter((item) => item.id !== entry.id));
    },
    [picked, setQuantity],
  );

  const fillAll = useCallback(() => {
    const next: Record<string, number> = {};
    for (const line of lines) next[line.key] = line.requested;
    setPicked(next);
    setFeedback({ text: "Toutes les lignes ont été prélevées manuellement.", tone: "ok" });
  }, [lines]);

  const totals = useMemo(() => {
    const requested = lines.reduce((sum, line) => sum + line.requested, 0);
    const done = lines.reduce((sum, line) => sum + (picked[line.key] ?? 0), 0);
    const partialLines = lines.filter((line) => {
      const value = picked[line.key] ?? 0;
      return value > 0 && value < line.requested;
    }).length;
    return {
      requested,
      picked: done,
      remaining: requested - done,
      complete: requested > 0 && done === requested,
      percent: requested ? Math.round((done / requested) * 100) : 0,
      partialLines,
    };
  }, [lines, picked]);

  return { picked, scanValue, setScanValue, applyScan, setQuantity, undo, fillAll, feedback, lastKey, log, totals, step, inputRef };
}
