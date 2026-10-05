import { describe, expect, it } from "vitest";
import type { ItemAnalyticsRow } from "@/shared/api/analytics";
import {
  alertDetail,
  EMPTY_FILTERS,
  filterItems,
  formatDelta,
  formatPercent,
  itemsCsv,
  presetRange,
  primaryAction,
  priorityActions,
} from "@/features/analytics/analyticsShared";

function row(overrides: Partial<ItemAnalyticsRow>) {
  return { item_code: "A", item_name: "Article", brand: null, quadrant: null, abc: null, alerts: [], impact: 0, ...overrides } as ItemAnalyticsRow;
}

describe("analyticsShared", () => {
  it("formate taux et variations", () => {
    expect(formatPercent(0.1234)).toBe("12,3 %");
    expect(formatPercent(null)).toBe("—");
    expect(formatDelta(0.126)).toBe("+13 %");
    expect(formatDelta(-0.5)).toBe("-50 %");
    expect(formatDelta(null)).toBeNull();
  });

  it("calcule les périodes rapides", () => {
    const today = new Date(2026, 9, 5);
    expect(presetRange("30", today)).toEqual({ from: "2026-09-06", to: "2026-10-05" });
    expect(presetRange("year", today)).toEqual({ from: "2026-01-01", to: "2026-10-05" });
  });

  it("filtre par recherche, quadrant, classe et alerte", () => {
    const rows = [
      row({ item_code: "A", item_name: "Lait", quadrant: "star", abc: "A" }),
      row({ item_code: "B", item_name: "Savon", quadrant: "poids_mort", abc: "C", alerts: [{ code: "negative_margin", tone: "danger", impact: 10, value: null }] }),
      row({ item_code: "C", item_name: "Crème", alerts: [{ code: "estimated_cost", tone: "neutral", impact: 0, value: null }] }),
    ];
    expect(filterItems(rows, { ...EMPTY_FILTERS, search: "sav" }).map((r) => r.item_code)).toEqual(["B"]);
    expect(filterItems(rows, { ...EMPTY_FILTERS, quadrant: "star" }).map((r) => r.item_code)).toEqual(["A"]);
    expect(filterItems(rows, { ...EMPTY_FILTERS, abc: "C" }).map((r) => r.item_code)).toEqual(["B"]);
    expect(filterItems(rows, { ...EMPTY_FILTERS, alert: "any" }).map((r) => r.item_code)).toEqual(["B"]);
  });

  it("priorise par impact et propose l'action de l'alerte la plus coûteuse", () => {
    const rows = [
      row({ item_code: "A", impact: 100, alerts: [{ code: "discount", tone: "info", impact: 100, value: 0.15 }] }),
      row({ item_code: "B", impact: 900, alerts: [
        { code: "low_cover", tone: "warning", impact: 200, value: 3 },
        { code: "overstock", tone: "warning", impact: 700, value: 200 },
      ] }),
      row({ item_code: "C", quadrant: "pepite" }),
    ];
    expect(priorityActions(rows).map((r) => r.item_code)).toEqual(["B", "A"]);
    expect(primaryAction(rows[1])).toBe("Suspendre les achats et pousser les ventes");
    expect(primaryAction(rows[2])).toBe("Pousser : promo, commerciaux, Store");
    expect(alertDetail({ code: "dormant", tone: "danger", impact: 5000, value: null })).toMatch(/^Jamais vendu/);
  });

  it("exporte un CSV séparé par des points-virgules", () => {
    const csv = itemsCsv([row({ item_code: "A", item_name: "Lait; 1er âge", margin: 12.5 } as Partial<ItemAnalyticsRow>)]);
    const [header, line] = csv.split("\n");
    expect(header.startsWith("Code;Article;")).toBe(true);
    expect(line).toContain('"Lait; 1er âge"');
    expect(line).toContain("12,5");
  });
});
