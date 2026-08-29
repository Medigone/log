import { useState } from "react";
import { AlertTriangle, Check, LoaderCircle } from "lucide-react";
import { FormSelect } from "@/components/FilterSelect";
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
import { Textarea } from "@/components/ui/textarea";
import { fleetOptionLabel } from "@/features/fleet/fleetHelpers";
import type { FleetOption } from "@/shared/types/distribution";

export function AssignDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  mode,
  options,
  value,
  emptyLabel,
  saving,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  label: string;
  mode: "vehicle" | "driver";
  options: FleetOption[];
  value: string;
  emptyLabel: string;
  saving?: boolean;
  error?: string;
  onSubmit: (value: string, reason?: string) => Promise<void> | void;
}) {
  const [selected, setSelected] = useState(value);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const current = options.find((option) => option.name === value);

  const submit = async () => {
    setPending(true);
    try {
      await onSubmit(selected, reason.trim() || undefined);
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setSelected(value);
          setReason("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            {error && (
              <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <AlertTriangle className="size-4 shrink-0" />
                {error}
              </p>
            )}
            <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
              <span className="t-micro text-muted-foreground">Affectation actuelle</span>
              <span className="mt-0.5 block font-medium text-foreground">{current?.label || emptyLabel}</span>
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="t-micro text-muted-foreground">{label}</span>
              <FormSelect
                aria-label={label}
                value={selected}
                onChange={setSelected}
                options={[
                  { value: "", label: emptyLabel },
                  ...options.map((option) => ({ value: option.name, label: fleetOptionLabel(option, mode) })),
                ]}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="t-micro text-muted-foreground">Motif (optionnel)</span>
              <Textarea
                aria-label="Motif"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Raison de l’affectation, pour l’audit"
                rows={2}
              />
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving || pending}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving || pending}>
              {saving || pending ? <LoaderCircle className="animate-spin" /> : <Check />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
