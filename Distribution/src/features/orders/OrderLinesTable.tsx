import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ImageOff, Lock, LockOpen, Minus, Percent, Plus, Trash2, X } from "lucide-react";
import { CommitInput } from "@/components/CommitInput";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { parseDecimal } from "@/shared/format/parseDecimal";
import { cn } from "@/lib/utils";
import { changedListPrice, exceedsQuota, quotaLimit, submittedLineRules, type OrderLine } from "@/features/orders/orderDraft";
import type { OrderLineData } from "@/shared/api/orders";
import { formatMoney, formatQuantity } from "@/shared/format";

// Pleine largeur : toutes les informations d’une ligne tiennent sur une seule rangée.
// Le détail du stock (Stock · Rés. · Cmd) a ses propres colonnes sur très grand écran, sous la pastille sinon.
const GRID =
  "xl:grid-cols-[16px_minmax(180px,1fr)_140px_124px_92px_104px_76px_56px_104px_28px] " +
  "2xl:grid-cols-[16px_minmax(200px,1fr)_120px_56px_56px_56px_124px_92px_112px_80px_56px_112px_32px]";

type AvailabilityTone = "ok" | "short" | "out";

const AVAILABILITY_TONE: Record<AvailabilityTone, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  short: "border-amber-200 bg-amber-50 text-amber-800",
  out: "border-red-200 bg-red-50 text-red-700",
};

/** Statut lisible d’un coup d’œil : rupture, manque ou quantité disponible pour la ligne. */
function availabilityOf(line: OrderLine): { tone: AvailabilityTone; label: string } | null {
  if (!line.isStockItem) return null;
  const available = Math.max(0, line.available);
  if (available <= 0) return { tone: "out", label: "Rupture" };
  if (line.qty > available) return { tone: "short", label: `${formatQuantity(available)} dispo · manque ${formatQuantity(line.qty - available)}` };
  return { tone: "ok", label: `${formatQuantity(available)} dispo` };
}

type ReservationState = "complete" | "partielle" | "aucune";

const RESERVATION_LABEL: Record<ReservationState, { text: string; className: string }> = {
  complete: { text: "Réservé en totalité", className: "text-emerald-600" },
  partielle: { text: "Réservation partielle", className: "text-amber-700" },
  aucune: { text: "Non réservé", className: "text-red-600" },
};

function reservationState(reserved: number | null, qty: number): ReservationState {
  if (reserved == null || reserved >= qty) return "complete";
  return reserved > 0 ? "partielle" : "aucune";
}

