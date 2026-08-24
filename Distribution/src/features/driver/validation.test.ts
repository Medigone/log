import { describe, expect, it } from "vitest";
import { validateStopForm } from "@/features/driver/validation";

const valid = {
  outcome: "delivered" as const,
  quantities: {},
  failureReason: "",
  comment: "",
  evidence: { latitude: 36.75, longitude: 3.04, photoData: "data:image/jpeg;base64,AA==" },
  paymentEnabled: false,
  payment: { method: "cash" as const },
  amountToCollect: 5000,
};

describe("validateStopForm", () => {
  it("refuse une livraison sans GPS", () => {
    expect(validateStopForm({ ...valid, evidence: { photoData: valid.evidence.photoData } })).toContain("GPS");
  });
  it("accepte une livraison avec GPS et photo", () => expect(validateStopForm(valid)).toBe(""));
  it("exige le nom avec une signature", () => {
    expect(validateStopForm({ ...valid, evidence: { latitude: 36.75, longitude: 3.04, signatureData: "data:image/png;base64,AA==" } })).toContain("signataire");
  });
  it("exige motif et commentaire pour un échec", () => {
    expect(validateStopForm({ ...valid, outcome: "failed", evidence: { latitude: 36.75, longitude: 3.04 } })).toContain("motif");
  });
  it("refuse un chèque sans photo ni date", () => {
    expect(validateStopForm({ ...valid, paymentEnabled: true, payment: { method: "cheque", amount: 1000 } })).toContain("chèque");
  });
  it("refuse un paiement supérieur au solde", () => {
    expect(validateStopForm({ ...valid, paymentEnabled: true, payment: { method: "cash", amount: 6000 } })).toContain("solde");
  });
});
