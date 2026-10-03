import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Folder,
  FolderOpen,
  FolderTree,
  Pencil,
  Plus,
  Save,
  Search,
  Star,
  Store,
  Tag,
  Trash2,
} from "lucide-react";
import { FormSelect } from "@/components/FilterSelect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Toolbar } from "@/components/ui/toolbar";
import { expandableGroups, groupRows, moveItem, parentGroupOptions, visibleTree } from "@/features/catalog/catalogShared";
import { cn } from "@/lib/utils";
import {
  useBrands,
  useCatalogMutations,
  useCatalogOptions,
  useStoreSettings,
  type BrandRow,
  type CatalogItemGroup,
  type StoreSettings,
} from "@/shared/api/catalog";
import { apiErrorMessage } from "@/shared/api/distribution";

const TABS = ["groupes", "marques", "rayons"] as const;
type SettingsTab = (typeof TABS)[number];

export function CatalogSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab") as SettingsTab | null;
  const tab: SettingsTab = requested && TABS.includes(requested) ? requested : "groupes";

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title="Référentiels"
        description="Groupes d’articles, marques et rayons affichés sur le Store client."
      />
      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams(value === "groupes" ? {} : { tab: String(value) }, { replace: true })}
        aria-label="Référentiels du catalogue"
      >
        <TabsList variant="line">
          <TabsTrigger value="groupes">Groupes</TabsTrigger>
          <TabsTrigger value="marques">Marques</TabsTrigger>
          <TabsTrigger value="rayons">Rayons Store</TabsTrigger>
        </TabsList>
        <TabsContent value="groupes" className="pt-5">
          <GroupsTab />
        </TabsContent>
        <TabsContent value="marques" className="pt-5">
          <BrandsTab />
        </TabsContent>
        <TabsContent value="rayons" className="pt-5">
          <StoreTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

// --- Groupes -------------------------------------------------------------------

const ROOT_DEPTH_OPEN = 1;

function initialExpanded(groups: readonly CatalogItemGroup[]) {
  const rows = groupRows(groups);
  return new Set(rows.filter((row) => row.is_group && row.depth < ROOT_DEPTH_OPEN).map((row) => row.name));
}

function Highlight({ text, query }: { text: string; query: string }) {
  const term = query.trim();
  if (!term) return <>{text}</>;
  const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
  // La normalisation garde la longueur des lettres de base : les index restent alignés sur le texte d'origine.
  const index = plain(text).indexOf(plain(term));
  if (index < 0 || plain(text).length !== text.length) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-amber-100 px-0.5 text-foreground">{text.slice(index, index + term.length)}</mark>
      {text.slice(index + term.length)}
    </>
  );
}

