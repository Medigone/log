import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DepartureBoard } from "@/features/driver/DepartureBoard";
import type { DistributionRoute, RouteStop } from "@/shared/types/distribution";

function stop(overrides: Partial<RouteStop> & Pick<RouteStop, "deliveryNote" | "customerName">): RouteStop {
  return {
    customer: "C-2",
    customerGpsStatus: "known",
    requiresCustomerGeolocation: false,
    address: "12 rue des Oliviers",
    totalQuantity: 12,
    amountCollected: 0,
    amountToCollect: 11232,
    netTotal: 9600,
    grandTotal: 11232,
    taxes: [{ description: "VAT 17% @ 17.0", rate: 17, taxAmount: 1632 }],
    payments: [],
    invoiceStatus: "Non créée",
    status: "Préparé",
    planningStatus: "Planifié",
    sequence: 1,
    items: [
      {
        name: "ROW-1",
        itemCode: "Article 2",
        itemName: "Biomil 2 400 Gr",
        quantity: 12,
        deliveredQuantity: 0,
        remainingQuantity: 12,
        rate: 800,
        amount: 9600,
      },
    ],
    ...overrides,
  };
}

const route: DistributionRoute = {
  name: "LIV-1",
  date: "2026-08-28",
  lifecycle: "Publiée",
  revision: 3,
  publishedRevision: 3,
  acknowledgedRevision: 0,
  acknowledged: false,
  needsReview: false,
  totalQuantity: 12,
  totalCollected: 0,
  totalAmount: 11232,
  alerts: [],
  routing: { status: "not_calculated", provider: "openrouteservice", profile: "driving-car", optimizationEnabled: false },
  stock: { status: "À charger", loadedQuantity: 0, deliveredQuantity: 0, remainingQuantity: 0, returnedQuantity: 0, lines: [] },
  cash: {
    routeId: "LIV-1",
    routeLifecycle: "Publiée",
    status: "Sans encaissement",
    declaredCash: 0,
    declaredCheques: 0,
    declaredTotal: 0,
    countedTotal: 0,
    validatedTotal: 0,
    payments: [],
  },
  stops: [stop({ deliveryNote: "MAT-DN-2026-00003", customerName: "CLIENT 2" })],
};

describe("DepartureBoard", () => {
  it("ouvre l’aperçu avec les montants TTC du bon, taxes comprises", async () => {
    const user = userEvent.setup();
    render(
      <DepartureBoard
        route={route}
        verified={[]}
        saving={false}
        onToggle={vi.fn()}
        onAcknowledge={vi.fn()}
        onRequestLoad={vi.fn()}
        onRequestStart={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /voir les articles de mat-dn-2026-00003/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /client 2/i })).toBeInTheDocument();
    expect(screen.getByText("Biomil 2 400 Gr")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText(/12 articles/i)).toBeInTheDocument();
    expect(screen.getByText("Sous-total")).toBeInTheDocument();
    expect(screen.getByText("TVA")).toBeInTheDocument();
    expect(screen.queryByText("VAT 17% @ 17.0")).not.toBeInTheDocument();
    expect(screen.getAllByText(/9[\s\u00a0]?600 DZD/).length).toBeGreaterThan(0);
    expect(screen.getByText(/1[\s\u00a0]?632 DZD/)).toBeInTheDocument();
    expect(screen.getByText(/11[\s\u00a0]?232 DZD/)).toBeInTheDocument();
  });

  it("n’utilise pas l’icône colis pour cocher le bon", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <DepartureBoard
        route={{ ...route, acknowledged: true }}
        verified={[]}
        saving={false}
        onToggle={onToggle}
        onAcknowledge={vi.fn()}
        onRequestLoad={vi.fn()}
        onRequestStart={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /voir les articles de mat-dn-2026-00003/i }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("place les restants en tête et garde le chargement désactivé", () => {
    render(
      <DepartureBoard
        route={{
          ...route,
          acknowledged: true,
          stops: [
            stop({ deliveryNote: "DN-1", customerName: "Client A", sequence: 1, commune: "Oran", wilaya: "Oran" }),
            stop({ deliveryNote: "DN-2", customerName: "Client B", sequence: 2, totalQuantity: 9, commune: "Bir El Djir", wilaya: "Oran" }),
          ],
        }}
        verified={["DN-1"]}
        saving={false}
        onToggle={vi.fn()}
        onAcknowledge={vi.fn()}
        onRequestLoad={vi.fn()}
        onRequestStart={vi.fn()}
      />,
    );

    expect(screen.getByText(/restants d’abord/i)).toBeInTheDocument();
    expect(screen.getByText("Bir El Djir · Oran")).toBeInTheDocument();
    expect(screen.getByText(/1 contrôlé/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /charger le véhicule/i })).toBeDisabled();
    expect(screen.getByText(/débloqué après le dernier bon/i)).toBeInTheDocument();
  });
});
