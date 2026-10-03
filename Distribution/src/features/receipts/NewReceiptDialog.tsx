import { useEffect, useState } from "react";
import { AlertTriangle, Check, Plus, Search } from "lucide-react";
import { FormSelect } from "@/components/FilterSelect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/shared/api/distribution";
import type { NewReceiptInput, ReceiptOptions, SupplierOption } from "@/shared/api/receipts";

function today() {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function NewReceiptDialog({
  open,
  onOpenChange,
  options,
  searchSuppliers,
  createSupplier,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options?: ReceiptOptions;
  searchSuppliers: (txt: string) => Promise<SupplierOption[]>;
  createSupplier: (name: string) => Promise<SupplierOption>;
  onSubmit: (payload: NewReceiptInput) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SupplierOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [supplier, setSupplier] = useState<SupplierOption | null>(null);
  const [warehouse, setWarehouse] = useState("");
  const [postingDate, setPostingDate] = useState(today());
  const [deliveryNote, setDeliveryNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSupplier(null);
    setWarehouse(options?.default_warehouse || "");
    setPostingDate(today());
    setDeliveryNote("");
    setError("");
  }, [open, options?.default_warehouse]);

  useEffect(() => {
    if (!open || supplier) return;
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchSuppliers(query.trim())
        .then((rows) => {
          if (!cancelled) setResults(rows || []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // searchSuppliers est recréé à chaque rendu par le hook : seule la saisie relance la recherche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, supplier]);

  const typed = query.trim();
  const exactMatch = results.some((row) => row.supplier_name.toLocaleLowerCase("fr") === typed.toLocaleLowerCase("fr"));
  const warehouseOptions = (options?.warehouses || []).map((name) => ({ value: name, label: name }));
  const canSave = Boolean(supplier && warehouse && postingDate) && !pending;

  const addSupplier = async () => {
    if (!typed) return;
    setPending(true);
    setError("");
    try {
      const created = await createSupplier(typed);
      setSupplier(created);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const submit = async () => {
    if (!canSave || !supplier) return;
    setPending(true);
    setError("");
    try {
      await onSubmit({
        supplier: supplier.name,
        warehouse,
        posting_date: postingDate,
        supplier_delivery_note: deliveryNote.trim() || undefined,
      });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Nouvelle réception</DialogTitle>
            <DialogDescription>
              Choisissez le fournisseur et l’entrepôt, puis scannez les articles reçus.
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
                <FieldLabel htmlFor="receipt-supplier">Fournisseur</FieldLabel>
                {supplier ? (
                  <div className="flex items-center gap-2 rounded-lg border border-brand-300 bg-brand-50/50 px-3 py-2">
                    <Check className="size-4 text-brand-700" />
                    <span className="min-w-0 flex-1 truncate font-medium">{supplier.supplier_name}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSupplier(null)}>
                      Changer
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <InputGroup className="bg-background">
                      <InputGroupAddon>
                        {searching ? <Spinner /> : <Search />}
                      </InputGroupAddon>
                      <InputGroupInput
                        id="receipt-supplier"
                        value={query}
                        autoFocus
                        autoComplete="off"
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Rechercher un fournisseur…"
                        aria-label="Rechercher un fournisseur"
                      />
                    </InputGroup>
                    <div className="max-h-48 overflow-y-auto rounded-lg border" role="listbox" aria-label="Fournisseurs">
                      {results.map((row) => (
                        <button
                          key={row.name}
                          type="button"
                          role="option"
                          aria-selected={false}
                          onClick={() => setSupplier(row)}
                          className="flex w-full items-center gap-2 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted"
                        >
                          <span className="min-w-0 flex-1 truncate">{row.supplier_name}</span>
                          {row.supplier_group ? (
                            <span className="truncate t-meta text-muted-foreground">{row.supplier_group}</span>
                          ) : null}
                        </button>
                      ))}
                      {!searching && results.length === 0 ? (
                        <p className="px-3 py-3 text-center text-[12.5px] text-muted-foreground">
                          {typed ? "Aucun fournisseur trouvé." : "Aucun fournisseur enregistré."}
                        </p>
                      ) : null}
                    </div>
                    {typed && !exactMatch ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="justify-start"
                        disabled={pending}
                        onClick={() => void addSupplier()}
                      >
                        <Plus />
                        Créer le fournisseur « {typed} »
                      </Button>
                    ) : null}
                  </div>
                )}
              </Field>

              <Field>
                <FieldLabel>Entrepôt de réception</FieldLabel>
                <FormSelect
                  aria-label="Entrepôt de réception"
                  value={warehouse}
                  onChange={setWarehouse}
                  options={[{ value: "", label: "Sélectionner" }, ...warehouseOptions]}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="receipt-date">Date de réception</FieldLabel>
                  <Input
                    id="receipt-date"
                    type="date"
                    max={today()}
                    value={postingDate}
                    onChange={(event) => setPostingDate(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="receipt-bl">N° BL fournisseur</FieldLabel>
                  <Input
                    id="receipt-bl"
                    value={deliveryNote}
                    onChange={(event) => setDeliveryNote(event.target.value)}
                    placeholder="Facultatif"
                  />
                </Field>
              </div>
            </FieldGroup>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSave} className={cn(pending && "opacity-80")}>
              {pending ? <Spinner /> : null}
              Commencer la réception
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
