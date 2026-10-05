import { useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { CommitInput } from "@/components/CommitInput";
import { parseDecimal } from "@/shared/format/parseDecimal";
import { FormSelect } from "@/components/FilterSelect";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaymentScheduleEditor } from "@/features/orders/PaymentScheduleEditor";
import type { OrderDraft } from "@/features/orders/orderDraft";
import { cn } from "@/lib/utils";
import type { OrderDetail, OrderOptions } from "@/shared/api/orders";
import { formatMoney, formatQuantity, formatShortDate } from "@/shared/format";

function TotalRow({ label, value, strong, muted }: { label: ReactNode; value: number; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-2", strong ? "text-[16px] font-semibold" : "text-[13px]", muted && "text-muted-foreground")}>
      <dt>{label}</dt>
      <dd className="num">{formatMoney(value, { precise: true })}</dd>
    </div>
  );
}

function ReadOnlyField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="truncate text-[13px] font-medium">{children}</dd>
    </div>
  );
}

/** Informations de base de la commande, sur une rangée au-dessus des articles. */
export function OrderHeaderFields({
  draft,
  options,
  preview,
  readOnly,
  editableDeliveryDate,
  onChange,
}: {
  draft: OrderDraft;
  options?: OrderOptions;
  preview?: OrderDetail | null;
  readOnly?: boolean;
  /** Commande validée en modification : seule la date de livraison reste modifiable. */
  editableDeliveryDate?: boolean;
  onChange: (patch: Partial<OrderDraft>) => void;
}) {
  const customerList = draft.customer?.default_price_list || options?.default_price_list;

  if (readOnly) {
    return (
      <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-card px-4 py-3 sm:grid-cols-4" aria-label="Informations de la commande">
        <ReadOnlyField label="Type">{draft.orderType}</ReadOnlyField>
        <ReadOnlyField label="Livraison">
          {editableDeliveryDate ? (
            <Input
              type="date"
              aria-label="Date de livraison"
              className="h-8"
              value={draft.deliveryDate}
              onChange={(event) => onChange({ deliveryDate: event.target.value })}
            />
          ) : (
            formatShortDate(draft.deliveryDate)
          )}
        </ReadOnlyField>
        <ReadOnlyField label="Liste de prix">{preview?.price_list || "—"}</ReadOnlyField>
        <ReadOnlyField label="Entrepôt">{draft.warehouse || "—"}</ReadOnlyField>
      </dl>
    );
  }

  return (
    <div
      className="grid grid-cols-2 gap-3 rounded-xl border bg-card px-4 py-3 md:grid-cols-[120px_160px_minmax(0,1fr)_minmax(0,1fr)]"
      aria-label="Informations de la commande"
    >
      <Field>
        <FieldLabel>Type</FieldLabel>
        <FormSelect
          aria-label="Type de commande"
          value={draft.orderType}
          onChange={(orderType) => onChange({ orderType })}
          options={(options?.order_types || ["BL", "Facture"]).map((value) => ({ value, label: value }))}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="order-delivery">Livraison</FieldLabel>
        <Input id="order-delivery" type="date" value={draft.deliveryDate} onChange={(event) => onChange({ deliveryDate: event.target.value })} />
      </Field>
      <Field>
        <FieldLabel>Liste de prix</FieldLabel>
        <FormSelect
          aria-label="Liste de prix"
          value={draft.priceList}
          onChange={(priceList) => onChange({ priceList })}
          options={[
            { value: "", label: customerList ? `Liste du client (${customerList})` : "Liste du client" },
            ...(options?.price_lists || []).map((value) => ({ value, label: value })),
          ]}
        />
      </Field>
      <Field>
        <FieldLabel>Entrepôt</FieldLabel>
        <FormSelect
          aria-label="Entrepôt"
          value={draft.warehouse}
          onChange={(warehouse) => onChange({ warehouse })}
          options={(options?.warehouses || []).map((value) => ({ value, label: value }))}
        />
      </Field>
    </div>
  );
}

