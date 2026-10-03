import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatQuantity } from "@/shared/format";

export type ScanQtyPrompt = {
  itemCode: string;
  itemName: string;
  picked: number;
  requested: number;
  remaining: number;
  increment: number;
  uom?: string;
};

export function ScanQtyDialog({
  prompt,
  onConfirm,
  onCancel,
}: {
  prompt: ScanQtyPrompt | null;
  onConfirm: (qty: number) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const defaultQty = prompt ? Math.min(Math.max(1, prompt.increment), prompt.remaining) : 1;
  const [value, setValue] = useState(String(defaultQty));

  useEffect(() => {
    if (!prompt) return;
    setValue(String(Math.min(Math.max(1, prompt.increment), prompt.remaining)));
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [prompt]);

  const remaining = prompt?.remaining ?? 0;
  const parsed = Number(value);
  const qty = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  const applied = Math.min(qty, remaining);
  const canSubmit = Boolean(prompt) && applied > 0;

  return (
    <Dialog open={Boolean(prompt)} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent overlayClassName="z-[110]" className="z-[120]" showCloseButton={false} size="sm:max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            onConfirm(applied);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {prompt ? `${prompt.itemCode} · ${prompt.itemName}` : "Quantité à prélever"}
            </DialogTitle>
            <DialogDescription>
              {prompt
                ? `${formatQuantity(prompt.picked)} / ${formatQuantity(prompt.requested)} ${prompt.uom || "u"} · reste ${formatQuantity(prompt.remaining)}`
                : "Saisissez la quantité à ajouter."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <label className="flex flex-col gap-1.5">
              <span className="t-micro text-muted-foreground">Quantité à prélever</span>
              <Input
                ref={inputRef}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                aria-label="Quantité à prélever"
                className="num h-12 text-lg"
              />
            </label>
            {qty > remaining ? (
              <p className="text-xs text-amber-800">La quantité sera limitée à {formatQuantity(remaining)}.</p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              Confirmer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
