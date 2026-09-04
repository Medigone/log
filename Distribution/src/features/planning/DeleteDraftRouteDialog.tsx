import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";
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

interface DeleteDraftRouteDialogProps {
  routeName: string;
  deleting: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteDraftRouteDialog({
  routeName,
  deleting,
  error,
  onClose,
  onConfirm,
}: DeleteDraftRouteDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && !deleting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <p className="t-micro text-destructive">Confirmation requise</p>
          <DialogTitle>Supprimer la tournée</DialogTitle>
          <DialogDescription>
            La tournée {routeName} sera définitivement supprimée. Aucun bon de livraison n’y est affecté.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error ? (
            <div role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="size-4 shrink-0" />
              {error}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting}>
            {deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
            {deleting ? "Suppression…" : "Supprimer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
