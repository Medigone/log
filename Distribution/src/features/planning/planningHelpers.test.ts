import { describe, expect, it } from "vitest";
import { canReprogramAssignment, matchesIndependentDateFilters, nextFreeSlot } from "./planningHelpers";
import type { DistributionRoute } from "@/shared/types/distribution";

function route(overrides: Partial<DistributionRoute> = {}): DistributionRoute {
  return {
    name: "LIV-1",
    date: "2026-09-05",
    lifecycle: "Brouillon",
    driver: "DRV-1",
    vehicle: "VEH-1",
    plannedStart: "2026-09-05T08:00:00",
    plannedEnd: "2026-09-05T12:00:00",
    ...overrides,
  } as DistributionRoute;
}

describe("matchesIndependentDateFilters", () => {
  it("filtre la date BL sans tenir compte de la date de tournée", () => {
    expect(
      matchesIndependentDateFilters("2026-09-06", "2026-09-07", "2026-09-06", "2026-09-06", "", ""),
    ).toBe(true);
    expect(
      matchesIndependentDateFilters("2026-09-05", "2026-09-06", "2026-09-06", "2026-09-06", "", ""),
    ).toBe(false);
  });

  it("filtre la date de livraison sans tenir compte de la date BL", () => {
    expect(
      matchesIndependentDateFilters("2026-09-06", "2026-09-07", "", "", "2026-09-07", "2026-09-07"),
    ).toBe(true);
    expect(
      matchesIndependentDateFilters("2026-09-07", "2026-09-06", "", "", "2026-09-07", "2026-09-07"),
    ).toBe(false);
  });
});

describe("canReprogramAssignment", () => {
  it("refuse un BL déjà en cours, terminé ou en exception", () => {
    expect(canReprogramAssignment("Publié")).toBe(true);
    expect(canReprogramAssignment("En retard")).toBe(true);
    expect(canReprogramAssignment("En cours")).toBe(false);
    expect(canReprogramAssignment("Terminé")).toBe(false);
    expect(canReprogramAssignment("Exception")).toBe(false);
  });
});

describe("nextFreeSlot", () => {
  it("keeps 08:00–12:00 when the driver is free", () => {
    expect(nextFreeSlot("2026-09-05", [], "DRV-1", "VEH-1")).toEqual({
      plannedStart: "2026-09-05T08:00:00",
      plannedEnd: "2026-09-05T12:00:00",
    });
  });

  it("opens 12:00–16:00 when the morning slot is taken", () => {
    expect(nextFreeSlot("2026-09-05", [route()], "DRV-1", "VEH-1")).toEqual({
      plannedStart: "2026-09-05T12:00:00",
      plannedEnd: "2026-09-05T16:00:00",
    });
  });

  it("skips two occupied windows", () => {
    const occupied = [
      route(),
      route({ name: "LIV-2", plannedStart: "2026-09-05T12:00:00", plannedEnd: "2026-09-05T16:00:00" }),
    ];
    expect(nextFreeSlot("2026-09-05", occupied, "DRV-1", "VEH-1")).toEqual({
      plannedStart: "2026-09-05T16:00:00",
      plannedEnd: "2026-09-05T20:00:00",
    });
  });

  it("ignores another driver's routes", () => {
    expect(nextFreeSlot("2026-09-05", [route({ driver: "DRV-2", vehicle: "VEH-2" })], "DRV-1", "VEH-1")).toEqual({
      plannedStart: "2026-09-05T08:00:00",
      plannedEnd: "2026-09-05T12:00:00",
    });
  });

  it("treats the same vehicle as occupied even with another driver", () => {
    expect(nextFreeSlot("2026-09-05", [route({ driver: "DRV-2" })], "DRV-1", "VEH-1")).toEqual({
      plannedStart: "2026-09-05T12:00:00",
      plannedEnd: "2026-09-05T16:00:00",
    });
  });
});
