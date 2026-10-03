import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Globe, Mail, Pencil, Phone, Plus, Star, Trash2, UserRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ContactInput, CustomerContact, CustomerDetail } from "@/shared/api/customers";
import { apiErrorMessage } from "@/shared/api/distribution";

function toInput(customer: CustomerDetail, contact: CustomerContact | null): ContactInput {
  return contact
    ? {
        customer: customer.name,
        name: contact.name,
        first_name: contact.first_name || contact.full_name,
        last_name: contact.last_name,
        designation: contact.designation,
        email: contact.email,
        phone: contact.phone === contact.mobile ? "" : contact.phone,
        mobile: contact.mobile,
        is_primary: contact.is_primary,
      }
    : {
        customer: customer.name,
        first_name: "",
        last_name: "",
        designation: "",
        email: "",
        phone: "",
        mobile: "",
        is_primary: customer.contacts.length === 0,
      };
}

export function ContactDialog({
  open,
  onOpenChange,
  customer,
  contact,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: CustomerDetail;
  contact: CustomerContact | null;
  onSubmit: (payload: ContactInput) => Promise<void>;
}) {
  const [values, setValues] = useState<ContactInput>(() => toInput(customer, contact));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValues(toInput(customer, contact));
    setError("");
  }, [open, contact, customer]);

  const set = <K extends keyof ContactInput>(key: K, value: ContactInput[K]) => setValues((current) => ({ ...current, [key]: value }));
  const canSave = Boolean(values.first_name.trim()) && !pending;
  const portalLinked = Boolean(contact?.user);

  const submit = async () => {
    if (!canSave) return;
    setPending(true);
    setError("");
    try {
      await onSubmit(values);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm:max-w-lg">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRound className="size-5 text-brand-600" /> {contact ? "Modifier le contact" : "Nouveau contact"}
            </DialogTitle>
            <DialogDescription>{customer.customer_name}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGroup className="gap-3">
              {error ? (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertTitle>Impossible d’enregistrer le contact</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="contact-first-name">Prénom</FieldLabel>
                  <Input id="contact-first-name" value={values.first_name} autoFocus onChange={(event) => set("first_name", event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="contact-last-name">Nom</FieldLabel>
                  <Input id="contact-last-name" value={values.last_name} onChange={(event) => set("last_name", event.target.value)} />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="contact-designation">Fonction</FieldLabel>
                <Input
                  id="contact-designation"
                  value={values.designation}
                  placeholder="Gérant, pharmacien, comptable…"
                  onChange={(event) => set("designation", event.target.value)}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="contact-mobile">Mobile</FieldLabel>
                  <Input id="contact-mobile" inputMode="tel" value={values.mobile} onChange={(event) => set("mobile", event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="contact-phone">Téléphone fixe</FieldLabel>
                  <Input id="contact-phone" inputMode="tel" value={values.phone} onChange={(event) => set("phone", event.target.value)} />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="contact-email">E-mail</FieldLabel>
                <Input
                  id="contact-email"
                  type="email"
                  value={values.email}
                  disabled={portalLinked}
                  onChange={(event) => set("email", event.target.value)}
                />
                {portalLinked ? <p className="t-meta text-muted-foreground">Lié à l’accès portail {contact?.user}.</p> : null}
              </Field>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={values.is_primary} onCheckedChange={(value) => set("is_primary", Boolean(value))} />
                Contact principal
              </label>
            </FieldGroup>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSave}>
              {pending ? <Spinner /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CustomerContactsTab({
  customer,
  onSaveContact,
  onDeleteContact,
}: {
  customer: CustomerDetail;
  onSaveContact: (payload: ContactInput) => Promise<void>;
  onDeleteContact: (name: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<CustomerContact | "new" | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const remove = async (contact: CustomerContact) => {
    if (!window.confirm(`Supprimer le contact ${contact.full_name} ?`)) return;
    setDeleting(contact.name);
    try {
      await onDeleteContact(contact.name);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b">
        <CardTitle>Contacts</CardTitle>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> Ajouter
        </Button>
      </CardHeader>
      <CardContent className="pt-1">
        {customer.contacts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun contact enregistré.</p>
        ) : (
          <ul aria-label="Contacts du client">
            {customer.contacts.map((contact) => (
              <li key={contact.name} className="flex items-start gap-3 border-b py-3 last:border-b-0">
                <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    {contact.full_name}
                    {contact.designation ? <span className="font-normal text-muted-foreground">· {contact.designation}</span> : null}
                    {contact.is_primary ? (
                      <StatusBadge tone="info" size="sm" dot={false}>
                        <Star className="size-3" /> Principal
                      </StatusBadge>
                    ) : null}
                    {contact.user ? (
                      <StatusBadge tone="success" size="sm" dot={false}>
                        <Globe className="size-3" /> Portail
                      </StatusBadge>
                    ) : null}
                  </p>
                  <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
                    {[...new Set([contact.mobile, contact.phone].filter(Boolean))].map((phone) => (
                      <a key={phone} href={`tel:${phone}`} className="inline-flex items-center gap-1 tabular-nums hover:underline">
                        <Phone className="size-3" /> {phone}
                      </a>
                    ))}
                    {contact.email ? (
                      <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 hover:underline">
                        <Mail className="size-3" /> {contact.email}
                      </a>
                    ) : null}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Modifier ${contact.full_name}`} onClick={() => setEditing(contact)}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Supprimer ${contact.full_name}`}
                  disabled={Boolean(contact.user) || deleting === contact.name}
                  onClick={() => void remove(contact)}
                >
                  {deleting === contact.name ? <Spinner /> : <Trash2 />}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <ContactDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        customer={customer}
        contact={editing === "new" ? null : editing}
        onSubmit={async (payload) => {
          await onSaveContact(payload);
          setEditing(null);
        }}
      />
    </Card>
  );
}
