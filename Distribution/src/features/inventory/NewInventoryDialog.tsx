import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { parseItemCodes } from "@/features/inventory/inventoryFormat";
import {
  apiErrorMessage,
  type InventoryOptions,
  type InventoryScopeInput,
  type ItemGroupNode,
  type NewInventoryInput,
  type ScopePreview,
} from "@/shared/api/inventory";
import { parseDecimal } from "@/shared/format/parseDecimal";

type Mode = "Global" | "Partiel";

function defaultTitle() {
  const today = new Date().toLocaleDateString("fr-FR");
  return `Inventaire du ${today}`;
}

function groupDepths(groups: ItemGroupNode[]) {
  const byName = new Map(groups.map((group) => [group.name, group]));
  const depth = (group: ItemGroupNode): number => {
    let level = 0;
    let parent = group.parent ? byName.get(group.parent) : undefined;
    while (parent && level < 10) {
      level += 1;
      parent = parent.parent ? byName.get(parent.parent) : undefined;
    }
    return level;
  };
  return new Map(groups.map((group) => [group.name, depth(group)]));
}

function CheckList({
  label,
  options,
  selected,
  onChange,
  searchable,
  depths,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  searchable?: boolean;
  depths?: Map<string, number>;
}) {
  const [query, setQuery] = useState("");
  const haystack = query.trim().toLocaleLowerCase("fr");
  const visible = haystack ? options.filter((option) => option.toLocaleLowerCase("fr").includes(haystack)) : options;
  const toggle = (value: string, checked: boolean) =>
    onChange(checked ? [...selected, value] : selected.filter((entry) => entry !== value));

  return (
    <div className="flex flex-col gap-1.5">
      {searchable ? (
        <InputGroup className="bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrer…" aria-label={`Filtrer ${label}`} />
        </InputGroup>
      ) : null}
      <div className="max-h-40 overflow-y-auto rounded-lg border" role="group" aria-label={label}>
        {visible.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-[13px] last:border-b-0 hover:bg-muted"
            style={depths && !haystack ? { paddingLeft: 12 + (depths.get(option) ?? 0) * 14 } : undefined}
          >
            <Checkbox checked={selected.includes(option)} onCheckedChange={(checked) => toggle(option, Boolean(checked))} />
            <span className="min-w-0 truncate">{option}</span>
          </label>
        ))}
        {!visible.length ? <p className="px-3 py-2 text-center text-[12.5px] text-muted-foreground">Aucun résultat.</p> : null}
      </div>
    </div>
  );
}

