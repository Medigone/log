import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, BadgePercent, Plus, Trash2, UserRound } from "lucide-react";
import { CommitInput } from "@/components/CommitInput";
import { FormSelect } from "@/components/FilterSelect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { CustomerSearchField } from "@/features/catalog/CatalogPickers";
import { marginOf, ruleSummary } from "@/features/catalog/catalogShared";
import { RULE_STATE_LABELS, RULE_TYPE_LABELS, useCatalogMutations, useItemPrices, type CatalogItem, type CatalogOptions, type ItemPrice } from "@/shared/api/catalog";
import { apiErrorMessage } from "@/shared/api/distribution";
import { formatMoney, formatShortDate } from "@/shared/format";
import { parseDecimal } from "@/shared/format/parseDecimal";

function validity(price: Pick<ItemPrice, "valid_from" | "valid_upto">) {
  if (!price.valid_from && !price.valid_upto) return "Permanent";
  if (!price.valid_upto) return `Depuis le ${formatShortDate(price.valid_from || undefined)}`;
  return `${formatShortDate(price.valid_from || undefined)} → ${formatShortDate(price.valid_upto)}`;
}

interface GenericRow {
  key: string;
  priceList: string;
  selling: boolean;
  price: ItemPrice | null;
}

export function ItemPricesTab({
  item,
  options,
  onItemChanged,
}: {
  item: CatalogItem;
  options?: CatalogOptions;
  onItemChanged: () => void;
}) {
  const { data, error, isLoading, mutate } = useItemPrices(item.item_code);
  const api = useCatalogMutations();
  const [adding, setAdding] = useState(false);
  const prices = data?.message?.prices ?? [];
  const rules = data?.message?.pricing_rules ?? [];
  const ppa = data?.message?.ppa ?? item.ppa;

  const generic = prices.filter((price) => !price.customer);
  const customerPrices = prices.filter((price) => price.customer);
  const pricedLists = new Set(generic.map((price) => price.price_list));
  const genericRows: GenericRow[] = [
    ...generic.map((price) => ({ key: price.name, priceList: price.price_list, selling: price.selling, price })),
    ...(options?.price_lists || [])
      .filter((list) => list.enabled && !pricedLists.has(list.name))
      .map((list) => ({ key: `new-${list.name}`, priceList: list.name, selling: list.selling, price: null })),
  ].sort((a, b) => Number(b.selling) - Number(a.selling) || a.priceList.localeCompare(b.priceList, "fr"));

  const sellingRate = generic.find((price) => price.price_list === item.selling_price_list)?.rate ?? null;
  const buyingRate = generic.find((price) => price.price_list === item.buying_price_list)?.rate ?? null;
  const margin = marginOf(sellingRate, buyingRate);

  const refresh = async () => {
    await mutate();
    onItemChanged();
  };

  const commitGeneric = async (row: GenericRow, raw: string) => {
    const rate = parseDecimal(raw);
    try {
      if (rate === null) {
        if (!row.price) return;
        await api.deleteItemPrice(row.price.name);
        toast.success(`Prix retiré de ${row.priceList}`);
      } else {
        await api.saveItemPrice({
          name: row.price?.name,
          item_code: item.item_code,
          price_list: row.priceList,
          rate,
          valid_from: row.price?.valid_from,
          valid_upto: row.price?.valid_upto,
        });
        toast.success(`Prix enregistré dans ${row.priceList}`);
      }
      await refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const commitPpa = async (raw: string) => {
    const value = parseDecimal(raw);
    if (value === null && raw.trim()) return;
    try {
      await api.saveItemPpa(item.item_code, value ?? 0);
      toast.success("PPA enregistré");
      await refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const genericColumns: Array<DataTableColumn<GenericRow>> = [
    {
      id: "list",
      header: "Liste de prix",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{row.priceList}</span>
          <StatusBadge tone={row.selling ? "info" : "neutral"} size="sm" dot={false}>
            {row.selling ? "Vente" : "Achat"}
          </StatusBadge>
        </div>
      ),
    },
    {
      id: "validity",
      header: "Validité",
      width: "200px",
      hideBelow: "md",
      cell: (row) => <span className="text-muted-foreground">{row.price ? validity(row.price) : "—"}</span>,
    },
    {
      id: "rate",
      header: `Prix (${item.stock_uom})`,
      width: "160px",
      align: "right",
      cell: (row) => (
        <CommitInput
          inputMode="decimal"
          className="num h-8 text-right"
          aria-label={`Prix ${row.priceList}`}
          placeholder="Aucun"
          value={row.price ? String(row.price.rate) : ""}
          onCommit={(value) => void commitGeneric(row, value)}
        />
      ),
    },
  ];

  const customerColumns: Array<DataTableColumn<ItemPrice>> = [
    {
      id: "customer",
      header: "Client",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.customer_name || row.customer}</p>
          <p className="truncate t-meta text-subtle">{row.price_list}</p>
        </div>
      ),
    },
    { id: "validity", header: "Validité", width: "200px", hideBelow: "md", cell: (row) => <span className="text-muted-foreground">{validity(row)}</span> },
    {
      id: "rate",
      header: "Prix",
      width: "140px",
      align: "right",
      cell: (row) => (
        <CommitInput
          inputMode="decimal"
          className="num h-8 text-right"
          aria-label={`Prix client ${row.customer_name || row.customer}`}
          value={String(row.rate)}
          onCommit={(value) => {
            const rate = parseDecimal(value);
            if (rate === null) return;
            void api
              .saveItemPrice({ ...row, rate })
              .then(refresh)
              .then(() => toast.success("Prix client enregistré"))
              .catch((err) => toast.error(apiErrorMessage(err)));
          }}
        />
      ),
    },
    {
      id: "actions",
      header: "",
      width: "56px",
      align: "right",
      cell: (row) => (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Supprimer le prix de ${row.customer_name || row.customer}`}
          onClick={() =>
            void api
              .deleteItemPrice(row.name)
              .then(refresh)
              .then(() => toast.success("Prix client supprimé"))
              .catch((err) => toast.error(apiErrorMessage(err)))
          }
        >
          <Trash2 />
        </Button>
      ),
    },
  ];

  if (error) {
    return (
      <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <AlertTriangle className="size-4 shrink-0" />
        {apiErrorMessage(error)}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <section aria-label="Résumé des prix" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label={`Achat · ${item.buying_price_list || "—"}`} value={buyingRate == null ? "—" : formatMoney(buyingRate)} />
        <KpiTile
          label={`Vente · ${item.selling_price_list || "—"}`}
          tone={sellingRate == null ? "warning" : "neutral"}
          value={sellingRate == null ? "Sans prix" : formatMoney(sellingRate)}
        />
        <KpiTile
          label="Marge sur achat"
          tone={margin && margin.amount < 0 ? "danger" : margin ? "success" : "neutral"}
          value={margin ? `${margin.rate.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—"}
          hint={margin ? formatMoney(margin.amount) : undefined}
        />
        <div className="rounded-xl border bg-card p-4 shadow-card">
          <label htmlFor="item-ppa" className="t-meta text-muted-foreground">
            PPA (prix public)
          </label>
          <CommitInput id="item-ppa" inputMode="decimal" className="num mt-1.5 text-right" value={ppa ? String(ppa) : ""} placeholder="—" onCommit={(value) => void commitPpa(value)} />
          {sellingRate != null && ppa > 0 && sellingRate > ppa ? <p className="mt-1 t-meta text-amber-700">Prix de vente au-dessus du PPA</p> : null}
        </div>
      </section>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Prix par liste</CardTitle>
          <CardDescription>Prix pour l’unité de stock ({item.stock_uom}). Videz un prix pour le retirer de la liste.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <DataTable label="Prix par liste" columns={genericColumns} rows={genericRows} rowKey={(row) => row.key} isLoading={isLoading && !prices.length} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Prix spécifiques client</CardTitle>
              <CardDescription>Remplacent le prix de la liste pour ce client, en saisie de commande et sur le Store.</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus /> Prix client
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <DataTable
            label="Prix spécifiques client"
            columns={customerColumns}
            rows={customerPrices}
            rowKey={(row) => row.name}
            empty={<EmptyState icon={UserRound} title="Aucun prix client" description="Tous les clients paient le prix de leur liste." />}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Promotions en cours ou à venir</CardTitle>
              <CardDescription>Règles de prix qui touchent cet article, son groupe ou sa marque.</CardDescription>
            </div>
            <Button size="sm" variant="outline" nativeButton={false} render={<Link to={`/articles/promotions?article=${encodeURIComponent(item.item_code)}`} />}>
              <BadgePercent /> Gérer
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {rules.length === 0 ? (
            <p className="t-body text-muted-foreground">Aucune promotion.</p>
          ) : (
            <ul className="divide-y">
              {rules.map((rule) => (
                <li key={rule.name} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{rule.title}</p>
                    <p className="t-meta text-muted-foreground">
                      {RULE_TYPE_LABELS[rule.rate_or_discount]}
                      {rule.min_qty > 0 ? ` · dès ${rule.min_qty}` : ""}
                      {rule.party ? ` · ${rule.party}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="num font-semibold">{ruleSummary(rule)}</span>
                    <StatusBadge tone={rule.state === "active" ? "success" : "info"} size="sm">
                      {RULE_STATE_LABELS[rule.state]}
                    </StatusBadge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <CustomerPriceDialog
        open={adding}
        onOpenChange={setAdding}
        options={options}
        defaultPriceList={item.selling_price_list}
        searchCustomers={api.searchCustomers}
        onSubmit={async (payload) => {
          await api.saveItemPrice({ item_code: item.item_code, ...payload });
          setAdding(false);
          toast.success("Prix client ajouté");
          await refresh();
        }}
      />
    </div>
  );
}

function CustomerPriceDialog({
  open,
  onOpenChange,
  options,
  defaultPriceList,
  searchCustomers,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options?: CatalogOptions;
  defaultPriceList: string | null;
  searchCustomers: Parameters<typeof CustomerSearchField>[0]["search"];
  onSubmit: (payload: { customer: string; price_list: string; rate: number; valid_from: string | null; valid_upto: string | null }) => Promise<void>;
}) {
  const [customer, setCustomer] = useState<{ name: string; label: string } | null>(null);
  const [priceList, setPriceList] = useState(defaultPriceList || "");
  const [rate, setRate] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUpto, setValidUpto] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCustomer(null);
      setPriceList(defaultPriceList || "");
      setRate("");
      setValidFrom("");
      setValidUpto("");
      setError("");
    }
  }

  const sellingLists = (options?.price_lists || []).filter((list) => list.selling && list.enabled);
  const parsedRate = parseDecimal(rate);
  const canSave = Boolean(customer && priceList && parsedRate !== null && parsedRate >= 0) && !pending;

  const submit = async () => {
    if (!canSave || !customer || parsedRate === null) return;
    setPending(true);
    setError("");
    try {
      await onSubmit({ customer: customer.name, price_list: priceList, rate: parsedRate, valid_from: validFrom || null, valid_upto: validUpto || null });
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
            <DialogTitle>Prix spécifique client</DialogTitle>
            <DialogDescription>Ce prix remplace celui de la liste pour ce client uniquement.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGroup className="gap-3">
              {error ? (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertTitle>Prix non enregistré</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Field>
                <FieldLabel>Client</FieldLabel>
                <CustomerSearchField label="Client" value={customer} onChange={setCustomer} search={searchCustomers} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Liste de prix</FieldLabel>
                  <FormSelect
                    aria-label="Liste de prix"
                    value={priceList}
                    onChange={setPriceList}
                    options={sellingLists.map((list) => ({ value: list.name, label: list.name }))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="customer-price-rate">Prix</FieldLabel>
                  <Input id="customer-price-rate" inputMode="decimal" value={rate} placeholder="DZD" onChange={(event) => setRate(event.target.value)} />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="customer-price-from">Valable du</FieldLabel>
                  <Input id="customer-price-from" type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="customer-price-upto">Au (facultatif)</FieldLabel>
                  <Input id="customer-price-upto" type="date" value={validUpto} onChange={(event) => setValidUpto(event.target.value)} />
                </Field>
              </div>
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
