import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TONES, type StatusTone } from "@/shared/design/statusTone";
import { summarizeVehicleDocuments } from "@/features/fleet/vehicle-details/vehicleDetailsModel";
import type { FleetDocument } from "@/shared/types/distribution";

function Count({ value, label, tone }: { value: number; label: string; tone: StatusTone }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className={cn("text-lg font-medium tabular-nums", TONES[tone].text)}>{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function VehicleDocumentsSummary({
  documents,
  onOpen,
}: {
  documents: FleetDocument[];
  onOpen: () => void;
}) {
  const summary = summarizeVehicleDocuments(documents);

  return (
    <Card size="sm" className="h-full pt-2">
      <CardHeader className="items-center border-b !pb-1.5">
        <CardTitle>Documents</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3">
        <div className="grid grid-cols-3 gap-3">
          <Count value={summary.valid} label="Valides" tone="success" />
          <Count value={summary.expiring} label="Proche expiration" tone="warning" />
          <Count value={summary.blocked} label="Expirés ou manquants" tone="danger" />
        </div>
        <Button size="xs" variant="outline" onClick={onOpen}>
          Voir les documents
        </Button>
      </CardContent>
    </Card>
  );
}
