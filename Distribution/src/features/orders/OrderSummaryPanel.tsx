import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { CommitInput } from "@/components/CommitInput";
import { parseDecimal } from "@/shared/format/parseDecimal";
import { FormSelect } from "@/components/FilterSelect";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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

export function OrderSummaryPanel({
  draft,
  options,
  preview,
  previewing,
  readOnly,
  editableDeliveryDate,
  onChange,
  actions,
}: {
  draft: OrderDraft;
  options?: OrderOptions;
  preview?: OrderDetail | null;
  previewing?: boolean;
  readOnly?: boolean;
  /** Commande validée en modification : seule la date de livraison reste modifiable dans l'en-tête. */
  editableDeliveryDate?: boolean;
  onChange: (patch: Partial<OrderDraft>) => void;
  actions?: ReactNode;
}) {
  const customerList = draft.customer?.default_price_list || options?.default_price_list;
  const totals = preview?.totals;

  return (
    <aside className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm lg:sticky lg:top-4" aria-label="Récapitulatif de la commande">
      {readOnly ? (
        <dl className="grid grid-cols-2 gap-2 text-[12.5px]">
          <dt className="text-muted-foreground">Type</dt>
          <dd>{draft.orderType}</dd>
          <dt className="text-muted-foreground">Livraison</dt>
          <dd>
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
          </dd>
          <dt className="text-muted-foreground">Liste de prix</dt>
          <dd className="truncate">{preview?.price_list || "—"}</dd>
          <dt className="text-muted-foreground">Taxes</dt>
          <dd className="truncate">{draft.taxTemplate || "Aucune"}</dd>
        </dl>
      ) : (
        <div className="grid grid-cols-2 gap-3">
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
            <Input
              id="order-delivery"
              type="date"
              value={draft.deliveryDate}
              onChange={(event) => onChange({ deliveryDate: event.target.value })}
            />
          </Field>
          <Field className="col-span-2">
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
          <Field className="col-span-2">
            <FieldLabel>Entrepôt</FieldLabel>
            <FormSelect
              aria-label="Entrepôt"
              value={draft.warehouse}
              onChange={(warehouse) => onChange({ warehouse })}
              options={(options?.warehouses || []).map((value) => ({ value, label: value }))}
            />
          </Field>
          <Field className="col-span-2">
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
          <Field className="col-span-2">
            <FieldLabel>Taxes</FieldLabel>
            <FormSelect
              aria-label="Taxes"
              value={draft.taxTemplate}
              onChange={(taxTemplate) => onChange({ taxTemplate })}
              options={[
                { value: "", label: "Aucune taxe" },
                ...(options?.tax_templates || []).map((tax) => ({ value: tax.name, label: tax.label })),
              ]}
            />
          </Field>
        </div>
      )}

      <dl className="flex flex-col gap-1.5 border-t pt-3" aria-label="Totaux">
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
            {(preview?.taxes || []).map((tax) => (
              <TotalRow key={tax.description} label={tax.description} value={tax.amount} muted />
            ))}
            {totals.rounding_adjustment ? <TotalRow label="Arrondi" value={totals.rounding_adjustment} muted /> : null}
            <TotalRow label="Total TTC" value={totals.rounded_total} strong />
          </>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">Choisissez un client et ajoutez des articles pour calculer la commande.</p>
        )}
      </dl>

      <div className="border-t pt-3">
        <PaymentScheduleEditor draft={draft} options={options} preview={preview} readOnly={readOnly} onChange={onChange} />
      </div>

      {actions ? <div className="flex flex-col gap-2 border-t pt-3">{actions}</div> : null}
    </aside>
  );
}
