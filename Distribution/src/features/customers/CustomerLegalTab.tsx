import { useRef, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, FileUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { SaveCustomer } from "@/features/customers/customerShared";
import { FormActions } from "@/features/customers/FormActions";
import { useFormSave } from "@/features/customers/useFormSave";
import type { CustomerDetail, CustomerFileKind } from "@/shared/api/customers";
import { apiErrorMessage } from "@/shared/api/distribution";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const IDENTIFIERS: Array<{ kind: CustomerFileKind; label: string; document: string }> = [
  { kind: "rc", label: "N° RC", document: "Registre de commerce" },
  { kind: "nif", label: "N° NIF", document: "Carte NIF" },
  { kind: "nis", label: "N° NIS", document: "Avis NIS" },
  { kind: "ai", label: "N° AI", document: "Article d’imposition" },
];

function fileName(url: string) {
  return decodeURIComponent(url.split("/").pop() || url);
}

function DocumentRow({
  label,
  url,
  onUpload,
  onRemove,
}: {
  label: string;
  url: string | null;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error("Le fichier dépasse 10 Mo.");
      return;
    }
    void run(() => onUpload(file));
  };

  return (
    <div className="flex items-center gap-3 border-b py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate t-meta text-brand-700 hover:underline">
            {fileName(url)} <ExternalLink className="size-3 shrink-0" />
          </a>
        ) : (
          <p className="t-meta text-muted-foreground">Aucun document</p>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        aria-label={`Joindre ${label}`}
        onChange={(event) => {
          pick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Spinner /> : <FileUp />}
        {url ? "Remplacer" : "Joindre"}
      </Button>
      {url ? (
        <Button type="button" variant="ghost" size="icon-sm" disabled={busy} aria-label={`Retirer ${label}`} onClick={() => void run(onRemove)}>
          <Trash2 />
        </Button>
      ) : null}
    </div>
  );
}

export function CustomerLegalTab({
  customer,
  onSave,
  onUpload,
  onRemove,
}: {
  customer: CustomerDetail;
  onSave: SaveCustomer;
  onUpload: (kind: CustomerFileKind, file: File) => Promise<void>;
  onRemove: (kind: CustomerFileKind) => Promise<void>;
}) {
  const form = useFormSave({ rc: customer.rc, nif: customer.nif, nis: customer.nis, ai: customer.ai }, onSave, "Identifiants enregistrés");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Identifiants fiscaux</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void form.submit();
            }}
          >
            <FieldGroup className="gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {IDENTIFIERS.map(({ kind, label }) => (
                  <Field key={kind}>
                    <FieldLabel htmlFor={`customer-${kind}`}>{label}</FieldLabel>
                    <Input
                      id={`customer-${kind}`}
                      value={form.values[kind]}
                      className="font-mono"
                      onChange={(event) => form.set(kind, event.target.value)}
                    />
                  </Field>
                ))}
              </div>
              <FormActions dirty={form.dirty} pending={form.pending} onReset={form.reset} />
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          {IDENTIFIERS.map(({ kind, document }) => (
            <DocumentRow
              key={kind}
              label={document}
              url={customer.files[kind]}
              onUpload={(file) => onUpload(kind, file)}
              onRemove={() => onRemove(kind)}
            />
          ))}
          <p className="pt-2 t-meta text-muted-foreground">PDF ou image, 10 Mo maximum. Documents privés, visibles des utilisateurs autorisés.</p>
        </CardContent>
      </Card>
    </div>
  );
}
