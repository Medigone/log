import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useDebouncedValue } from "@/features/catalog/catalogShared";
import { useCatalogItems, type CustomerOption } from "@/shared/api/catalog";
import { apiErrorMessage } from "@/shared/api/distribution";

/** Choix d'un client par recherche (nom ou code). */
export function CustomerSearchField({
  value,
  label,
  onChange,
  search,
}: {
  value: { name: string; label: string } | null;
  label: string;
  onChange: (value: { name: string; label: string } | null) => void;
  search: (txt: string) => Promise<CustomerOption[]>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const debounced = useDebouncedValue(query.trim());

  useEffect(() => {
    if (value || !debounced) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    search(debounced)
      .then((rows) => {
        if (!cancelled) {
          setResults(rows);
          setError("");
        }
      })
      .catch((err) => !cancelled && setError(apiErrorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // `search` change à chaque rendu (hook de mutation) : seule la saisie relance la recherche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, value]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
        <span className="min-w-0 truncate text-sm font-medium">{value.label}</span>
        <Button variant="ghost" size="icon-sm" aria-label={`Changer ${label.toLocaleLowerCase("fr")}`} onClick={() => onChange(null)}>
          <X />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <InputGroup className="bg-background">
        <InputGroupAddon>{loading ? <Spinner /> : <Search />}</InputGroupAddon>
        <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom ou code client…" aria-label={label} />
      </InputGroup>
      {error ? <p className="t-meta text-red-700">{error}</p> : null}
      {results.length ? (
        <ul className="max-h-48 overflow-y-auto rounded-lg border" aria-label="Clients trouvés">
          {results.map((customer) => (
            <li key={customer.name}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onChange({ name: customer.name, label: customer.customer_name || customer.name });
                  setQuery("");
                }}
              >
                <span className="truncate font-medium">{customer.customer_name}</span>
                <span className="shrink-0 t-meta text-muted-foreground">{customer.customer_group}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Ajout d'articles à une liste (promotions). */
export function ItemSearchField({ selected, onAdd }: { selected: readonly string[]; onAdd: (itemCode: string, label: string) => void }) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim());
  const { data, isLoading } = useCatalogItems({ search: debounced, status: "actifs", itemGroup: "", brand: "", start: 0, limit: 8 });
  const results = debounced ? (data?.message?.items ?? []).filter((item) => !selected.includes(item.item_code)) : [];

  return (
    <div className="space-y-1.5">
      <InputGroup className="bg-background">
        <InputGroupAddon>{isLoading && debounced ? <Spinner /> : <Search />}</InputGroupAddon>
        <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ajouter un article…" aria-label="Rechercher un article" />
      </InputGroup>
      {results.length ? (
        <ul className="max-h-48 overflow-y-auto rounded-lg border" aria-label="Articles trouvés">
          {results.map((item) => (
            <li key={item.item_code}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onAdd(item.item_code, item.item_name);
                  setQuery("");
                }}
              >
                <span className="truncate font-medium">{item.item_name}</span>
                <span className="shrink-0 font-mono t-meta text-muted-foreground">{item.item_code}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
