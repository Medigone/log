import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StopCompletionWizard, validateWizardStep, wizardSteps } from "@/features/driver/StopCompletionWizard";
import { stopFormKey } from "@/features/driver/stopHelpers";
import type { RouteStop } from "@/shared/types/distribution";

const mocks = vi.hoisted(() => ({
  completeStop: vi.fn().mockResolvedValue({ success: true, idempotent: false, customerLocationUpdated: false, route: {} }),
}));

vi.mock("leaflet", () => ({ divIcon: (options: unknown) => options }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="evidence-map">{children}</div>,
  Marker: () => null,
  Circle: () => null,
  TileLayer: () => null,
  useMap: () => ({ setView: vi.fn() }),
}));

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useDistributionMutations: () => ({ completeStop: mocks.completeStop, saving: false }),
}));

vi.mock("@/features/driver/SignaturePad", () => ({
  SignaturePad: ({ onChange }: { onChange: (data?: string) => void }) => (
    <div data-testid="signature-pad">
      <button type="button" onClick={() => onChange("data:image/png;base64,AA==")}>
        Signer
      </button>
    </div>
  ),
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
    expect(wizardSteps("delivered")).toEqual(["outcome", "evidence", "payment"]);
    expect(wizardSteps("partial")).toEqual(["outcome", "detail", "evidence", "payment"]);
    expect(wizardSteps("failed")).toEqual(["outcome", "detail", "evidence"]);
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

  it("n’impose ni GPS, ni photo, ni signature à cette étape", () => {
    expect(validateWizardStep("outcome", base)).toBe("");
    expect(validateWizardStep("evidence", { ...base, evidence: {} })).toBe("");
    expect(
      validateWizardStep("evidence", {
        ...base,
        evidence: { signatureData: "data:image/png;base64,AA==" },
      }),
    ).toBe("");
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

  it("lance le GPS à l’ouverture et enchaîne les étapes jusqu’à l’encaissement sans récap", async () => {
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
    await user.click(screen.getByRole("button", { name: /livré en totalité/i }));
    expect(screen.getByText(/preuves de livraison/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continuer/i })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /continuer/i }));
    expect(screen.getByText(/montant suggéré/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /je n’encaisse rien maintenant/i })).toBeInTheDocument();
    expect(screen.getByText(/déjà collecté/i)).toBeInTheDocument();
    expect(screen.getByText(/tout est prêt/i)).toBeInTheDocument();
    expect(screen.queryByText(/éléments manquants/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^signature$/i)).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /livraison partielle/i }));
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

  it("laisse Continuer actif sans signature ni photo, et n’affiche pas la signature comme manquante", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      stopFormKey("LIV-1", "DN-8"),
      JSON.stringify({
        requestId: "req-sig",
        outcome: "delivered",
        evidence: { ...validEvidence, signatureData: undefined, photoData: undefined },
        paymentEnabled: false,
      }),
    );
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
    await user.click(screen.getByRole("button", { name: /livré en totalité/i }));
    expect(screen.getByRole("button", { name: /continuer/i })).toBeEnabled();
    expect(screen.getByText(/vous pouvez continuer/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^facultative$/i)).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /continuer/i }));
    expect(screen.getByText(/tout est prêt/i)).toBeInTheDocument();
    expect(screen.queryByText(/éléments manquants/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^signature$/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /valider l’arrêt/i })).toBeEnabled();
  });
});
