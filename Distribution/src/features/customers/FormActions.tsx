import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function FormActions({ dirty, pending, onReset }: { dirty: boolean; pending: boolean; onReset: () => void }) {
  return (
    <div className="flex items-center justify-end gap-2">
      {dirty ? <span className="mr-auto t-meta text-amber-700">Modifications non enregistrées</span> : null}
      <Button type="button" variant="ghost" disabled={!dirty || pending} onClick={onReset}>
        <RotateCcw /> Annuler
      </Button>
      <Button type="submit" disabled={!dirty || pending}>
        {pending ? <Spinner /> : <Save />}
        Enregistrer
      </Button>
    </div>
  );
}
