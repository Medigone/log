import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, Ban, LoaderCircle, MapPin, Phone, RotateCcw, ShoppingCart, Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomerActivityTab } from "@/features/customers/CustomerActivityTab";
import { CustomerCommercialTab } from "@/features/customers/CustomerCommercialTab";
import { CustomerContactsTab } from "@/features/customers/CustomerContactsTab";
import { CustomerGeneralTab } from "@/features/customers/CustomerGeneralTab";
import { CustomerLegalTab } from "@/features/customers/CustomerLegalTab";
import { CustomerLocationTab } from "@/features/customers/CustomerLocationTab";
import { CustomerPortalTab } from "@/features/customers/CustomerPortalTab";
import { mapsUrl, statusTone, toCustomerSummary, type SaveCustomer } from "@/features/customers/customerShared";
import { useCustomer, useCustomerMutations, useCustomerOptions, type CustomerDetail } from "@/shared/api/customers";
import { apiErrorMessage } from "@/shared/api/distribution";
import { formatMoney } from "@/shared/format";

const TABS = ["general", "juridique", "localisation", "contacts", "commercial", "activite", "portail"] as const;
type CustomerTab = (typeof TABS)[number];

export function CustomerDetailPage() {
  const { customerId } = useParams();
  const name = customerId ? decodeURIComponent(customerId) : undefined;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab") as CustomerTab | null;
  const tab: CustomerTab = requested && TABS.includes(requested) ? requested : "general";
  const { data, error, isLoading, mutate } = useCustomer(name);
  const { data: optionsData } = useCustomerOptions();
  const api = useCustomerMutations();
  const [toggling, setToggling] = useState(false);
  const customer = data?.message;
  const options = optionsData?.message;

  const refresh = async (updated: CustomerDetail, message?: string) => {
    await mutate({ message: updated }, { revalidate: false });
    if (message) toast.success(message);
    return updated;
  };

  const save: SaveCustomer = async (changes, message = "Fiche client enregistrée") => {
    if (!customer) throw new Error("Client non chargé");
    return refresh(await api.updateCustomer(customer.name, changes), message);
  };

  const toggleDisabled = async () => {
    if (!customer) return;
    setToggling(true);
    try {
      await save({ disabled: !customer.disabled }, customer.disabled ? "Client réactivé" : "Client désactivé");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setToggling(false);
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
  if (isLoading || !customer) {
    return (
      <div className="grid min-h-80 place-items-center">
        <LoaderCircle className="size-7 animate-spin text-brand-600" />
      </div>
    );
  }

  const balance = customer.balance.reduce((sum, row) => sum + row.amount, 0);
  const { latitude, longitude } = customer.gps;

  return (
    <>
      <PageHeader
        eyebrow="Client"
        title={customer.customer_name}
        description={[customer.name, customer.customer_group, [customer.commune_name, customer.wilaya].filter(Boolean).join(", ")]
          .filter(Boolean)
          .join(" · ")}
        meta={
          <div className="flex flex-wrap gap-2">
            {customer.disabled ? (
              <StatusBadge tone="neutral">Désactivé</StatusBadge>
            ) : (
              <StatusBadge tone={statusTone(customer.status)}>{customer.status || "Sans statut"}</StatusBadge>
            )}
            {customer.is_frozen ? (
              <StatusBadge tone="danger">
                <Snowflake className="size-3" /> Gelé
              </StatusBadge>
            ) : null}
            {customer.key_account ? <StatusBadge tone="info">Grand compte</StatusBadge> : null}
            {latitude == null ? <StatusBadge tone="warning">Sans GPS</StatusBadge> : null}
            <StatusBadge tone={balance > 0 ? "warning" : "neutral"} dot={false}>
              Solde {formatMoney(balance)}
            </StatusBadge>
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {customer.phone ? (
              <Button variant="outline" nativeButton={false} render={<a href={`tel:${customer.phone}`} />}>
                <Phone /> Appeler
              </Button>
            ) : null}
            {latitude != null && longitude != null ? (
              <Button variant="outline" nativeButton={false} render={<a href={mapsUrl(latitude, longitude)} target="_blank" rel="noreferrer" />}>
                <MapPin /> Itinéraire
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => void toggleDisabled()} disabled={toggling}>
              {toggling ? <LoaderCircle className="animate-spin" /> : customer.disabled ? <RotateCcw /> : <Ban />}
              {customer.disabled ? "Réactiver" : "Désactiver"}
            </Button>
            <Button
              disabled={customer.disabled}
              onClick={() => navigate("/commandes/nouvelle", { state: { customer: toCustomerSummary(customer) } })}
            >
              <ShoppingCart /> Nouvelle commande
            </Button>
          </div>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams(value === "general" ? {} : { tab: String(value) }, { replace: true })}
        aria-label="Sections de la fiche client"
      >
        <TabsList variant="line" className="max-w-full overflow-x-auto">
          <TabsTrigger value="general">Général</TabsTrigger>
          <TabsTrigger value="juridique">Juridique</TabsTrigger>
          <TabsTrigger value="localisation">Localisation & adresses</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({customer.contacts.length})</TabsTrigger>
          <TabsTrigger value="commercial">Conditions</TabsTrigger>
          <TabsTrigger value="activite">Activité & encours</TabsTrigger>
          <TabsTrigger value="portail">Portail</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="pt-5">
          <CustomerGeneralTab key={customer.modified} customer={customer} options={options} onSave={save} />
        </TabsContent>
        <TabsContent value="juridique" className="pt-5">
          <CustomerLegalTab
            key={customer.modified}
            customer={customer}
            onSave={save}
            onUpload={async (kind, file) => {
              await refresh(await api.uploadFile(customer.name, kind, file), "Document enregistré");
            }}
            onRemove={async (kind) => {
              await refresh(await api.removeFile(customer.name, kind), "Document retiré");
            }}
          />
        </TabsContent>
        <TabsContent value="localisation" className="pt-5">
          <CustomerLocationTab
            key={customer.modified}
            customer={customer}
            options={options}
            onSave={save}
            onSaveAddress={async (payload) => {
              await refresh(await api.saveAddress(payload), "Adresse enregistrée");
            }}
            onDeleteAddress={async (address) => {
              await refresh(await api.deleteAddress(customer.name, address), "Adresse supprimée");
            }}
          />
        </TabsContent>
        <TabsContent value="contacts" className="pt-5">
          <CustomerContactsTab
            customer={customer}
            onSaveContact={async (payload) => {
              await refresh(await api.saveContact(payload), "Contact enregistré");
            }}
            onDeleteContact={async (contact) => {
              await refresh(await api.deleteContact(customer.name, contact), "Contact supprimé");
            }}
          />
        </TabsContent>
        <TabsContent value="commercial" className="pt-5">
          <CustomerCommercialTab key={customer.modified} customer={customer} options={options} onSave={save} />
        </TabsContent>
        <TabsContent value="activite" className="pt-5">
          <CustomerActivityTab customer={customer.name} />
        </TabsContent>
        <TabsContent value="portail" className="pt-5">
          <CustomerPortalTab
            customer={customer}
            onCreate={async (payload) => {
              const result = await api.createPortalUser(payload);
              void mutate();
              return result;
            }}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
