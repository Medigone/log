import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Copy, Globe, KeyRound, LoaderCircle } from "lucide-react";
import { FormSelect } from "@/components/FilterSelect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { usePortalAccess, type CustomerDetail, type PortalUserInput, type PortalUserResult } from "@/shared/api/customers";
import { apiErrorMessage } from "@/shared/api/distribution";

const NEW_CONTACT = "__new__";

const RESULT_LABELS: Record<PortalUserResult["status"], string> = {
  created: "Accès créé",
  linked_existing: "Compte existant rattaché",
  already_linked: "Ce compte est déjà rattaché",
};

export function CustomerPortalTab({
  customer,
  onCreate,
}: {
  customer: CustomerDetail;
  onCreate: (payload: PortalUserInput) => Promise<PortalUserResult>;
}) {
  const { data, error, isLoading, mutate } = usePortalAccess(customer.name, true);
  const setup = data?.message;
  const [contact, setContact] = useState(NEW_CONTACT);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<PortalUserResult | null>(null);
  const eligible = !customer.disabled && customer.status === "Actif";
  const manual = contact === NEW_CONTACT;
  const canCreate = eligible && !pending && (manual ? Boolean(firstName.trim() && email.trim()) : Boolean(contact));
  const availableContacts = (setup?.contacts ?? []).filter((row) => !row.user);

  const submit = async () => {
    if (!canCreate) return;
    setPending(true);
    try {
      const payload: PortalUserInput = manual
        ? { customer: customer.name, firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim() }
        : { customer: customer.name, contact };
      const created = await onCreate(payload);
      setResult(created);
      setFirstName("");
      setLastName("");
      setEmail("");
      setContact(NEW_CONTACT);
      await mutate();
      toast.success(RESULT_LABELS[created.status]);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  if (error) {
    return (
      <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <AlertTriangle className="size-4 shrink-0" />
        {apiErrorMessage(error)}
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Accès au portail client</CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          {isLoading || !setup ? (
            <div className="grid min-h-24 place-items-center">
              <LoaderCircle className="size-5 animate-spin text-brand-600" />
            </div>
          ) : setup.accesses.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Aucun accès : le client ne peut pas encore commander en ligne.</p>
          ) : (
            setup.accesses.map((access) => (
              <div key={access.user} className="flex items-center gap-3 border-b py-3 last:border-b-0">
                <Globe className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{access.fullName}</p>
                  <p className="truncate t-meta text-subtle">{access.user}</p>
                </div>
                {access.enabled ? <StatusBadge tone="success">Actif</StatusBadge> : <StatusBadge tone="neutral">Désactivé</StatusBadge>}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Créer un accès</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {result?.temporaryPassword ? (
            <Alert className="mb-3">
              <KeyRound />
              <AlertTitle>Mot de passe temporaire de {result.user}</AlertTitle>
              <AlertDescription>
                <span className="flex items-center gap-2">
                  <code className="rounded bg-muted px-2 py-1 font-mono text-sm">{result.temporaryPassword}</code>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Copier le mot de passe"
                    onClick={() => void navigator.clipboard?.writeText(result.temporaryPassword ?? "").then(() => toast.success("Copié"))}
                  >
                    <Copy />
                  </Button>
                </span>
                Communiquez-le au client : il devra le changer à la première connexion. Il ne sera plus affiché.
              </AlertDescription>
            </Alert>
          ) : null}
          {!eligible ? (
            <p className="text-sm text-muted-foreground">Un accès portail ne peut être créé que pour un client actif (statut « Actif », non désactivé).</p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <FieldGroup className="gap-3">
                <Field>
                  <FieldLabel>Contact</FieldLabel>
                  <FormSelect
                    aria-label="Contact"
                    value={contact}
                    onChange={setContact}
                    options={[
                      { value: NEW_CONTACT, label: "Nouveau contact" },
                      ...availableContacts.map((row) => ({ value: row.name, label: `${row.fullName} · ${row.email}` })),
                    ]}
                  />
                </Field>
                {manual ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="portal-first-name">Prénom</FieldLabel>
                        <Input id="portal-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="portal-last-name">Nom</FieldLabel>
                        <Input id="portal-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} />
                      </Field>
                    </div>
                    <Field>
                      <FieldLabel htmlFor="portal-email">E-mail de connexion</FieldLabel>
                      <Input id="portal-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                    </Field>
                  </>
                ) : null}
                <div className="flex justify-end">
                  <Button type="submit" disabled={!canCreate}>
                    {pending ? <Spinner /> : <KeyRound />}
                    Créer l’accès
                  </Button>
                </div>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