function ConfirmRemoveDialog({
  lines,
  onCancel,
  onConfirm,
}: {
  lines: OrderLine[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const single = lines.length === 1;
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <p className="t-micro text-destructive">Confirmation requise</p>
          <DialogTitle>{single ? "Retirer la ligne" : `Retirer ${lines.length} lignes`}</DialogTitle>
          <DialogDescription>
            {single
              ? `« ${lines[0].itemName} » sera retiré de la commande.`
              : "Les articles suivants seront retirés de la commande."}
          </DialogDescription>
        </DialogHeader>
        {single ? null : (
          <DialogBody>
            <ul className="max-h-60 space-y-1 overflow-y-auto text-[13px]">
              {lines.map((line) => (
                <li key={line.key} className="flex justify-between gap-3">
                  <span className="truncate">{line.itemName}</span>
                  <span className="num shrink-0 text-muted-foreground">
                    {formatQuantity(line.qty)} {line.uom}
                  </span>
                </li>
              ))}
            </ul>
          </DialogBody>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={onConfirm} autoFocus>
            <Trash2 /> Retirer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkActionsBar({
  lines,
  onChangeMany,
  onRemove,
  onClear,
}: {
  lines: OrderLine[];
  onChangeMany: (keys: string[], patch: Partial<OrderLine>) => void;
  onRemove: (lines: OrderLine[]) => void;
  onClear: () => void;
}) {
  const [discount, setDiscount] = useState("");
  const stockKeys = lines.filter((line) => line.isStockItem).map((line) => line.key);
  const removable = lines.filter((line) => submittedLineRules(line).removable);
  const parsedDiscount = discount.trim() ? parseDecimal(discount) : null;
  const validDiscount = parsedDiscount != null && parsedDiscount >= 0 && parsedDiscount <= 100;

  return (
    <div
      role="toolbar"
      aria-label="Actions sur les lignes sélectionnées"
      className="flex flex-wrap items-center gap-2 border-b bg-brand-50/60 px-3 py-2"
    >
      <span className="text-[12.5px] font-semibold">
        {lines.length} ligne{lines.length > 1 ? "s" : ""} sélectionnée{lines.length > 1 ? "s" : ""}
      </span>
      <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
      <Button size="sm" variant="outline" disabled={!stockKeys.length} onClick={() => onChangeMany(stockKeys, { reservedQty: null })}>
        <Lock /> Réserver
      </Button>
      <Button size="sm" variant="outline" disabled={!stockKeys.length} onClick={() => onChangeMany(stockKeys, { reservedQty: 0 })}>
        <LockOpen /> Libérer
      </Button>
      <form
        className="flex items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (!validDiscount) return;
          onChangeMany(
            lines.map((line) => line.key),
            { discount: parsedDiscount, rate: null },
          );
          setDiscount("");
        }}
      >
        <Input
          aria-label="Remise pour la sélection"
          inputMode="decimal"
          placeholder="Remise %"
          value={discount}
          onChange={(event) => setDiscount(event.target.value)}
          className="num h-7 w-24"
        />
        <Button size="sm" variant="outline" type="submit" disabled={!validDiscount}>
          <Percent /> Appliquer
        </Button>
      </form>
      <Button
        size="sm"
        variant="outline"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={!removable.length}
        title={removable.length < lines.length ? "Les lignes déjà livrées ne peuvent pas être retirées" : undefined}
        onClick={() => onRemove(removable)}
      >
        <Trash2 /> Retirer{removable.length < lines.length ? ` (${removable.length})` : ""}
      </Button>
      <Button size="sm" variant="ghost" className="ml-auto" onClick={onClear}>
        <X /> Désélectionner
      </Button>
    </div>
  );
}

export function OrderLinesTable({
  lines,
  preview,
  lastKey,
  readOnly,
  editableRate,
  canOverrideQuota = false,
  onChange,
  onChangeMany,
  onRemove,
}: {
  lines: OrderLine[];
  /** Lignes calculées par ERPNext, dans le même ordre que les lignes à quantité positive. */
  preview?: OrderLineData[];
  lastKey: string | null;
  readOnly?: boolean;
  editableRate?: boolean;
  /** Le responsable peut dépasser le quota d’un article ; le commercial est plafonné. */
  canOverrideQuota?: boolean;
  onChange: (key: string, patch: Partial<OrderLine>) => void;
  onChangeMany: (keys: string[], patch: Partial<OrderLine>) => void;
  onRemove: (keys: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [pendingRemoval, setPendingRemoval] = useState<OrderLine[] | null>(null);

  // Une ligne retirée (ou une commande rechargée) sort de la sélection.
  useEffect(() => {
    setSelected((current) => {
      const keys = new Set(lines.map((line) => line.key));
      const next = new Set([...current].filter((key) => keys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [lines]);

  const selectedLines = useMemo(() => lines.filter((line) => selected.has(line.key)), [lines, selected]);

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

  const allSelected = selected.size === lines.length;
  const toggle = (key: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });

  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label="Articles commandés">
      {!readOnly && selectedLines.length ? (
        <BulkActionsBar
          lines={selectedLines}
          onChangeMany={onChangeMany}
          onRemove={setPendingRemoval}
          onClear={() => setSelected(new Set())}
        />
      ) : null}
      <div className={cn("sticky top-0 z-10 hidden items-center gap-3 border-b bg-muted/60 px-4 py-2 t-micro text-muted-foreground backdrop-blur xl:grid", GRID)}>
        {readOnly ? (
          <span />
        ) : (
          <Checkbox
            aria-label="Sélectionner toutes les lignes"
            checked={allSelected}
            indeterminate={selected.size > 0 && !allSelected}
            onCheckedChange={(checked) => setSelected(checked ? new Set(lines.map((line) => line.key)) : new Set())}
          />
        )}
        <span>Article</span>
        <span>Disponibilité</span>
        <span className="hidden text-right 2xl:block">Stock</span>
        <span className="hidden text-right 2xl:block">Rés.</span>
        <span className="hidden text-right 2xl:block">Cmd</span>
        <span>Quantité</span>
        <span>Réservé</span>
        <span className="text-right">Prix unit.</span>
        <span className="text-right">Remise</span>
        <span className="text-right">TVA</span>
        <span className="text-right">Montant HT</span>
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
        const maxQty = quotaLimit(line, canOverrideQuota);
        const overQuota = exceedsQuota(line);
        const newPrice = line.lockedListPrice != null ? changedListPrice(row) : null;
        const stock = row?.stock ?? line.stock;
        const isSelected = selected.has(line.key);
        const expectedReserve = reserved ?? (short ? Math.max(0, line.available) : line.qty);
        const reservation = RESERVATION_LABEL[reservationState(expectedReserve, line.qty)];
        const availability = availabilityOf(line);
        return (
          <div
            key={line.key}
            data-testid={`order-line-${line.itemCode}`}
            className={cn(
              "grid grid-cols-2 items-center gap-x-3 gap-y-2 border-b px-4 py-2 last:border-b-0",
              GRID,
              line.key === lastKey && "bg-emerald-50/50",
              isSelected && "bg-brand-50/50",
            )}
          >
            {readOnly ? (
              <span className="hidden xl:block" />
            ) : (
              <Checkbox
                className="hidden xl:flex"
                aria-label={`Sélectionner ${line.itemCode}`}
                checked={isSelected}
                onCheckedChange={(checked) => toggle(line.key, Boolean(checked))}
              />
            )}

            {/* Article */}
            <div className="col-span-2 flex min-w-0 items-center gap-3 xl:col-span-1">
              {line.image ? (
                <img src={line.image} alt="" className="size-8 shrink-0 rounded-lg border object-cover" loading="lazy" />
              ) : (
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground">
                  <ImageOff className="size-3.5" />
                </span>
              )}
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="truncate text-[13.5px] leading-[18px] font-medium" title={line.itemName}>
                  {line.itemName}
                </p>
                <p className="truncate text-[12px] leading-4 font-medium text-muted-foreground">
                  <span className="num">{line.itemCode}</span> · {line.uom}
                </p>
                {line.delivered > 0 ? (
                  <p className="text-[12px] leading-4 font-medium text-emerald-700" data-testid={`order-line-delivery-${line.itemCode}`}>
                    Livré {formatQuantity(line.delivered)} · Reste {formatQuantity(remaining)}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Disponibilité */}
            <div className="flex flex-col items-start gap-1">
              {availability ? (
                <span
                  className={cn("inline-flex items-center rounded-full border px-2 text-[12px] leading-[18px] font-semibold whitespace-nowrap", AVAILABILITY_TONE[availability.tone])}
                  data-testid={short ? `order-line-short-${line.itemCode}` : undefined}
                  title={short ? `Stock insuffisant : ${formatQuantity(line.qty)} demandé, ${formatQuantity(Math.max(0, line.available))} réservable` : undefined}
                >
                  {availability.label}
                </span>
              ) : (
                <span className="text-[12px] text-muted-foreground">Hors stock</span>
              )}
              {line.isStockItem && stock ? (
                <span className="text-[12px] leading-4 whitespace-nowrap text-muted-foreground 2xl:hidden" data-testid="stock-figures">
                  Stock <span className="num">{formatQuantity(stock.actual_qty)}</span> · Rés. <span className="num">{formatQuantity(stock.reserved_qty)}</span> · Cmd{" "}
                  <span className="num">{formatQuantity(stock.ordered_qty)}</span>
                </span>
              ) : null}
            </div>

            {/* Stock · Rés. · Cmd en colonnes (très grand écran) */}
            {(["actual_qty", "reserved_qty", "ordered_qty"] as const).map((field) => (
              <span
                key={field}
                className={cn(
                  "num hidden h-8 items-center justify-end text-[13px] 2xl:flex",
                  field === "actual_qty" ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {line.isStockItem && stock ? formatQuantity(stock[field]) : "—"}
              </span>
            ))}

            {/* Quantité (+ quota) */}
            <div className="flex flex-col gap-0.5">
              {readOnly ? (
                <span className="num flex h-8 items-center text-[13.5px] font-medium">{formatQuantity(line.qty)}</span>
              ) : (
                <div className={cn("flex h-8 w-max items-center overflow-hidden rounded-[10px] border", short && "border-amber-300")}>
                  <button
                    type="button"
                    aria-label={`Retirer une unité ${line.itemCode}`}
                    disabled={line.qty - 1 < rules.minQty}
                    onClick={() => onChange(line.key, { qty: Math.max(rules.minQty, line.qty - 1, 0) })}
                    className="grid h-full w-8 place-items-center text-muted-foreground hover:bg-muted disabled:opacity-40"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <CommitInput
                    aria-label={`Quantité ${line.itemCode}`}
                    inputMode="decimal"
                    className="num h-full w-[52px] rounded-none border-0 border-x px-1 text-center text-[13.5px] font-medium shadow-none focus-visible:ring-0"
                    value={String(line.qty)}
                    onCommit={(value) => {
                      const qty = parseDecimal(value);
                      if (qty != null && qty >= rules.minQty) onChange(line.key, { qty: maxQty == null ? qty : Math.min(qty, maxQty) });
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Ajouter une unité ${line.itemCode}`}
                    disabled={maxQty != null && line.qty + 1 > maxQty}
                    onClick={() => onChange(line.key, { qty: line.qty + 1 })}
                    className="grid h-full w-8 place-items-center text-muted-foreground hover:bg-muted disabled:opacity-40"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              )}
              {line.quotaMax ? (
                <span
                  className={cn("text-[11.5px] leading-4 whitespace-nowrap text-muted-foreground", overQuota && "font-medium text-amber-700")}
                  title={`${formatQuantity(line.quotaMax)} max par commande`}
                  data-testid={`order-line-quota-${line.itemCode}`}
                >
                  {overQuota ? "dépasse quota " : "quota "}
                  <span className="num">{formatQuantity(line.quotaMax)}</span>
                </span>
              ) : null}
            </div>

            {/* Réservé */}
            <div className="flex items-center gap-1.5">
              {!line.isStockItem ? (
                <span className="text-[13px] text-muted-foreground">—</span>
              ) : readOnly ? (
                <span className="num inline-flex items-center gap-1 text-[13px]">
                  <Lock className={cn("size-3.5", reservation.className)} aria-hidden />
                  {formatQuantity(reserved ?? 0)}
                </span>
              ) : (
                <>
                  <CommitInput
                    aria-label={`Réservé ${line.itemCode}`}
                    inputMode="decimal"
                    placeholder={formatQuantity(line.qty)}
                    className={cn("num h-8 w-14 rounded-[10px] px-2 text-[13px]", line.reservedQty == null && "text-muted-foreground")}
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
                  ) : (
                    <span title={reservation.text} className={cn("shrink-0", reservation.className)}>
                      <Lock className="size-3.5" aria-hidden />
                      <span className="sr-only">{reservation.text}</span>
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Prix unitaire */}
            <div className="flex flex-col items-end gap-1">
              {editableRate && !readOnly ? (
                <CommitInput
                  aria-label={`Prix ${line.itemCode}`}
                  inputMode="decimal"
                  className="num h-8 rounded-[10px] text-right"
                  value={String(line.rate ?? listPrice)}
                  onCommit={(value) => {
                    const rate = parseDecimal(value);
                    if (rate != null && rate >= 0) onChange(line.key, { rate, discount: null });
                  }}
                />
              ) : (
                <span className={cn("num flex h-8 items-center text-[13px]", !listPrice && "text-amber-700")}>
                  {listPrice ? formatMoney(listPrice, { precise: true }) : "Sans prix"}
                </span>
              )}
              {newPrice != null ? (
                <button
                  type="button"
                  disabled={readOnly}
                  title={readOnly ? "Nouveau tarif de la liste" : "Nouveau tarif de la liste — cliquer pour l’appliquer"}
                  onClick={() => onChange(line.key, { lockedListPrice: null })}
                  className="text-[12px] leading-4 font-medium whitespace-nowrap text-amber-700 enabled:hover:underline"
                  data-testid={`order-line-price-${line.itemCode}`}
                >
                  Tarif <span className="num">{formatMoney(newPrice, { precise: true })}</span>
                </button>
              ) : null}
              {discount ? (
                <span className="text-[12px] leading-4 whitespace-nowrap text-muted-foreground">
                  net <span className="num">{formatMoney(net, { precise: true })}</span>
                </span>
              ) : null}
            </div>

            {/* Remise */}
            <div>
              {readOnly ? (
                <span className="num flex h-8 items-center justify-end text-[13px]">{discount ? `${formatQuantity(discount)} %` : "—"}</span>
              ) : (
                <div className="flex h-8 items-center rounded-[10px] border pr-2.5 focus-within:ring-2 focus-within:ring-ring/40">
                  <CommitInput
                    aria-label={`Remise ${line.itemCode}`}
                    inputMode="decimal"
                    placeholder="0"
                    className="num h-full min-w-0 flex-1 border-0 px-2 text-right text-[13px] shadow-none focus-visible:ring-0"
                    value={line.discount != null ? String(line.discount) : discount ? String(discount) : ""}
                    onCommit={(value) => {
                      const parsed = value.trim() ? parseDecimal(value) : 0;
                      if (parsed != null && parsed >= 0 && parsed <= 100) onChange(line.key, { discount: parsed, rate: null });
                    }}
                  />
                  <span className="text-[13px] text-muted-foreground">%</span>
                </div>
              )}
            </div>

            {/* TVA : taux de la fiche article, calculé par ERPNext */}
            <div className="flex h-8 items-center justify-end gap-1" data-testid={`order-line-vat-${line.itemCode}`}>
              {row?.tax_missing ? (
                <AlertTriangle
                  className="size-3.5 text-amber-600"
                  aria-label="Taux de TVA non renseigné"
                  role="img"
                >
                  <title>Taux de TVA non renseigné sur la fiche article : compté exonéré</title>
                </AlertTriangle>
              ) : null}
              {row ? (
                <span
                  className={cn(
                    "num rounded-full border px-1.5 text-[12px] leading-[18px] font-semibold",
                    row.tax_rate ? "border-border bg-muted text-foreground" : "border-dashed text-muted-foreground",
                  )}
                >
                  {row.tax_rate ? `${formatQuantity(row.tax_rate)} %` : "Exo."}
                </span>
              ) : (
                <span className="text-[13px] text-muted-foreground">—</span>
              )}
            </div>

            {/* Montant */}
            <span className="num flex h-8 items-center justify-end text-[13px] font-semibold whitespace-nowrap">
              {formatMoney(amount, { precise: true })}
            </span>

            <div className="flex justify-end">
              {readOnly ? null : (
                <button
                  type="button"
                  title={rules.removable ? "Retirer la ligne" : "Article déjà livré : la ligne ne peut pas être retirée"}
                  aria-label={`Retirer la ligne ${line.itemCode}`}
                  disabled={!rules.removable}
                  onClick={() => setPendingRemoval([line])}
                  className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
      {pendingRemoval ? (
        <ConfirmRemoveDialog
          lines={pendingRemoval}
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => {
            onRemove(pendingRemoval.map((line) => line.key));
            setPendingRemoval(null);
          }}
        />
      ) : null}
    </section>
  );
}
