import { AlertTriangle, ImageOff, Lock, Minus, Plus, Trash2 } from "lucide-react";
import { CommitInput } from "@/components/CommitInput";
import { parseDecimal } from "@/shared/format/parseDecimal";
import { cn } from "@/lib/utils";
import { submittedLineRules, type OrderLine } from "@/features/orders/orderDraft";
import type { OrderLineData } from "@/shared/api/orders";
import { formatMoney, formatQuantity } from "@/shared/format";

const GRID = "lg:grid-cols-[minmax(0,1fr)_140px_110px_80px_110px_120px_36px]";

export function OrderLinesTable({
  lines,
  preview,
  lastKey,
  readOnly,
  editableRate,
  onChange,
  onRemove,
}: {
  lines: OrderLine[];
  /** Lignes calculées par ERPNext, dans le même ordre que les lignes à quantité positive. */
  preview?: OrderLineData[];
  lastKey: string | null;
  readOnly?: boolean;
  editableRate?: boolean;
  onChange: (key: string, patch: Partial<OrderLine>) => void;
  onRemove: (key: string) => void;
}) {
  if (!lines.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card px-4 py-10 text-center">
        <p className="text-[13px] font-semibold">Aucun article</p>
        <p className="max-w-sm text-[12.5px] text-muted-foreground">
          Scannez un code-barres, cherchez un article par son nom ou reprenez un article habituel du client.
        </p>
      </div>
    );
  }

  const computed = new Map<string, OrderLineData>();
  let cursor = 0;
  for (const line of lines) {
    if (line.qty <= 0) continue;
    const row = preview?.[cursor];
    if (row && row.item_code === line.itemCode) computed.set(line.key, row);
    cursor += 1;
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label="Articles commandés">
      <div className={cn("hidden gap-3 border-b bg-muted/40 px-3 py-2 t-micro text-muted-foreground lg:grid", GRID)}>
        <span>Article</span>
        <span>Quantité</span>
        <span className="text-right">Prix</span>
        <span>Remise %</span>
        <span className="text-right">Montant</span>
        <span>Réservé</span>
        <span />
      </div>
      {lines.map((line) => {
        const row = computed.get(line.key);
        const listPrice = row?.price_list_rate ?? line.listPrice ?? 0;
        const discount = line.discount ?? row?.discount_percentage ?? 0;
        const net = row?.rate ?? listPrice * (1 - discount / 100);
        const amount = row?.amount ?? net * line.qty;
        const short = line.isStockItem && line.qty > line.available;
        const rules = submittedLineRules(line);
        const reserved = line.reservedQty ?? row?.reserved_qty ?? null;
        const remaining = Math.max(0, line.qty - line.delivered);
        return (
          <div
            key={line.key}
            data-testid={`order-line-${line.itemCode}`}
            className={cn(
              "grid grid-cols-2 items-center gap-x-3 gap-y-2 border-b px-3 py-2.5 last:border-b-0",
              GRID,
              line.key === lastKey && "bg-emerald-50/50",
            )}
          >
            <div className="col-span-2 flex min-w-0 items-center gap-2.5 lg:col-span-1">
              {line.image ? (
                <img src={line.image} alt="" className="size-9 shrink-0 rounded-md border object-cover" loading="lazy" />
              ) : (
                <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground">
                  <ImageOff className="size-4" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium">{line.itemName}</p>
                <p className={cn("truncate t-meta", short ? "text-amber-700" : "text-muted-foreground")}>
                  {line.itemCode} · {line.uom}
                  {line.isStockItem ? ` · ${formatQuantity(Math.max(0, line.available))} disponible` : ""}
                  {short ? <AlertTriangle className="ml-1 inline size-3" /> : null}
                </p>
                {line.delivered > 0 ? (
                  <p className="t-meta text-emerald-700" data-testid={`order-line-delivery-${line.itemCode}`}>
                    Livré {formatQuantity(line.delivered)} · Reste {formatQuantity(remaining)}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {readOnly ? (
                <span className="num text-[13.5px] font-medium">{formatQuantity(line.qty)}</span>
              ) : (
                <>
                  <button
                    type="button"
                    aria-label={`Retirer une unité ${line.itemCode}`}
                    disabled={line.qty - 1 < rules.minQty}
                    onClick={() => onChange(line.key, { qty: Math.max(rules.minQty, line.qty - 1, 0) })}
                    className="grid size-8 shrink-0 place-items-center rounded-md border text-muted-foreground hover:bg-muted disabled:opacity-40"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <CommitInput
                    aria-label={`Quantité ${line.itemCode}`}
                    inputMode="decimal"
                    className="num h-8 w-16 text-center"
                    value={String(line.qty)}
                    onCommit={(value) => {
                      const qty = parseDecimal(value);
                      if (qty != null && qty >= rules.minQty) onChange(line.key, { qty });
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Ajouter une unité ${line.itemCode}`}
                    onClick={() => onChange(line.key, { qty: line.qty + 1 })}
                    className="grid size-8 shrink-0 place-items-center rounded-md border text-muted-foreground hover:bg-muted"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </>
              )}
            </div>

            <div className="text-right">
              {editableRate && !readOnly ? (
                <CommitInput
                  aria-label={`Prix ${line.itemCode}`}
                  inputMode="decimal"
                  className="num h-8 text-right"
                  value={String(line.rate ?? listPrice)}
                  onCommit={(value) => {
                    const rate = parseDecimal(value);
                    if (rate != null && rate >= 0) onChange(line.key, { rate, discount: null });
                  }}
                />
              ) : (
                <span className={cn("num block text-[13px]", !listPrice && "text-amber-700")}>
                  {listPrice ? formatMoney(listPrice, { precise: true }) : "Sans prix"}
                </span>
              )}
              {discount ? <span className="num block t-meta text-muted-foreground">net {formatMoney(net, { precise: true })}</span> : null}
            </div>

            <div>
              {readOnly ? (
                <span className="num text-[13px]">{discount ? `${formatQuantity(discount)} %` : "—"}</span>
              ) : (
                <CommitInput
                  aria-label={`Remise ${line.itemCode}`}
                  inputMode="decimal"
                  placeholder="0"
                  className="num h-8"
                  value={line.discount != null ? String(line.discount) : discount ? String(discount) : ""}
                  onCommit={(value) => {
                    const parsed = value.trim() ? parseDecimal(value) : 0;
                    if (parsed != null && parsed >= 0 && parsed <= 100) onChange(line.key, { discount: parsed, rate: null });
                  }}
                />
              )}
            </div>

            <div className="num text-right text-[13px] font-semibold">{formatMoney(amount, { precise: true })}</div>

            <div className="flex items-center gap-1">
              {!line.isStockItem ? (
                <span className="text-[12px] text-muted-foreground">—</span>
              ) : readOnly ? (
                <span className="num inline-flex items-center gap-1 text-[13px]">
                  <Lock className="size-3 text-muted-foreground" />
                  {formatQuantity(reserved ?? 0)}
                </span>
              ) : (
                <>
                  <CommitInput
                    aria-label={`Réservé ${line.itemCode}`}
                    inputMode="decimal"
                    placeholder={formatQuantity(line.qty)}
                    className={cn("num h-8 w-16", line.reservedQty == null && "text-muted-foreground")}
                    value={reserved != null ? String(reserved) : ""}
                    onCommit={(value) => {
                      if (!value.trim()) {
                        onChange(line.key, { reservedQty: null });
                        return;
                      }
                      const parsed = parseDecimal(value);
                      if (parsed != null && parsed >= 0 && parsed <= line.qty) onChange(line.key, { reservedQty: parsed });
                    }}
                  />
                  {line.reservedQty != null && line.reservedQty < line.qty ? (
                    <button
                      type="button"
                      title="Réserver toute la quantité"
                      onClick={() => onChange(line.key, { reservedQty: null })}
                      className="text-[11.5px] font-medium text-brand-700 hover:underline"
                    >
                      Tout
                    </button>
                  ) : null}
                </>
              )}
            </div>

            <div className="flex justify-end">
              {readOnly ? null : (
                <button
                  type="button"
                  title={rules.removable ? "Retirer la ligne" : "Article déjà livré : la ligne ne peut pas être retirée"}
                  aria-label={`Retirer la ligne ${line.itemCode}`}
                  disabled={!rules.removable}
                  onClick={() => onRemove(line.key)}
                  className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
