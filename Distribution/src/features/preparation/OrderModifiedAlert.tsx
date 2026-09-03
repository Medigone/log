import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function OrderModifiedAlert({
  accepting,
  onAccept,
  description = "Les listes de prélèvement ont été mises à jour selon les nouveaux articles. Confirmez que vous avez pris connaissance des changements avant de continuer.",
}: {
  accepting?: boolean;
  onAccept: () => void;
  description?: string;
}) {
  return (
    <Alert role="status" className="border-amber-200 bg-amber-50 text-amber-950">
      <AlertTriangle className="text-amber-700" />
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>
          <strong>Commande modifiée.</strong> {description}
        </span>
        <Button
          type="button"
          size="sm"
          className="shrink-0 bg-amber-700 text-white hover:bg-amber-800"
          disabled={accepting}
          onClick={onAccept}
        >
          {accepting ? "Enregistrement…" : "Prendre connaissance des modifications"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
