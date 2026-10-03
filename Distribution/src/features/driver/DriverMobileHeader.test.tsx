import { describe, expect, it } from "vitest";
import { driverHeaderTitle } from "@/features/driver/DriverMobileHeader";

describe("driverHeaderTitle", () => {
  it("titre d’onglet prioritaire", () => {
    expect(driverHeaderTitle({ tab: "map", showingList: true, showDetail: false })).toBe("Carte");
    expect(driverHeaderTitle({ tab: "scanner", showingList: false, showDetail: false })).toBe("Scanner");
    expect(driverHeaderTitle({ tab: "bilan", showingList: false, showDetail: false })).toBe("Bilan");
  });

  it("titre de tournée selon le contexte", () => {
    expect(driverHeaderTitle({ tab: "route", showingList: true, showDetail: false })).toBe("Tournées");
    expect(
      driverHeaderTitle({
        tab: "route",
        showingList: false,
        showDetail: true,
        routeName: "LIV-1",
        lifecycle: "Publiée",
      }),
    ).toBe("Contrôle départ");
    expect(
      driverHeaderTitle({
        tab: "route",
        showingList: false,
        showDetail: true,
        routeName: "LIV-1",
        lifecycle: "En cours",
      }),
    ).toBe("LIV-1");
  });
});