/** Ventilation de la TVA par taux, d'après la fiche de chaque article (exonéré compris). */
function VatBreakdown({ preview }: { preview?: OrderDetail | null }) {
  const totals = preview?.totals;
  if (!totals) {
    return <p className="text-[12.5px] text-muted-foreground">La ventilation apparaît dès que la commande est calculée.</p>;
  }
  const taxes = preview?.taxes ?? [];
  const taxedBase = taxes.reduce((sum, tax) => sum + tax.base, 0);
  const exemptBase = Math.round((totals.net_total - taxedBase) * 100) / 100;
  const rows = [
    ...taxes.map((tax) => ({ key: tax.description, label: tax.description, rate: tax.rate, base: tax.base, amount: tax.amount })),
    ...(exemptBase > 0.005 ? [{ key: "exonere", label: "Exonéré", rate: 0, base: exemptBase, amount: 0 }] : []),
  ];
  const missing = (preview?.lines ?? []).filter((line) => line.tax_missing);

  return (
    <div className="flex flex-col gap-2">
      <table className="w-full text-[13px]" aria-label="Ventilation de la TVA">
        <thead>
          <tr className="border-b t-micro text-muted-foreground">
            <th className="py-1.5 text-left font-semibold">Taux</th>
            <th className="py-1.5 text-right font-semibold">Base HT</th>
            <th className="py-1.5 text-right font-semibold">TVA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b last:border-b-0">
              <td className="py-1.5">{row.rate ? `${formatQuantity(row.rate)} %` : row.label}</td>
              <td className="num py-1.5 text-right">{formatMoney(row.base, { precise: true })}</td>
              <td className={cn("num py-1.5 text-right", !row.amount && "text-muted-foreground")}>{formatMoney(row.amount, { precise: true })}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-semibold">
            <td className="py-1.5">Total</td>
            <td className="num py-1.5 text-right">{formatMoney(totals.net_total, { precise: true })}</td>
            <td className="num py-1.5 text-right">{formatMoney(totals.taxes, { precise: true })}</td>
          </tr>
        </tfoot>
      </table>
      {missing.length ? (
        <p className="text-[12px] text-amber-700">
          Sans taux de TVA sur la fiche article (comptés exonérés) : {missing.map((line) => line.item_name).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

/** Sous le tableau des articles : échéances et TVA à gauche, remise globale et totaux à droite. */
export function OrderFooter({
  draft,
  options,
  preview,
  previewing,
  readOnly,
  onChange,
  issues,
}: {
  draft: OrderDraft;
  options?: OrderOptions;
  preview?: OrderDetail | null;
  previewing?: boolean;
  readOnly?: boolean;
  onChange: (patch: Partial<OrderDraft>) => void;
  /** Erreurs et alertes de la saisie, affichées au-dessus des totaux. */
  issues?: ReactNode;
}) {
  const [tab, setTab] = useState("echeances");
  const totals = preview?.totals;
  const schedule = preview?.payment_schedule ?? [];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-xl border bg-card px-4 pt-2 pb-4" aria-label="Échéances et taxes">
        <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
          <TabsList variant="line">
            <TabsTrigger value="echeances">
              Échéances
              {schedule.length > 1 ? <span className="num text-[11px] text-muted-foreground">{schedule.length}</span> : null}
            </TabsTrigger>
            <TabsTrigger value="taxes">Taxes</TabsTrigger>
          </TabsList>
          <TabsContent value="echeances" className="pt-3">
            <PaymentScheduleEditor draft={draft} options={options} preview={preview} readOnly={readOnly} onChange={onChange} />
          </TabsContent>
          <TabsContent value="taxes" className="pt-3">
            <VatBreakdown preview={preview} />
          </TabsContent>
        </Tabs>
      </section>

      <aside className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm" aria-label="Récapitulatif de la commande">
        {readOnly ? null : (
          <Field>
            <FieldLabel>Remise globale</FieldLabel>
            <div className="flex gap-1.5">
              <CommitInput
                aria-label="Remise globale"
                inputMode="decimal"
                placeholder="0"
                className="num"
                value={draft.discountValue ? String(draft.discountValue) : ""}
                onCommit={(value) => {
                  const parsed = value.trim() ? parseDecimal(value) : 0;
                  if (parsed == null || parsed < 0) return;
                  if (draft.discountMode === "percent" && parsed > 100) return;
                  onChange({ discountValue: parsed });
                }}
              />
              <div className="flex shrink-0 overflow-hidden rounded-md border" role="group" aria-label="Unité de remise">
                {(["percent", "amount"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={draft.discountMode === mode}
                    onClick={() => onChange({ discountMode: mode, discountValue: 0 })}
                    className={cn(
                      "px-3 text-[12.5px] font-medium",
                      draft.discountMode === mode ? "bg-foreground text-background" : "bg-background hover:bg-muted",
                    )}
                  >
                    {mode === "percent" ? "%" : "DZD"}
                  </button>
                ))}
              </div>
            </div>
          </Field>
        )}

        {issues ? <div className="flex flex-col gap-2">{issues}</div> : null}

        <dl className={cn("flex flex-col gap-1.5", !readOnly && "border-t pt-3")} aria-label="Totaux">
          <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
            <span>{totals ? `${formatQuantity(totals.qty)} unités` : "Totaux"}</span>
            {previewing ? (
              <span className="inline-flex items-center gap-1">
                <LoaderCircle className="size-3.5 animate-spin" /> Calcul…
              </span>
            ) : null}
          </div>
          {totals ? (
            <>
              <TotalRow label="Total brut HT" value={totals.total} />
              {totals.discount_amount ? <TotalRow label="Remise globale" value={-totals.discount_amount} muted /> : null}
              <TotalRow label="Net HT" value={totals.net_total} />
              <TotalRow label="TVA" value={totals.taxes} muted />
              {totals.rounding_adjustment ? <TotalRow label="Arrondi" value={totals.rounding_adjustment} muted /> : null}
              <TotalRow label="Total TTC" value={totals.rounded_total} strong />
            </>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">Choisissez un client et ajoutez des articles pour calculer la commande.</p>
          )}
        </dl>
      </aside>
    </div>
  );
}
