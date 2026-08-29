import { useRef, useState } from "react";
import { FileUp, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { documentAlertLabel } from "@/features/fleet/fleetHelpers";
import { documentAlertTone } from "@/shared/design/statusTone";
import { formatShortDate } from "@/shared/format";
import type { FleetDocument } from "@/shared/types/distribution";

export function DocumentCard({
  document,
  canWrite,
  saving,
  onUpload,
}: {
  document: FleetDocument;
  canWrite?: boolean;
  saving?: boolean;
  onUpload: (file: File, expiry?: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [expiry, setExpiry] = useState(document.expiresOn || "");
  const [uploading, setUploading] = useState(false);

  const pick = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      await onUpload(file, expiry || undefined);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-3">
          <CardTitle>{document.label}</CardTitle>
          <StatusBadge tone={documentAlertTone(document.alert)} size="sm">
            {documentAlertLabel(document.alert)}
          </StatusBadge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {document.url ? (
          <a href={document.url} target="_blank" rel="noreferrer" className="t-body font-medium text-brand-700 hover:underline">
            Voir le fichier
          </a>
        ) : (
          <p className="t-body text-muted-foreground">Aucun fichier.</p>
        )}
        {document.expiresOn ? (
          <p className="t-meta text-muted-foreground">
            Valable jusqu’au {formatShortDate(document.expiresOn)}
          </p>
        ) : null}
        {canWrite && (
          <div className="flex flex-wrap items-end gap-2">
            {document.key === "permis" || document.key === "assurance" || document.key === "controle_technique" ? (
              <label className="flex min-w-40 flex-col gap-1">
                <span className="t-micro text-muted-foreground">Expiration</span>
                <Input type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} aria-label={`Expiration ${document.label}`} />
              </label>
            ) : null}
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              aria-label={`Téléverser ${document.label}`}
              onChange={(event) => void pick(event.target.files?.[0])}
            />
            <Button type="button" variant="outline" disabled={saving || uploading} onClick={() => inputRef.current?.click()}>
              {saving || uploading ? <LoaderCircle className="animate-spin" /> : <FileUp />}
              Téléverser
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