function GroupsTab() {
  const { data, mutate } = useCatalogOptions();
  const api = useCatalogMutations();
  const groups = useMemo(() => data?.message?.item_groups ?? [], [data]);
  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ group: CatalogItemGroup | null; parent?: string } | undefined>(undefined);
  const opened = useMemo(() => expanded ?? initialExpanded(groups), [expanded, groups]);
  const rows = useMemo(() => visibleTree(groups, opened, search), [groups, opened, search]);
  const searching = Boolean(search.trim());

  const toggle = (name: string) =>
    setExpanded(() => {
      const next = new Set(opened);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className="space-y-3">
      <Toolbar>
        <InputGroup className="min-w-48 flex-1 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un groupe…" aria-label="Rechercher un groupe" />
        </InputGroup>
        <Button variant="outline" disabled={searching} onClick={() => setExpanded(expandableGroups(groups))}>
          <ChevronsUpDown /> Tout déplier
        </Button>
        <Button variant="outline" disabled={searching} onClick={() => setExpanded(new Set())}>
          <ChevronsDownUp /> Tout replier
        </Button>
        <Button onClick={() => setEditing({ group: null })}>
          <Plus /> Nouveau groupe
        </Button>
      </Toolbar>

      <div className="overflow-hidden rounded-xl border bg-card">
        {!data ? (
          <div className="grid min-h-40 place-items-center">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={FolderTree} title="Aucun groupe ne correspond" description="Modifiez la recherche." />
        ) : (
          <ul role="tree" aria-label="Groupes d’articles" className="divide-y">
            {rows.map((row) => (
              <li
                key={row.name}
                role="treeitem"
                aria-level={row.depth + 1}
                aria-expanded={row.hasChildren ? row.expanded : undefined}
                aria-selected={false}
                className={cn("group/row flex items-center gap-2 py-1.5 pr-2 hover:bg-muted/50", row.match && "bg-amber-50/60")}
                style={{ paddingLeft: `${8 + row.depth * 22}px` }}
              >
                {row.hasChildren ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={searching}
                    aria-label={`${row.expanded ? "Replier" : "Déplier"} ${row.name}`}
                    onClick={() => toggle(row.name)}
                  >
                    <ChevronRight className={cn("transition-transform", row.expanded && "rotate-90")} />
                  </Button>
                ) : (
                  <span className="size-7 shrink-0" />
                )}
                {row.is_group ? (
                  row.expanded ? (
                    <FolderOpen className="size-4 shrink-0 text-amber-600" />
                  ) : (
                    <Folder className="size-4 shrink-0 text-amber-600" />
                  )
                ) : (
                  <Tag className="size-4 shrink-0 text-brand-600" />
                )}
                <button
                  type="button"
                  className={cn("min-w-0 flex-1 truncate text-left text-sm", row.is_group ? "font-semibold" : "font-medium")}
                  onClick={() => (row.hasChildren && !searching ? toggle(row.name) : row.parent ? setEditing({ group: row }) : undefined)}
                >
                  <Highlight text={row.name} query={search} />
                </button>
                <span className="num shrink-0 t-meta text-muted-foreground" title="Articles actifs, sous-groupes compris">
                  {row.totalItems} article{row.totalItems > 1 ? "s" : ""}
                </span>
                <div className="flex shrink-0 items-center opacity-70 group-hover/row:opacity-100">
                  {row.is_group ? (
                    <Button variant="ghost" size="icon-sm" aria-label={`Ajouter un sous-groupe à ${row.name}`} onClick={() => setEditing({ group: null, parent: row.name })}>
                      <Plus />
                    </Button>
                  ) : null}
                  {row.parent ? (
                    <Button variant="ghost" size="icon-sm" aria-label={`Modifier ${row.name}`} onClick={() => setEditing({ group: row })}>
                      <Pencil />
                    </Button>
                  ) : (
                    <span className="size-7" />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="t-meta text-muted-foreground">
        <Folder className="mr-1 inline size-3.5 text-amber-600" /> Groupe parent : contient des sous-groupes.{" "}
        <Tag className="mr-1 ml-2 inline size-3.5 text-brand-600" /> Groupe final : contient les articles et sert de rayon sur le Store.
      </p>

      <GroupDialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        group={editing?.group ?? null}
        defaultParent={editing?.parent}
        groups={groups}
        onSubmit={async (payload) => {
          await api.saveItemGroup(payload);
          setEditing(undefined);
          if (payload.parent) setExpanded(new Set([...opened, payload.parent]));
          toast.success(payload.name ? "Groupe enregistré" : "Groupe créé");
          await mutate();
        }}
      />
    </div>
  );
}

function GroupDialog({
  open,
  onOpenChange,
  group,
  defaultParent,
  groups,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: CatalogItemGroup | null;
  defaultParent?: string;
  groups: readonly CatalogItemGroup[];
  onSubmit: (payload: { name?: string; item_group_name: string; parent: string; is_group: boolean }) => Promise<void>;
}) {
  const parents = parentGroupOptions(groups).filter((option) => option.value !== group?.name);
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [isGroup, setIsGroup] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [openedFor, setOpenedFor] = useState<string | undefined>(undefined);

  const target = open ? (group?.name ?? `new:${defaultParent ?? ""}`) : undefined;
  if (target !== openedFor) {
    setOpenedFor(target);
    if (open) {
      setName(group?.name || "");
      setParent(group?.parent || defaultParent || parents[parents.length - 1]?.value || "");
      setIsGroup(group?.is_group || false);
      setError("");
    }
  }

  const canSave = Boolean(name.trim() && parent) && !pending;
  const submit = async () => {
    if (!canSave) return;
    setPending(true);
    setError("");
    try {
      await onSubmit({ name: group?.name, item_group_name: name.trim(), parent, is_group: isGroup });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm:max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{group ? `Groupe ${group.name}` : "Nouveau groupe"}</DialogTitle>
            <DialogDescription>Les articles se rangent dans les groupes finaux, qui servent aussi de rayons sur le Store.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGroup className="gap-3">
              {error ? (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertTitle>Groupe non enregistré</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Field>
                <FieldLabel htmlFor="group-name">Nom</FieldLabel>
                <Input id="group-name" value={name} autoFocus onChange={(event) => setName(event.target.value)} />
                {group && name.trim() !== group.name ? <FieldDescription>Le renommage met à jour tous les articles du groupe.</FieldDescription> : null}
              </Field>
              <Field>
                <FieldLabel>Groupe parent</FieldLabel>
                <FormSelect aria-label="Groupe parent" value={parent} onChange={setParent} options={parents} />
              </Field>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={isGroup} onCheckedChange={(value) => setIsGroup(Boolean(value))} aria-label="Groupe parent" />
                Groupe parent (contient des sous-groupes, pas d’articles)
              </label>
            </FieldGroup>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSave}>
              {pending ? <Spinner /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Marques -------------------------------------------------------------------

function BrandsTab() {
  const { data, mutate, isLoading } = useBrands();
  const { mutate: mutateOptions } = useCatalogOptions();
  const api = useCatalogMutations();
  const brands = data?.message ?? [];
  const [editing, setEditing] = useState<BrandRow | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const open = (brand: BrandRow | null) => {
    setEditing(brand);
    setName(brand?.name || "");
    setError("");
  };

  const submit = async () => {
    if (!name.trim() || pending) return;
    setPending(true);
    setError("");
    try {
      await api.saveBrand({ name: editing?.name, brand: name.trim() });
      toast.success(editing ? "Marque enregistrée" : "Marque créée");
      setEditing(undefined);
      await Promise.all([mutate(), mutateOptions()]);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const columns: Array<DataTableColumn<BrandRow>> = [
    { id: "name", header: "Marque", cell: (row) => <span className="font-medium">{row.name}</span>, sortValue: (row) => row.name },
    { id: "count", header: "Articles actifs", width: "140px", align: "right", numeric: true, sortValue: (row) => row.item_count, cell: (row) => row.item_count },
    {
      id: "actions",
      header: "",
      width: "56px",
      align: "right",
      cell: (row) => (
        <Button variant="ghost" size="icon" aria-label={`Renommer ${row.name}`} onClick={() => open(row)}>
          <Pencil />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => open(null)}>
          <Plus /> Nouvelle marque
        </Button>
      </div>
      <DataTable
        label="Marques"
        columns={columns}
        rows={brands}
        rowKey={(row) => row.name}
        isLoading={isLoading && !brands.length}
        empty={<EmptyState icon={Tag} title="Aucune marque" description="Ajoutez les marques de vos fournisseurs." />}
      />
      <Dialog open={editing !== undefined} onOpenChange={(value) => !value && setEditing(undefined)}>
        <DialogContent size="sm:max-w-sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <DialogHeader>
              <DialogTitle>{editing ? `Renommer ${editing.name}` : "Nouvelle marque"}</DialogTitle>
              <DialogDescription>{editing ? "Les articles de la marque suivent le nouveau nom." : "La marque sera proposée sur les fiches articles."}</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <FieldGroup className="gap-3">
                {error ? (
                  <Alert variant="destructive">
                    <AlertTriangle />
                    <AlertTitle>Marque non enregistrée</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
                <Field>
                  <FieldLabel htmlFor="brand-name">Nom</FieldLabel>
                  <Input id="brand-name" value={name} autoFocus onChange={(event) => setName(event.target.value)} />
                </Field>
              </FieldGroup>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(undefined)}>
                Annuler
              </Button>
              <Button type="submit" disabled={!name.trim() || pending}>
                {pending ? <Spinner /> : null}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Rayons Store --------------------------------------------------------------

function StoreTab() {
  const { data, error, mutate } = useStoreSettings();
  const settings = data?.message;
  if (error) {
    return (
      <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <AlertTriangle className="size-4 shrink-0" />
        {apiErrorMessage(error)}
      </p>
    );
  }
  if (!settings) {
    return (
      <div className="grid min-h-40 place-items-center">
        <Spinner />
      </div>
    );
  }
  return <StoreForm key={JSON.stringify(settings)} settings={settings} onSaved={(saved) => void mutate({ message: saved }, { revalidate: false })} />;
}

function StoreForm({ settings, onSaved }: { settings: StoreSettings; onSaved: (settings: StoreSettings) => void }) {
  const api = useCatalogMutations();
  const usesDefault = settings.store_groups.length === 0;
  const [groups, setGroups] = useState<string[]>(usesDefault ? settings.effective_store_groups : settings.store_groups);
  const [featured, setFeatured] = useState<string[]>(settings.featured_groups);
  const [railLimit, setRailLimit] = useState(String(settings.rail_limit || 8));
  const [flags, setFlags] = useState({
    show_categories: settings.show_categories,
    show_promotions: settings.show_promotions,
    show_featured: settings.show_featured,
  });
  const [pending, setPending] = useState(false);
  const [addGroup, setAddGroup] = useState("");

  const available = settings.leaf_groups.filter((name) => !groups.includes(name));
  const limit = Number(railLimit);
  const validLimit = Number.isInteger(limit) && limit >= 1 && limit <= 24;

  const remove = (name: string) => {
    setGroups((current) => current.filter((other) => other !== name));
    setFeatured((current) => current.filter((other) => other !== name));
  };
  const toggleFeatured = (name: string, checked: boolean) =>
    setFeatured((current) => (checked ? groups.filter((group) => group === name || current.includes(group)) : current.filter((other) => other !== name)));

  const submit = async () => {
    setPending(true);
    try {
      const saved = await api.saveStoreSettings({
        store_groups: groups,
        featured_groups: groups.filter((name) => featured.includes(name)),
        rail_limit: limit,
        ...flags,
      });
      toast.success("Rayons du Store enregistrés");
      onSaved(saved);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Rayons et ordre d’affichage</CardTitle>
          <CardDescription>
            {usesDefault
              ? "Aucun rayon configuré : le Store affiche les rayons par défaut ci-dessous. Enregistrez pour figer cette liste."
              : "Les rayons « vedette » ont un carrousel sur l’accueil du Store."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 pt-4">
          {groups.length === 0 ? <EmptyState icon={Store} title="Aucun rayon" description="Ajoutez au moins un groupe d’articles." /> : null}
          <ol className="divide-y rounded-lg border" aria-label="Rayons du Store">
            {groups.map((name, index) => (
              <li key={name} className="flex items-center gap-2 px-3 py-1.5">
                <span className="num w-6 t-meta text-muted-foreground">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                <span className="flex items-center gap-1.5 t-meta text-muted-foreground">
                  <Checkbox checked={featured.includes(name)} onCheckedChange={(value) => toggleFeatured(name, Boolean(value))} aria-label={`Vedette : ${name}`} />
                  <span aria-hidden="true" className="flex items-center gap-1">
                    <Star className="size-3.5" /> Vedette
                  </span>
                </span>
                <Button variant="ghost" size="icon-sm" aria-label={`Monter ${name}`} disabled={index === 0} onClick={() => setGroups((current) => moveItem(current, index, -1))}>
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Descendre ${name}`}
                  disabled={index === groups.length - 1}
                  onClick={() => setGroups((current) => moveItem(current, index, 1))}
                >
                  <ArrowDown />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Retirer ${name}`} onClick={() => remove(name)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ol>
          {available.length ? (
            <div className="flex gap-2 pt-1">
              <FormSelect
                aria-label="Ajouter un rayon"
                value={addGroup}
                onChange={setAddGroup}
                options={[{ value: "", label: "Ajouter un rayon…" }, ...available.map((name) => ({ value: name, label: name }))]}
              />
              <Button
                variant="outline"
                disabled={!addGroup}
                onClick={() => {
                  setGroups((current) => [...current, addGroup]);
                  setAddGroup("");
                }}
              >
                <Plus /> Ajouter
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Accueil du Store</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {(
            [
              ["show_categories", "Afficher les rayons"],
              ["show_promotions", "Afficher les promotions"],
              ["show_featured", "Afficher les rayons vedettes"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={flags[key]} onCheckedChange={(value) => setFlags((current) => ({ ...current, [key]: Boolean(value) }))} aria-label={label} />
              {label}
            </label>
          ))}
          <Field>
            <FieldLabel htmlFor="rail-limit">Articles par carrousel</FieldLabel>
            <Input id="rail-limit" inputMode="numeric" value={railLimit} onChange={(event) => setRailLimit(event.target.value)} className="num w-24" />
            {!validLimit ? <FieldDescription className="text-red-700">Entre 1 et 24.</FieldDescription> : null}
          </Field>
          <Button className="w-full" onClick={() => void submit()} disabled={pending || !validLimit || groups.length === 0}>
            {pending ? <Spinner /> : <Save />}
            Enregistrer
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
