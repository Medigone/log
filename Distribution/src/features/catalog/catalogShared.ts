import { useEffect, useState } from "react";
import type { SelectOption } from "@/components/FilterSelect";
import { ruleValue, type CatalogItemGroup, type PricingRule } from "@/shared/api/catalog";
import { formatMoney } from "@/shared/format";

export const CATALOG_PAGE_SIZE = 25;

/** Valeur stabilisée après `delay` ms sans changement (recherche serveur). */
export function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Groupes où l'on peut ranger un article (les groupes parents ne portent pas d'articles). */
export function leafGroupOptions(groups: readonly CatalogItemGroup[] | undefined): SelectOption[] {
  return (groups || [])
    .filter((group) => !group.is_group)
    .map((group) => ({ value: group.name, label: group.parent ? `${group.name} · ${group.parent}` : group.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

export function parentGroupOptions(groups: readonly CatalogItemGroup[] | undefined): SelectOption[] {
  return (groups || []).filter((group) => group.is_group).map((group) => ({ value: group.name, label: group.name }));
}

export function namesToOptions(names: readonly string[] | undefined, empty?: string): SelectOption[] {
  const options = (names || []).map((name) => ({ value: name, label: name }));
  return empty === undefined ? options : [{ value: "", label: empty }, ...options];
}

/** Marge sur prix de vente : montant et taux sur le prix d'achat. */
export function marginOf(selling: number | null | undefined, buying: number | null | undefined) {
  if (selling == null || buying == null || buying <= 0) return null;
  const amount = selling - buying;
  return { amount, rate: (amount / buying) * 100 };
}

export function pageRange(start: number, count: number, total: number) {
  return { from: total ? start + 1 : 0, to: start + count };
}

export function ruleSummary(rule: PricingRule) {
  const value = ruleValue(rule);
  if (rule.rate_or_discount === "Discount Percentage") return `−${value} %`;
  if (rule.rate_or_discount === "Discount Amount") return `−${formatMoney(value)}`;
  return formatMoney(value);
}

export interface GroupRow extends CatalogItemGroup {
  depth: number;
}

/** Ordre de l'arbre (le serveur trie par `lft`) avec la profondeur de chaque groupe. */
export function groupRows(groups: readonly CatalogItemGroup[]): GroupRow[] {
  const depth = new Map<string, number>();
  return groups.map((group) => {
    const level = group.parent && depth.has(group.parent) ? (depth.get(group.parent) ?? 0) + 1 : 0;
    depth.set(group.name, level);
    return { ...group, depth: level };
  });
}

export interface TreeRow extends GroupRow {
  hasChildren: boolean;
  /** Articles du groupe et de tous ses sous-groupes. */
  totalItems: number;
  expanded: boolean;
  /** Le nom correspond à la recherche. */
  match: boolean;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

/** Noms de tous les groupes qui ont des sous-groupes (pour « Tout déplier »). */
export function expandableGroups(groups: readonly CatalogItemGroup[]) {
  return new Set(groups.map((group) => group.parent).filter((name): name is string => Boolean(name)));
}

/**
 * Lignes affichées de l'arbre des groupes.
 * Sans recherche : un groupe est visible si tous ses ancêtres sont dépliés.
 * Avec recherche (accents ignorés) : les groupes trouvés, leurs ancêtres (dépliés d'office)
 * et le contenu des groupes parents trouvés.
 */
export function visibleTree(groups: readonly CatalogItemGroup[], expanded: ReadonlySet<string>, query = ""): TreeRow[] {
  const rows = groupRows(groups);
  const byName = new Map(rows.map((row) => [row.name, row]));
  const parentOf = (name: string) => byName.get(name)?.parent ?? null;
  const ancestors = (name: string) => {
    const result: string[] = [];
    for (let parent = parentOf(name); parent && byName.has(parent); parent = parentOf(parent)) result.push(parent);
    return result;
  };

  const hasChildren = expandableGroups(groups);
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.is_group) continue;
    for (const name of [row.name, ...ancestors(row.name)]) totals.set(name, (totals.get(name) ?? 0) + row.item_count);
  }

  const term = normalize(query.trim());
  const matches = new Set(term ? rows.filter((row) => normalize(row.name).includes(term)).map((row) => row.name) : []);
  const opened = new Set(expanded);
  const shown = new Set<string>();
  if (term) {
    for (const name of matches) {
      shown.add(name);
      for (const parent of ancestors(name)) shown.add(parent);
    }
    for (const row of rows) {
      if (ancestors(row.name).some((parent) => matches.has(parent))) shown.add(row.name);
    }
  }

  const visible = rows.filter((row) => (term ? shown.has(row.name) : ancestors(row.name).every((parent) => opened.has(parent))));
  // En recherche, un groupe est déplié dès qu'un de ses enfants est affiché.
  const shownParents = new Set(visible.map((row) => row.parent).filter(Boolean));
  return visible.map((row) => ({
    ...row,
    hasChildren: hasChildren.has(row.name),
    totalItems: totals.get(row.name) ?? 0,
    expanded: term ? shownParents.has(row.name) : opened.has(row.name),
    match: matches.has(row.name),
  }));
}

export function moveItem<T>(list: readonly T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (target < 0 || target >= list.length) return [...list];
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
