import { describe, expect, it } from "vitest";
import {
  maintenanceProximity,
  personInitials,
  relativeDayLabel,
  summarizeVehicleDocuments,
  vehicleMetaLine,
} from "@/features/fleet/vehicle-details/vehicleDetailsModel";
import { formatLongDate } from "@/shared/format";

describe("vehicleDetailsModel", () => {
  it("calcule le délai d’entretien à partir de la date réelle", () => {
    expect(maintenanceProximity("2026-08-31", "2026-08-29")).toEqual({
      days: 2,
      label: "Dans 2 jours",
      tone: "warning",
    });
    expect(maintenanceProximity("2026-08-29", "2026-08-29")).toEqual({
      days: 0,
      label: "Aujourd’hui",
      tone: "warning",
    });
    expect(maintenanceProximity("2026-08-26", "2026-08-29")).toEqual({
      days: -3,
      label: "En retard de 3 jours",
      tone: "danger",
    });
    expect(maintenanceProximity("2026-12-01", "2026-08-29")?.tone).toBe("success");
    expect(maintenanceProximity(null)).toBeNull();
  });

  it("formate une date longue française", () => {
    expect(formatLongDate("2026-08-31")).toBe("31 août 2026");
  });

  it("compte les documents par alerte réelle", () => {
    expect(
      summarizeVehicleDocuments([
        { key: "a", label: "A", alert: "valid" },
        { key: "b", label: "B", alert: "expiring" },
        { key: "c", label: "C", alert: "expired" },
        { key: "d", label: "D", alert: "missing" },
      ]),
    ).toEqual({ valid: 1, expiring: 1, blocked: 2, total: 4 });
  });

  it("extrait les initiales et la ligne de métadonnées", () => {
    expect(personInitials("Salim Livreur")).toBe("SL");
    expect(vehicleMetaLine({ fuelType: "Diesel", company: "Modern Pharma" })).toBe("Diesel · Modern Pharma");
    expect(vehicleMetaLine({ fuelType: null, company: "Modern Pharma" })).toBe("Modern Pharma");
    expect(relativeDayLabel(1)).toBe("Dans 1 jour");
  });
});
