import { useEffect, useRef, useState, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseDecimal } from "@/shared/format/parseDecimal";

export interface ScanQuantityValues {
  qty: number;
  batchNo?: string | null;
  expiryDate?: string | null;
}

/** Fenêtre affichée après un scan caméra : article reconnu, quantité (et lot) à confirmer. */
export function ScanQuantityPrompt({
  title,
  subtitle,
  details,
  defaultQty,
  unit,
  askBatch,
  confirmLabel = "Ajouter",
  onConfirm,
  onCancel,
}: {
  title: string;
  subtitle?: string;
  details?: ReactNode;
  defaultQty: number;
  unit?: string;
  /** Demande le lot et la péremption (article géré par lot). */
  askBatch?: boolean;
  confirmLabel?: string;
  onConfirm: (values: ScanQuantityValues) => void;
  onCancel: () => void;
}) {
  const [qty, setQty] = useState(String(defaultQty));
  const [batchNo, setBatchNo] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const qtyRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    qtyRef.current?.focus();
    qtyRef.current?.select();
  }, []);

  const parsed = parseDecimal(qty);
  const valid = parsed != null && parsed > 0;
  const step = (delta: number) => setQty(String(Math.max(0, (parsed ?? 0) + delta)));

  const confirm = () => {
    if (!valid) return;
    onConfirm({
      qty: parsed,
      batchNo: askBatch ? batchNo.trim() || null : undefined,
      expiryDate: askBatch ? expiryDate || null : undefined,
    });
  };

  return (
    <form
      className="flex flex-col gap-3"
      aria-label="Quantité de l’article scanné"
      onSubmit={(event) => {
        event.preventDefault();
        confirm();
      }}
    >
      <div className="min-w-0">
        <p className="truncate text-base font-semibold">{title}</p>
        {subtitle ? <p className="truncate text-sm text-muted-foreground">{subtitle}</p> : null}
        {details ? <div className="mt-1 text-sm">{details}</div> : null}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon-lg" className="size-12" aria-label="Diminuer la quantité" onClick={() => step(-1)}>
          <Minus />
        </Button>
        <Input
          ref={qtyRef}
          aria-label="Quantité"
          inputMode="decimal"
          enterKeyHint="done"
          value={qty}
          onChange={(event) => setQty(event.target.value)}
          className="num h-12 flex-1 text-center text-2xl font-semibold"
        />
        <Button type="button" variant="outline" size="icon-lg" className="size-12" aria-label="Augmenter la quantité" onClick={() => step(1)}>
          <Plus />
        </Button>
        {unit ? <span className="w-10 shrink-0 text-sm text-muted-foreground">{unit}</span> : null}
      </div>

      {askBatch ? (
        <div className="grid grid-cols-2 gap-2">
          <Input
            aria-label="Numéro de lot"
            placeholder="N° de lot"
            className="h-11 font-mono"
            value={batchNo}
            onChange={(event) => setBatchNo(event.target.value)}
          />
          <Input
            aria-label="Date de péremption"
            type="date"
            className="h-11"
            value={expiryDate}
            onChange={(event) => setExpiryDate(event.target.value)}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="lg" className="h-12" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" size="lg" className="h-12" disabled={!valid}>
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
}
