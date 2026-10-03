import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { Crosshair, ExternalLink, MapPinned, Pencil, Plus, Star, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { AddressDialog } from "@/features/customers/AddressDialog";
import { CommuneField } from "@/features/customers/CommuneField";
import { ADDRESS_TYPE_LABELS, formatGps, mapsUrl, parseGps, type SaveCustomer } from "@/features/customers/customerShared";
import { FormActions } from "@/features/customers/FormActions";
import type { AddressInput, CustomerAddress, CustomerDetail, CustomerOptions } from "@/shared/api/customers";
import { apiErrorMessage } from "@/shared/api/distribution";
import type { CommuneOption } from "@/shared/api/orders";
import { formatDateTime } from "@/shared/format";

const CustomerLocationMap = lazy(() =>
  import("@/features/customers/CustomerLocationMap").then((module) => ({ default: module.CustomerLocationMap })),
);

function initialCommune(customer: CustomerDetail): CommuneOption | null {
  return customer.commune ? { name: customer.commune, nom: customer.commune_name || customer.commune, wilaya: customer.wilaya || "" } : null;
}

export function CustomerLocationTab({
  customer,
  options,
  onSave,
  onSaveAddress,
  onDeleteAddress,
}: {
  customer: CustomerDetail;
  options?: CustomerOptions;
  onSave: SaveCustomer;
  onSaveAddress: (payload: AddressInput) => Promise<void>;
  onDeleteAddress: (name: string) => Promise<void>;
}) {
  const [commune, setCommune] = useState<CommuneOption | null>(() => initialCommune(customer));
  const [gps, setGps] = useState(customer.gps.raw);
  const [pending, setPending] = useState(false);
  const [locating, setLocating] = useState(false);
  const [editing, setEditing] = useState<CustomerAddress | "new" | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const parsed = parseGps(gps);
  const gpsInvalid = gps.trim() !== "" && !parsed;
  const communeChanged = (commune?.name ?? null) !== customer.commune;
  const gpsChanged = (parsed ? formatGps(parsed.latitude, parsed.longitude) : gps.trim()) !==
    (customer.gps.latitude != null && customer.gps.longitude != null ? formatGps(customer.gps.latitude, customer.gps.longitude) : "");
  const dirty = communeChanged || gpsChanged;

  const reset = () => {
    setCommune(initialCommune(customer));
    setGps(customer.gps.raw);
  };

  const submit = async () => {
    if (!dirty || pending || gpsInvalid || !commune) return;
    setPending(true);
    try {
      await onSave(
        {
          ...(communeChanged ? { commune: commune.name } : {}),
          ...(gpsChanged ? { gps: parsed ? formatGps(parsed.latitude, parsed.longitude) : "" } : {}),
        },
        "Localisation enregistrée",
      );
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const locate = () => {
    if (!navigator.geolocation) {
      toast.error("La géolocalisation n’est pas disponible sur cet appareil.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGps(formatGps(position.coords.latitude, position.coords.longitude));
        setLocating(false);
      },
      () => {
        toast.error("Position introuvable : autorisez la localisation ou cliquez sur la carte.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const removeAddress = async (name: string) => {
    setDeleting(name);
    try {
      await onDeleteAddress(name);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Commune et position GPS</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <FieldGroup className="gap-3">
              <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
                <div className="flex flex-col gap-3">
                  <Field>
                    <FieldLabel htmlFor="customer-commune">Commune</FieldLabel>
                    <CommuneField id="customer-commune" value={commune} onChange={setCommune} />
                    <FieldDescription>
                      Wilaya et région en découlent{customer.region ? ` (région actuelle : ${customer.region})` : ""}.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="customer-gps">Coordonnées GPS</FieldLabel>
                    <Input
                      id="customer-gps"
                      value={gps}
                      placeholder="35.697, -0.633"
                      aria-invalid={gpsInvalid || undefined}
                      className="font-mono"
                      onChange={(event) => setGps(event.target.value)}
                    />
                    <FieldDescription>
                      {gpsInvalid ? "Format attendu : latitude, longitude." : "Cliquez sur la carte ou faites glisser le repère."}
                    </FieldDescription>
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={locate} disabled={locating}>
                      {locating ? <Spinner /> : <Crosshair />} Ma position
                    </Button>
                    {parsed ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        nativeButton={false}
                        render={<a href={mapsUrl(parsed.latitude, parsed.longitude)} target="_blank" rel="noreferrer" />}
                      >
                        <ExternalLink /> Google Maps
                      </Button>
                    ) : null}
                    {gps ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setGps("")}>
                        <Trash2 /> Effacer
                      </Button>
                    ) : null}
                  </div>
                  {customer.gps.captured_at ? (
                    <p className="t-meta text-muted-foreground">
                      Relevé le {formatDateTime(customer.gps.captured_at)}
                      {customer.gps.captured_by ? ` par ${customer.gps.captured_by}` : ""}
                      {customer.gps.source_bl ? ` (livraison ${customer.gps.source_bl})` : ""}
                      {customer.gps.precision_m ? ` · précision ${Math.round(customer.gps.precision_m)} m` : ""}
                    </p>
                  ) : null}
                </div>
                <Suspense fallback={<div className="grid h-[340px] place-items-center rounded-lg bg-surface-subtle"><Spinner /></div>}>
                  <CustomerLocationMap
                    position={parsed ? [parsed.latitude, parsed.longitude] : null}
                    onPick={(latitude, longitude) => setGps(formatGps(latitude, longitude))}
                  />
                </Suspense>
              </div>
              <FormActions dirty={dirty} pending={pending} onReset={reset} />
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b">
          <CardTitle>Adresses</CardTitle>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> Ajouter
          </Button>
        </CardHeader>
        <CardContent className="pt-1">
          {customer.addresses.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Aucune adresse enregistrée.</p>
          ) : (
            customer.addresses.map((address) => (
              <div key={address.name} className="flex items-start gap-3 border-b py-3 last:border-b-0">
                <MapPinned className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    {address.address_title || address.name}
                    <StatusBadge tone="neutral" size="sm" dot={false}>
                      {ADDRESS_TYPE_LABELS[address.address_type] ?? address.address_type}
                    </StatusBadge>
                    {address.is_primary ? (
                      <StatusBadge tone="info" size="sm" dot={false}>
                        <Star className="size-3" /> Principale
                      </StatusBadge>
                    ) : null}
                    {address.is_shipping ? (
                      <StatusBadge tone="success" size="sm" dot={false}>
                        <Truck className="size-3" /> Livraison
                      </StatusBadge>
                    ) : null}
                    {address.disabled ? <StatusBadge tone="neutral" size="sm">Désactivée</StatusBadge> : null}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {[address.address_line1, address.address_line2, address.city, address.state, address.pincode].filter(Boolean).join(", ")}
                  </p>
                  {address.phone || address.email ? (
                    <p className="truncate t-meta text-subtle">{[address.phone, address.email].filter(Boolean).join(" · ")}</p>
                  ) : null}
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Modifier ${address.address_title}`} onClick={() => setEditing(address)}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Supprimer ${address.address_title}`}
                  disabled={deleting === address.name}
                  onClick={() => {
                    if (window.confirm("Supprimer cette adresse ? Si des documents l’utilisent, elle sera seulement désactivée.")) {
                      void removeAddress(address.name);
                    }
                  }}
                >
                  {deleting === address.name ? <Spinner /> : <Trash2 />}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <AddressDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        customer={customer}
        address={editing === "new" ? null : editing}
        addressTypes={options?.address_types}
        onSubmit={async (payload) => {
          await onSaveAddress(payload);
          setEditing(null);
        }}
      />
    </div>
  );
}
