import { useEffect, useRef, useState } from "react";
import { ExternalLink, Search, UserPlus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/format";
import { useCustomerSearch, type CustomerSummary } from "@/shared/api/orders";

function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function CustomerBalance({ balance }: { balance?: number }) {
  const value = balance ?? 0;
  return (
    <span
      className={cn(
        "num shrink-0 rounded-md px-1.5 py-0.5 text-[12.5px] font-medium",
        value > 0 ? "bg-amber-50 text-amber-800" : value < 0 ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground",
      )}
      title="Solde comptable du client"
    >
      Solde {formatMoney(value)}
    </span>
  );
}

export function CustomerPicker({
  customer,
  readOnly,
  onSelect,
  onCreate,
}: {
  customer: CustomerSummary | null;
  readOnly?: boolean;
  onSelect: (customer: CustomerSummary | null) => void;
  onCreate: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebounced(query.trim());
  const showResults = open && debounced.length > 0;
  const { data, isLoading } = useCustomerSearch(debounced, !customer && showResults);
  const results = showResults ? (data?.message ?? []) : [];
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setActive(0), [debounced]);

  if (customer) {
    return (
      <section className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3.5" aria-label="Client">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-foreground">
          <UserRound className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-[14px] font-semibold">{customer.customer_name}</p>
            <CustomerBalance balance={customer.balance} />
          </div>
          <p className="truncate t-meta text-muted-foreground">
            {[customer.customer_group, [customer.commune_name, customer.wilaya].filter(Boolean).join(", "), customer.phone]
              .filter(Boolean)
              .join(" · ")}
            {" · "}
            <span className={cn(!customer.has_gps && "font-medium text-amber-700")}>{customer.has_gps ? "GPS connu" : "Sans GPS"}</span>
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<a href={`#/clients/${encodeURIComponent(customer.name)}`} target="_blank" rel="noreferrer" />}
        >
          <ExternalLink /> Fiche
        </Button>
        {readOnly ? null : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onSelect(null);
              setQuery("");
              setOpen(true);
              window.setTimeout(() => inputRef.current?.focus(), 0);
            }}
          >
            Changer
          </Button>
        )}
      </section>
    );
  }

  const choose = (row: CustomerSummary) => {
    onSelect(row);
    setOpen(false);
  };

  return (
    <section className="rounded-xl border bg-card p-3.5 shadow-sm" aria-label="Client">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <InputGroup className="h-9 bg-background">
            <InputGroupAddon>{isLoading && showResults ? <Spinner /> : <Search />}</InputGroupAddon>
            <InputGroupInput
              ref={inputRef}
              value={query}
              autoFocus
              autoComplete="off"
              placeholder="Client : nom, téléphone ou commune…"
              aria-label="Rechercher un client"
              onFocus={() => setOpen(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((index) => Math.max(index - 1, 0));
                } else if (event.key === "Enter" && results[active]) {
                  event.preventDefault();
                  choose(results[active]);
                } else if (event.key === "Escape") {
                  setOpen(false);
                }
              }}
            />
          </InputGroup>
          {showResults ? (
            <div
              role="listbox"
              aria-label="Clients"
              className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border bg-popover shadow-lg"
            >
              {results.map((row, index) => (
                <button
                  key={row.name}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(row)}
                  className={cn(
                    "flex w-full items-center gap-3 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted",
                    index === active && "bg-muted",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{row.customer_name}</span>
                      <CustomerBalance balance={row.balance} />
                    </span>
                    <span className="block truncate t-meta text-muted-foreground">
                      {[row.customer_group, row.commune_name, row.wilaya, row.phone].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              ))}
              {!isLoading && results.length === 0 ? (
                <p className="px-3 py-3 text-center text-[12.5px] text-muted-foreground">Aucun client trouvé.</p>
              ) : null}
            </div>
          ) : null}
        </div>
        <Button variant="outline" className="h-9" onClick={() => onCreate(query.trim())}>
          <UserPlus /> Nouveau client
        </Button>
      </div>
    </section>
  );
}
