import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ResolvedScan } from "@/features/inventory/inventoryScan";
import type { BatchOption } from "@/shared/api/inventory";
import { formatShortDate } from "@/shared/format";
import { parseDecimal } from "@/shared/format/parseDecimal";

export interface CountPromptValues {
  qty: number;
  batchNo: string | null;
  expiryDate: string | null;
}

/** Quantité comptée (et lot pour un article géré par lot), après un scan. */
export function CountEntryPrompt({
  scan,
  loadBatches,
  defaultQty = 1,
  lastBatch,
  onConfirm,
  onCancel,
}: {
  scan: ResolvedScan;
  loadBatches?: () => Promise<BatchOption[]>;
  defaultQty?: number;
  lastBatch?: string | null;
  onConfirm: (values: CountPromptValues) => void;
  onCancel: () => void;
}) {
  const [qty, setQty] = useState(String(defaultQty));
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [batchNo, setBatchNo] = useState(lastBatch || "");
  const [newBatch, setNewBatch] = useState(false);
  const [expiryDate, setExpiryDate] = useState("");
  const qtyRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    qtyRef.current?.focus();
    qtyRef.current?.select();
  }, []);

  useEffect(() => {
    if (!scan.hasBatch || !loadBatches) return;
    let cancelled = false;
    setLoading(true);
    loadBatches()
      .then((rows) => {
        if (cancelled) return;
        setBatches(rows);
        if (!rows.length) setNewBatch(true);
      })
      .catch(() => {
        // Hors ligne : saisie libre du lot.
        if (!cancelled) setNewBatch(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Chargé une fois par article scanné.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan.itemCode]);

  const parsed = parseDecimal(qty);
  const batchValid = !scan.hasBatch || Boolean(batchNo.trim()) && (!newBatch || !scan.hasExpiry || Boolean(expiryDate));
  const valid = parsed != null && parsed > 0 && batchValid;
  const step = (delta: number) => setQty(String(Math.max(0, (parsed ?? 0) + delta)));

  const confirm = () => {
    if (!valid || parsed == null) return;
    onConfirm({
      qty: parsed,
      batchNo: scan.hasBatch ? batchNo.trim() : null,
      expiryDate: scan.hasBatch && newBatch ? expiryDate || null : null,
    });
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        confirm();
      }}
    >
      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium">{scan.itemName}</p>
        <p className="truncate t-meta text-muted-foreground">
          {scan.itemCode}
          {scan.factor !== 1 ? ` · 1 ${scan.uom} = ${scan.factor} ${scan.stockUom}` : ""}
        </p>
      </div>

      {scan.hasBatch ? (
        <div className="flex flex-col gap-1.5">
          <span className="t-micro text-muted-foreground">Lot</span>
          {loading ? <Spinner /> : null}
          {!newBatch ? (
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Lot">
              {batches.map((batch) => (
                <button
                  key={batch.batch_no}
                  type="button"
                  role="radio"
                  aria-checked={batchNo === batch.batch_no}
                  onClick={() => setBatchNo(batch.batch_no)}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-left text-[12.5px]",
                    batchNo === batch.batch_no ? "border-brand-400 bg-brand-50" : "hover:bg-muted",
                  )}
                >
                  <span className="font-mono">{batch.batch_no}</span>
                  {batch.expiry_date ? <span className="ml-1.5 text-muted-foreground">{formatShortDate(batch.expiry_date)}</span> : null}
                </button>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNewBatch(true);
                  setBatchNo("");
                }}
              >
                <Plus /> Autre lot
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Input value={batchNo} onChange={(event) => setBatchNo(event.target.value)} placeholder="N° de lot" aria-label="N° de lot" />
              <Input
                type="date"
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
                aria-label="Date de péremption"
              />
              {batches.length ? (
                <Button type="button" variant="ghost" size="sm" className="col-span-2 justify-start" onClick={() => setNewBatch(false)}>
                  Choisir un lot existant
                </Button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" onClick={() => step(-1)} aria-label="Retirer 1">
          <Minus />
        </Button>
        <Input
          ref={qtyRef}
          value={qty}
          inputMode="decimal"
          onChange={(event) => setQty(event.target.value)}
          className="num h-12 text-center text-[20px]"
          aria-label="Quantité comptée"
        />
        <Button type="button" variant="outline" size="icon" onClick={() => step(1)} aria-label="Ajouter 1">
          <Plus />
        </Button>
        <span className="w-16 truncate text-[13px] text-muted-foreground">{scan.uom}</span>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={!valid}>
          Compter
        </Button>
      </div>
    </form>
  );
}
