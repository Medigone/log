import { Minus, Plus, ListPlus, Trash2 } from "lucide-react";
import { CommitInput } from "@/components/CommitInput";
import { parseDecimal as parseNumber } from "@/shared/format/parseDecimal";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoney, formatQuantity, formatShortDate } from "@/shared/format";
import type { ReceiptLine } from "@/features/receipts/receiptScan";

export function ReceiptLinesTable({
  lines,
  lastKey,
  readOnly,
  onChange,
  onRemove,
  onSplitBatch,
}: {
  lines: ReceiptLine[];
  lastKey: string | null;
  readOnly?: boolean;
  onChange: (key: string, patch: Partial<ReceiptLine>) => void;
  onRemove: (key: string) => void;
  onSplitBatch: (key: string) => void;
}) {
  if (!lines.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card px-4 py-10 text-center">
        <p className="text-[13px] font-semibold">Aucun article pour l’instant</p>
        <p className="max-w-sm text-[12.5px] text-muted-foreground">
          Scannez le code-barres du premier article reçu. Un code inconnu ouvre la création de la fiche article.
        </p>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label="Articles reçus">
      <div className="hidden grid-cols-[minmax(0,1fr)_150px_120px_150px_150px_110px_72px] gap-3 border-b bg-muted/40 px-3 py-2 t-micro text-muted-foreground lg:grid">
        <span>Article</span>
        <span>Quantité reçue</span>
        <span>Prix unitaire</span>
        <span>Lot</span>
        <span>Péremption</span>
        <span className="text-right">Montant</span>
        <span />
      </div>
      {lines.map((line) => {
        const missingBatch = line.hasBatchNo && line.qty > 0 && !line.batchNo;
        const missingExpiry = line.hasExpiryDate && line.qty > 0 && Boolean(line.batchNo) && !line.expiryDate;
        return (
          <div
            key={line.key}
            data-testid={`receipt-line-${line.itemCode}`}
            className={cn(
              "grid grid-cols-2 items-center gap-x-3 gap-y-2 border-b px-3 py-2.5 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_150px_120px_150px_150px_110px_72px]",
              line.key === lastKey && "bg-emerald-50/50",
              line.qty <= 0 && "opacity-70",
            )}
          >
            <div className="col-span-2 min-w-0 lg:col-span-1">
              <p className="truncate text-[13.5px] font-medium">{line.itemName}</p>
              <p className="truncate t-meta text-muted-foreground">
                {line.itemCode}
                {line.barcode && line.barcode !== line.itemCode ? ` · ${line.barcode}` : ""}
                {line.uom ? ` · ${line.uom}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              {readOnly ? (
                <span className="num text-[13.5px] font-medium">{formatQuantity(line.qty)}</span>
              ) : (
                <>
                  <button
                    type="button"
                    aria-label={`Retirer une unité ${line.itemCode}`}
                    onClick={() => onChange(line.key, { qty: Math.max(0, line.qty - 1) })}
                    className="grid size-8 shrink-0 place-items-center rounded-md border text-muted-foreground hover:bg-muted"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <CommitInput
                    aria-label={`Quantité reçue ${line.itemCode}`}
                    inputMode="decimal"
                    className="num h-8 w-16 text-center"
                    value={String(line.qty)}
                    onCommit={(value) => {
                      const qty = parseNumber(value);
                      if (qty != null && qty >= 0) onChange(line.key, { qty });
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Ajouter une unité ${line.itemCode}`}
                    onClick={() => onChange(line.key, { qty: line.qty + 1 })}
                    className="grid size-8 shrink-0 place-items-center rounded-md border text-muted-foreground hover:bg-muted"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </>
              )}
            </div>

            <div>
              {readOnly ? (
                <span className="num text-[13px]">{formatMoney(line.rate, { precise: true })}</span>
              ) : (
                <CommitInput
                  aria-label={`Prix d’achat ${line.itemCode}`}
                  inputMode="decimal"
                  className={cn("num h-8", line.rate <= 0 && "border-amber-300 bg-amber-50/60")}
                  value={String(line.rate)}
                  onCommit={(value) => {
                    const rate = parseNumber(value);
                    if (rate != null && rate >= 0) onChange(line.key, { rate });
                  }}
                />
              )}
            </div>

            <div>
              {!line.hasBatchNo ? (
                <span className="hidden text-muted-foreground lg:inline">—</span>
              ) : readOnly ? (
                <span className="num text-[13px]">{line.batchNo || "—"}</span>
              ) : (
                <CommitInput
                  aria-label={`Lot ${line.itemCode}`}
                  placeholder="N° de lot"
                  className={cn("h-8 font-mono", missingBatch && "border-destructive/50 bg-destructive/5")}
                  value={line.batchNo || ""}
                  onCommit={(value) => onChange(line.key, { batchNo: value.trim() || null })}
                />
              )}
            </div>

            <div>
              {!line.hasBatchNo ? (
                <span className="hidden text-muted-foreground lg:inline">—</span>
              ) : readOnly ? (
                <span className="num text-[13px]">{formatShortDate(line.expiryDate || undefined)}</span>
              ) : (
                <Input
                  type="date"
                  aria-label={`Péremption ${line.itemCode}`}
                  className={cn("h-8", missingExpiry && "border-destructive/50 bg-destructive/5")}
                  value={line.expiryDate || ""}
                  onChange={(event) => onChange(line.key, { expiryDate: event.target.value || null })}
                />
              )}
            </div>

            <div className="num text-right text-[13px] font-medium">{formatMoney(line.qty * line.rate)}</div>

            <div className="flex justify-end gap-1">
              {!readOnly && line.hasBatchNo ? (
                <button
                  type="button"
                  title="Ajouter un autre lot"
                  aria-label={`Ajouter un lot ${line.itemCode}`}
                  onClick={() => onSplitBatch(line.key)}
                  className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted"
                >
                  <ListPlus className="size-4" />
                </button>
              ) : null}
              {!readOnly ? (
                <button
                  type="button"
                  title="Retirer la ligne"
                  aria-label={`Retirer la ligne ${line.itemCode}`}
                  onClick={() => onRemove(line.key)}
                  className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}