export function NewInventoryDialog({
  open,
  onOpenChange,
  options,
  previewScope,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options?: InventoryOptions;
  previewScope: (scope: InventoryScopeInput) => Promise<ScopePreview>;
  onSubmit: (input: NewInventoryInput) => Promise<void>;
}) {
  const [titre, setTitre] = useState(defaultTitle());
  const [mode, setMode] = useState<Mode>("Partiel");
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [itemCodes, setItemCodes] = useState("");
  const [blind, setBlind] = useState(true);
  const [includeZero, setIncludeZero] = useState(false);
  const [thresholdPct, setThresholdPct] = useState("5");
  const [thresholdQty, setThresholdQty] = useState("0");
  const [preview, setPreview] = useState<ScopePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitre(defaultTitle());
    setMode("Partiel");
    setWarehouses([]);
    setGroups([]);
    setBrands([]);
    setItemCodes("");
    setBlind(true);
    setIncludeZero(false);
    setThresholdPct("5");
    setThresholdQty("0");
    setPreview(null);
    setError("");
  }, [open]);

  const scope: InventoryScopeInput = useMemo(
    () =>
      mode === "Global"
        ? { company: options?.company, warehouses: [], item_groups: [], brands: [], items: [] }
        : { company: options?.company, warehouses, item_groups: groups, brands, items: parseItemCodes(itemCodes) },
    [mode, options?.company, warehouses, groups, brands, itemCodes],
  );
  const scopeKey = JSON.stringify(scope);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreviewing(true);
    const timer = window.setTimeout(() => {
      previewScope(scope)
        .then((result) => {
          if (!cancelled) setPreview(result);
        })
        .catch((err) => {
          if (!cancelled) {
            setPreview(null);
            setError(apiErrorMessage(err));
          }
        })
        .finally(() => {
          if (!cancelled) setPreviewing(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // previewScope est recréé à chaque rendu par le hook : seul le périmètre relance l'aperçu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scopeKey]);

  const depths = useMemo(() => groupDepths(options?.item_groups ?? []), [options?.item_groups]);
  const canSave = Boolean(titre.trim()) && !pending && (preview?.items ?? 0) > 0;

  const submit = async () => {
    if (!canSave) return;
    setPending(true);
    setError("");
    try {
      await onSubmit({
        ...scope,
        titre: titre.trim(),
        blind,
        include_zero_stock: includeZero,
        recount_threshold_pct: parseDecimal(thresholdPct) ?? 5,
        recount_threshold_qty: parseDecimal(thresholdQty) ?? 0,
      });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Nouvel inventaire</DialogTitle>
            <DialogDescription>
              Définissez le périmètre. Le stock théorique est relevé au lancement du comptage.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGroup className="gap-3">
              {error ? (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertTitle>Impossible de continuer</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Field>
                <FieldLabel htmlFor="inventory-title">Titre</FieldLabel>
                <Input id="inventory-title" value={titre} onChange={(event) => setTitre(event.target.value)} />
              </Field>

              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type d’inventaire">
                {(["Partiel", "Global"] as Mode[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={mode === value}
                    onClick={() => setMode(value)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left",
                      mode === value ? "border-brand-300 bg-brand-50/60" : "hover:bg-muted",
                    )}
                  >
                    <p className="text-[13px] font-medium">{value === "Global" ? "Global" : "Partiel"}</p>
                    <p className="t-meta text-muted-foreground">
                      {value === "Global" ? "Tous les articles de tous les entrepôts" : "Entrepôts, groupes, marques ou articles"}
                    </p>
                  </button>
                ))}
              </div>

              {mode === "Partiel" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel>Entrepôts {warehouses.length ? `(${warehouses.length})` : "(tous)"}</FieldLabel>
                    <CheckList label="Entrepôts" options={options?.warehouses ?? []} selected={warehouses} onChange={setWarehouses} />
                  </Field>
                  <Field>
                    <FieldLabel>Groupes d’articles {groups.length ? `(${groups.length})` : "(tous)"}</FieldLabel>
                    <CheckList
                      label="Groupes d’articles"
                      options={(options?.item_groups ?? []).map((group) => group.name)}
                      selected={groups}
                      onChange={setGroups}
                      depths={depths}
                      searchable
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Marques {brands.length ? `(${brands.length})` : "(toutes)"}</FieldLabel>
                    <CheckList label="Marques" options={options?.brands ?? []} selected={brands} onChange={setBrands} searchable />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="inventory-items">Articles précis</FieldLabel>
                    <Textarea
                      id="inventory-items"
                      value={itemCodes}
                      onChange={(event) => setItemCodes(event.target.value)}
                      placeholder="Codes article séparés par un espace ou un retour à la ligne"
                      className="min-h-40 font-mono text-[12.5px]"
                    />
                  </Field>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-start gap-2 text-[13px]">
                  <Checkbox checked={blind} onCheckedChange={(value) => setBlind(Boolean(value))} className="mt-0.5" />
                  <span>
                    Comptage à l’aveugle
                    <span className="block t-meta text-muted-foreground">Les compteurs ne voient pas le stock théorique.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-[13px]">
                  <Checkbox checked={includeZero} onCheckedChange={(value) => setIncludeZero(Boolean(value))} className="mt-0.5" />
                  <span>
                    Inclure les articles sans stock
                    <span className="block t-meta text-muted-foreground">Utile pour retrouver du stock non enregistré.</span>
                  </span>
                </label>
                <Field>
                  <FieldLabel htmlFor="inventory-threshold-pct">Recompter au-delà de (%)</FieldLabel>
                  <Input id="inventory-threshold-pct" inputMode="decimal" value={thresholdPct} onChange={(event) => setThresholdPct(event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="inventory-threshold-qty">et au-delà de (unités)</FieldLabel>
                  <Input id="inventory-threshold-qty" inputMode="decimal" value={thresholdQty} onChange={(event) => setThresholdQty(event.target.value)} />
                </Field>
              </div>

              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-[13px]" aria-live="polite">
                {previewing ? <Spinner /> : null}
                {preview ? (
                  <span>
                    <strong className="num">{preview.items}</strong> article{preview.items > 1 ? "s" : ""} dans le périmètre, dont{" "}
                    <strong className="num">{preview.items_in_stock}</strong> en stock ·{" "}
                    <strong className="num">{preview.stock_lines}</strong> emplacement{preview.stock_lines > 1 ? "s" : ""} ·{" "}
                    {preview.warehouses} entrepôt{preview.warehouses > 1 ? "s" : ""}
                    {preview.batch_items ? ` · ${preview.batch_items} géré${preview.batch_items > 1 ? "s" : ""} par lot` : ""}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Calcul du périmètre…</span>
                )}
              </div>
            </FieldGroup>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSave}>
              {pending ? <Spinner /> : null}
              Créer l’inventaire
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
