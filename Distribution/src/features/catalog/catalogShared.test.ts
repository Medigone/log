import { describe, expect, it } from "vitest";
import { groupRows, leafGroupOptions, marginOf, moveItem, ruleSummary, visibleTree } from "@/features/catalog/catalogShared";

const groups = [
  { name: "Tous", parent: null, is_group: true, item_count: 0 },
  { name: "Parapharmacie", parent: "Tous", is_group: true, item_count: 0 },
  { name: "Visage", parent: "Parapharmacie", is_group: false, item_count: 4 },
];

describe("catalogShared", () => {
  it("ne propose que les groupes finaux pour ranger un article", () => {
    expect(leafGroupOptions(groups)).toEqual([{ value: "Visage", label: "Visage · Parapharmacie" }]);
  });

  it("calcule la profondeur de l’arbre des groupes", () => {
    expect(groupRows(groups).map((row) => row.depth)).toEqual([0, 1, 2]);
  });

  it("n’affiche que les branches dépliées et cumule les articles", () => {
    const tree = [
      ...groups,
      { name: "Nutrition", parent: "Tous", is_group: true, item_count: 0 },
      { name: "Crème brûlée", parent: "Nutrition", is_group: false, item_count: 2 },
    ];
    expect(visibleTree(tree, new Set(["Tous"])).map((row) => [row.name, row.expanded, row.totalItems])).toEqual([
      ["Tous", true, 6],
      ["Parapharmacie", false, 4],
      ["Nutrition", false, 2],
    ]);
    expect(visibleTree(tree, new Set(["Tous", "Nutrition"])).map((row) => row.name)).toContain("Crème brûlée");
  });

  it("recherche sans accents en dépliant les ancêtres", () => {
    const tree = [...groups, { name: "Crème brûlée", parent: "Parapharmacie", is_group: false, item_count: 1 }];
    const rows = visibleTree(tree, new Set(), "creme");
    expect(rows.map((row) => row.name)).toEqual(["Tous", "Parapharmacie", "Crème brûlée"]);
    expect(rows.filter((row) => row.match).map((row) => row.name)).toEqual(["Crème brûlée"]);
    expect(rows[1].expanded).toBe(true);
    // Un groupe parent trouvé montre tout son contenu.
    expect(visibleTree(tree, new Set(), "parapharm").map((row) => row.name)).toEqual(["Tous", "Parapharmacie", "Visage", "Crème brûlée"]);
  });

  it("calcule la marge sur le prix d’achat", () => {
    expect(marginOf(1200, 1000)).toEqual({ amount: 200, rate: 20 });
    expect(marginOf(1200, null)).toBeNull();
  });

  it("déplace un rayon sans sortir de la liste", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });

  it("résume une promotion", () => {
    const base = { discount_percentage: 10, discount_amount: 50, rate: 900 };
    expect(ruleSummary({ ...base, rate_or_discount: "Discount Percentage" } as never)).toBe("−10 %");
    expect(ruleSummary({ ...base, rate_or_discount: "Rate" } as never)).toMatch(/900/);
  });
});
