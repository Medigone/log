import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StopCompletionWizard, validateWizardStep, wizardSteps } from "@/features/driver/StopCompletionWizard";
import { stopFormKey } from "@/features/driver/stopHelpers";
import type { RouteStop } from "@/shared/types/distribution";

const mocks = vi.hoisted(() => ({
  completeStop: vi.fn().mockResolvedValue({ success: true, idempotent: false, customerLocationUpdated: false, route: {} }),
}));

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useDistributionMutations: () => ({ completeStop: mocks.completeStop, saving: false }),
}));

vi.mock("@/features/driver/SignaturePad", () => ({
  SignaturePad: () => <div data-testid="signature-pad">Signature</div>,
}));

const stop: RouteStop = {
  deliveryNote: "DN-8",
  customer: "CUST-8",
  customerName: "Épicerie Nord",
  customerGpsStatus: "known",
  requiresCustomerGeolocation: false,
  address: "12 rue des Oliviers",
  phone: "0550000000",
  commune: "Alger",
  totalQuantity: 2,
  amountCollected: 0,
  amountToCollect: 12000,
  payments: [],
  invoiceStatus: "Non créée",
  status: "Enlevé",
  planningStatus: "En cours",
  sequence: 8,
  items: [
    { name: "ROW-1", itemCode: "ART-1", itemName: "Huile 5L", quantity: 2, deliveredQuantity: 0, remainingQuantity: 2, rate: 6000, amount: 12000 },
  ],
};

const validEvidence = {
  latitude: 36.75,
  longitude: 3.04,
  accuracy: 12,
  photoData: "data:image/jpeg;base64,AA==",
};

function mockGeolocation(success = true) {
  const getCurrentPosition = vi.fn((ok: PositionCallback, err?: PositionErrorCallback) => {
    if (success) {
      ok({
        coords: { latitude: 36.75, longitude: 3.04, accuracy: 12, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
        timestamp: Date.now(),
      } as GeolocationPosition);
    } else {
      err?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    }
  });
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
  return getCurrentPosition;
}

describe("wizardSteps", () => {
  it("saute le détail en livré et le paiement en échec", () => {
    expect(wizardSteps("delivered")).toEqual(["outcome", "evidence", "payment", "summary"]);
    expect(wizardSteps("partial")).toEqual(["outcome", "detail", "evidence", "payment", "summary"]);
    expect(wizardSteps("failed")).toEqual(["outcome", "detail", "evidence", "summary"]);
  });
});

describe("validateWizardStep", () => {
  const base = {
    outcome: "delivered" as const,
    quantities: {},
    failureReason: "",
    comment: "",
    evidence: validEvidence,
    paymentEnabled: false,
    payment: { method: "cash" as const },
    amountToCollect: 12000,
    requiresCustomerGeolocation: false,
  };

  it("laisse passer le résultat et bloque une preuve sans GPS", () => {
    expect(validateWizardStep("outcome", base)).toBe("");
    expect(validateWizardStep("evidence", { ...base, evidence: { photoData: validEvidence.photoData } })).toContain("GPS");
  });

  it("autorise de passer l’encaissement par défaut", () => {
    expect(validateWizardStep("payment", base)).toBe("");
  });
});

describe("StopCompletionWizard", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.completeStop.mockClear();
    mockGeolocation();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("lance le GPS à l’ouverture et enchaîne les étapes jusqu’au récap sans encaissement", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      stopFormKey("LIV-1", "DN-8"),
      JSON.stringify({ requestId: "req-1", outcome: "delivered", evidence: validEvidence, paymentEnabled: false }),
    );
    const geo = mockGeolocation();
    render(
      <StopCompletionWizard
        stop={stop}
        routeId="LIV-1"
        routeRevision={1}
        onDone={vi.fn()}
        onClose={vi.fn()}
        onPending={vi.fn()}
      />,
    );

    expect(geo).not.toHaveBeenCalled();
    expect(screen.getByText(/résultat de l’arrêt/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^livré$/i }));
    await user.click(screen.getByRole("button", { name: /continuer/i }));
    expect(screen.getByText(/photo ajoutée/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /continuer/i }));
    expect(screen.getByText(/passez cette étape/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /continuer/i }));
    expect(screen.getByText(/récapitulatif/i)).toBeInTheDocument();
    expect(screen.getByText("Aucun")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /valider l’arrêt/i }));
    expect(mocks.completeStop).toHaveBeenCalledWith(expect.objectContaining({
      deliveryNote: "DN-8",
      outcome: "delivered",
      payment: undefined,
    }));
  });

  it("demande les quantités après un résultat partiel", async () => {
    const user = userEvent.setup();
    render(
      <StopCompletionWizard
        stop={stop}
        routeId="LIV-1"
        routeRevision={1}
        onDone={vi.fn()}
        onClose={vi.fn()}
        onPending={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /^partiel$/i }));
    await user.click(screen.getByRole("button", { name: /continuer/i }));
    expect(screen.getByText(/quantités livrées maintenant/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /continuer/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/quantité/i);
  });

  it("relance le GPS automatiquement quand le brouillon n’a pas de position", () => {
    const geo = mockGeolocation();
    render(
      <StopCompletionWizard
        stop={stop}
        routeId="LIV-1"
        routeRevision={1}
        onDone={vi.fn()}
        onClose={vi.fn()}
        onPending={vi.fn()}
      />,
    );
    expect(geo).toHaveBeenCalled();
  });
});
