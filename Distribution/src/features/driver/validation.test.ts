import { describe, expect, it } from "vitest";
import { estimatedCollectableAmount, validateStopForm } from "@/features/driver/validation";

const valid = {
  outcome: "delivered" as const,
  quantities: {},
  failureReason: "",
  comment: "",
  evidence: { latitude: 36.75, longitude: 3.04, photoData: "data:image/jpeg;base64,AA==" },
  paymentEnabled: false,
  payment: { method: "cash" as const },
  amountToCollect: 5000,
  requiresCustomerGeolocation: false,
};

describe("validateStopForm", () => {
  it("refuse une livraison sans GPS", () => {
    expect(validateStopForm({ ...valid, evidence: { photoData: valid.evidence.photoData } })).toContain("GPS");
  });
  it("refuse les coordonnées GPS 0,0", () => {
    expect(validateStopForm({ ...valid, evidence: { ...valid.evidence, latitude: 0, longitude: 0 } })).toContain("GPS");
  });
  it("accepte une livraison avec GPS et photo", () => expect(validateStopForm(valid)).toBe(""));
  it("exige 50 m ou mieux pour géolocaliser un client manquant", () => {
    expect(validateStopForm({
      ...valid,
      requiresCustomerGeolocation: true,
      evidence: { ...valid.evidence, accuracy: 51 },
    })).toContain("50 m");
    expect(validateStopForm({
      ...valid,
      requiresCustomerGeolocation: true,
      evidence: { ...valid.evidence, accuracy: 50 },
    })).toBe("");
  });
  it("n'impose pas le seuil client pour un échec", () => {
    expect(validateStopForm({
      ...valid,
      requiresCustomerGeolocation: true,
      outcome: "failed",
      failureReason: "Client absent",
      comment: "Porte fermée",
      evidence: { latitude: 36.75, longitude: 3.04, accuracy: 120 },
    })).toBe("");
  });
  it("exige le nom avec une signature", () => {
    expect(validateStopForm({ ...valid, evidence: { latitude: 36.75, longitude: 3.04, signatureData: "data:image/png;base64,AA==" } })).toContain("signataire");
  });
  it("exige motif et commentaire pour un échec", () => {
    expect(validateStopForm({ ...valid, outcome: "failed", evidence: { latitude: 36.75, longitude: 3.04 } })).toContain("motif");
  });
  it("refuse un chèque sans photo ni date", () => {
    expect(validateStopForm({ ...valid, paymentEnabled: true, payment: { method: "cheque", amount: 1000 } })).toContain("chèque");
  });
  it("autorise un encaissement supérieur au BL pour une affectation ultérieure", () => {
    expect(validateStopForm({ ...valid, paymentEnabled: true, payment: { method: "cash", amount: 6000 } })).toBe("");
  });
  it("recalcule le montant à encaisser sur les quantités livrées en partiel", () => {
    const stop = {
      amountToCollect: 10000,
      items: [
        { name: "ROW-1", quantity: 10, remainingQuantity: 10, rate: 800, amount: 8000 },
        { name: "ROW-2", quantity: 4, remainingQuantity: 4, rate: 500, amount: 2000 },
      ],
    };
    expect(estimatedCollectableAmount(stop, "delivered", {})).toBe(10000);
    expect(estimatedCollectableAmount(stop, "partial", { "ROW-1": 5, "ROW-2": 0 })).toBe(4000);
    expect(estimatedCollectableAmount(stop, "partial", { "ROW-1": 10, "ROW-2": 4 })).toBe(10000);
    expect(estimatedCollectableAmount(stop, "failed", { "ROW-1": 5 })).toBe(0);
  });
});
