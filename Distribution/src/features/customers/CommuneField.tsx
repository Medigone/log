import { useEffect, useState } from "react";
import { Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useCommuneSearch, type CommuneOption } from "@/shared/api/orders";

/** Choix d'une commune par recherche (nom, nom arabe ou wilaya). */
export function CommuneField({
  id,
  value,
  onChange,
  enabled = true,
}: {
  id: string;
  value: CommuneOption | null;
  onChange: (commune: CommuneOption | null) => void;
  enabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const { data, isLoading } = useCommuneSearch(debounced, enabled && !value && debounced.length >= 2);
  const communes = data?.message ?? [];

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-brand-300 bg-brand-50/50 px-3 py-2">
        <Check className="size-4 text-brand-700" />
        <span className="min-w-0 flex-1 truncate font-medium">
          {value.nom}
          {value.wilaya ? ` · ${value.wilaya}` : ""}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setQuery("");
            onChange(null);
          }}
        >
          Changer
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <InputGroup className="bg-background">
        <InputGroupAddon>{isLoading ? <Spinner /> : <Search />}</InputGroupAddon>
        <InputGroupInput
          id={id}
          value={query}
          autoComplete="off"
          placeholder="Rechercher une commune ou une wilaya…"
          aria-label="Rechercher une commune"
          onChange={(event) => setQuery(event.target.value)}
        />
      </InputGroup>
      {debounced.length >= 2 ? (
        <div className="max-h-40 overflow-y-auto rounded-lg border" role="listbox" aria-label="Communes">
          {communes.map((row) => (
            <button
              key={row.name}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => onChange(row)}
              className="flex w-full items-center gap-2 border-b px-3 py-1.5 text-left last:border-b-0 hover:bg-muted"
            >
              <span className="min-w-0 flex-1 truncate">{row.nom}</span>
              <span className="t-meta text-muted-foreground">{row.wilaya}</span>
            </button>
          ))}
          {!isLoading && communes.length === 0 ? (
            <p className="px-3 py-2 text-center text-[12.5px] text-muted-foreground">Aucune commune trouvée.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
