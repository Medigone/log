import { useEffect, useState, type RefObject } from "react";
import { Camera, History, ImageOff, ScanBarcode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ScanTone } from "@/features/preparation/pickScan";
import { parseQuantityScan } from "@/features/orders/orderDraft";
import { StockSummary } from "@/features/orders/StockFigures";
import { cn } from "@/lib/utils";
import { useItemSearch, type ItemCard, type RecentItemCard } from "@/shared/api/orders";
import { formatMoney, formatQuantity } from "@/shared/format";

const FEEDBACK_TEXT: Record<ScanTone, string> = {
  idle: "text-muted-foreground",
  ok: "text-emerald-700",
  warn: "text-amber-700",
  error: "text-destructive",
};

export type ScanOutcome = "found" | "unknown" | "error";

function StockBadge({ item }: { item: ItemCard }) {
  if (!item.is_stock_item) return null;
  const available = item.stock ? item.stock.net_qty : Math.max(0, item.available);
  return (
    <span
      className={cn(
        "num whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium",
        available > 0 ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700",
      )}
    >
      {available === 0 && !item.stock
        ? "Indisponible"
        : `${formatQuantity(available)} disponible${Math.abs(available) > 1 ? "s" : ""}`}
    </span>
  );
}

function QuotaBadge({ item }: { item: ItemCard }) {
  if (!item.quota_max_qty) return null;
  return (
    <span className="num whitespace-nowrap rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
      Quota {formatQuantity(item.quota_max_qty)}
    </span>
  );
}

function Thumb({ image }: { image?: string | null }) {
  return image ? (
    <img src={image} alt="" className="size-9 shrink-0 rounded-md border object-cover" loading="lazy" />
  ) : (
    <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground">
      <ImageOff className="size-4" />
    </span>
  );
}

export function ItemSearchPanel({
  context,
  inputRef,
  feedback,
  recentItems,
  disabled,
  onScan,
  onPick,
  onOpenCamera,
}: {
  context: { customer?: string | null; priceList?: string | null; warehouse?: string | null };
  inputRef: RefObject<HTMLInputElement | null>;
  feedback: { text: string; tone: ScanTone };
  recentItems: RecentItemCard[];
  disabled?: boolean;
  onScan: (raw: string) => Promise<ScanOutcome>;
  onPick: (item: ItemCard, qty: number) => void;
  onOpenCamera: () => void;
}) {
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const { code, qty } = parseQuantityScan(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(code), 250);
    return () => window.clearTimeout(timer);
  }, [code]);
  useEffect(() => setActive(-1), [debounced]);

  const searching = open && debounced.length >= 2;
  const { data, isLoading } = useItemSearch(debounced, context, searching);
  const results = searching ? data?.message ?? [] : [];

  const reset = () => {
    setValue("");
    setOpen(false);
    setActive(-1);
  };

  const pick = (item: ItemCard) => {
    onPick(item, qty);
    reset();
    inputRef.current?.focus();
  };

  const submit = async () => {
    if (!value.trim()) return;
    // Une douchette tape plus vite que la recherche : seuls les résultats du texte courant comptent.
    const fresh = debounced === code ? results : [];
    if (active >= 0 && fresh[active]) {
      pick(fresh[active]);
      return;
    }
    setBusy(true);
    const outcome = await onScan(value);
    setBusy(false);
    if (outcome === "found") {
      reset();
    } else if (outcome === "unknown" && fresh.length === 1) {
      pick(fresh[0]);
    } else {
      setOpen(true);
    }
    inputRef.current?.focus();
  };

  return (
    <section className="rounded-xl border bg-card p-3.5 shadow-sm" aria-label="Ajout d’articles">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start">
        <div className="relative min-w-0 flex-1">
          <ScanBarcode className="pointer-events-none absolute top-[26px] left-3 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={value}
            disabled={disabled}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Scannez un code-barres ou cherchez un article (ex. 12*code pour 12 unités)"
            aria-label="Scanner ou rechercher un article"
            onChange={(event) => {
              setValue(event.target.value);
              setOpen(true);
            }}
            onFocus={() => value && setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
                setActive((index) => Math.min(index + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => Math.max(index - 1, -1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              } else if (event.key === "Escape") {
                reset();
              }
            }}
            className={cn(
              "h-[52px] rounded-lg pl-10 text-[16px]",
              feedback.tone === "error" && "border-destructive/40 bg-destructive/5",
            )}
          />
          {searching ? (
            <div
              role="listbox"
              aria-label="Articles trouvés"
              className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border bg-popover shadow-lg"
            >
              {results.map((item, index) => (
                <button
                  key={item.item_code}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(item)}
                  className={cn(
                    "flex w-full items-center gap-3 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted",
                    index === active && "bg-muted",
                  )}
                >
                  <Thumb image={item.image} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.item_name}</span>
                    <span className="block truncate t-meta text-muted-foreground">
                      {[item.item_code, item.barcode, item.item_group].filter(Boolean).join(" · ")}
                    </span>
                    {item.is_stock_item ? <StockSummary stock={item.stock} className="block truncate t-meta" /> : null}
                  </span>
                  <QuotaBadge item={item} />
                  <StockBadge item={item} />
                  <span className="num w-24 shrink-0 text-right text-[13px] font-semibold">
                    {item.price != null ? formatMoney(item.price) : "—"}
                  </span>
                </button>
              ))}
              {isLoading && !results.length ? (
                <p className="flex items-center justify-center gap-2 px-3 py-3 text-[12.5px] text-muted-foreground">
                  <Spinner /> Recherche…
                </p>
              ) : null}
              {!isLoading && !results.length ? (
                <p className="px-3 py-3 text-center text-[12.5px] text-muted-foreground">Aucun article trouvé.</p>
              ) : null}
            </div>
          ) : null}
        </div>
        <Button variant="outline" className="h-[52px]" onClick={onOpenCamera} disabled={disabled}>
          <Camera /> Caméra
        </Button>
      </div>
      <p className={cn("mt-2 flex items-center gap-2 text-[12.5px] leading-snug", FEEDBACK_TEXT[feedback.tone])} aria-live="polite">
        {busy ? <Spinner /> : null}
        {feedback.text || "Entrée valide le code scanné ; ↑ ↓ pour choisir dans la liste."}
      </p>

      {recentItems.length ? (
        <div className="mt-3 border-t pt-3">
          <p className="mb-2 flex items-center gap-1.5 t-micro text-muted-foreground">
            <History className="size-3.5" /> Articles habituels du client
          </p>
          <div className="flex flex-wrap gap-1.5">
            {recentItems.map((item) => (
              <button
                key={item.item_code}
                type="button"
                disabled={disabled}
                onClick={() => onPick(item, item.last_qty || 1)}
                title={`Dernière quantité : ${formatQuantity(item.last_qty)}`}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-[12.5px] hover:border-brand-300 hover:bg-brand-50/50"
              >
                <span className="truncate">{item.item_name}</span>
                <span className="num text-muted-foreground">×{formatQuantity(item.last_qty || 1)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
