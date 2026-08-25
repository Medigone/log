import { describe, expect, it } from "vitest";
import { resolveDistributionRole } from "@/features/auth/useDistributionRole";

describe("resolveDistributionRole", () => {
  it("donne la priorité au responsable", () => expect(resolveDistributionRole(["Livreur", "Responsable"])).toBe("responsable"));
  it("reconnaît chaque rôle opérationnel", () => {
    expect(resolveDistributionRole(["Préparateur"])).toBe("preparateur");
    expect(resolveDistributionRole(["Planificateur"])).toBe("planificateur");
    expect(resolveDistributionRole(["Livreur"])).toBe("livreur");
    expect(resolveDistributionRole(["Caissier"])).toBe("caissier");
  });
  it("refuse un rôle non configuré", () => expect(resolveDistributionRole(["Sales User"])).toBe("none"));
});
