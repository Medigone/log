import { describe, expect, it } from "vitest";
import { buildRouteLabelsHtml } from "@/features/planning/qrPrinting";
import type { DistributionRoute } from "@/shared/types/distribution";

describe("buildRouteLabelsHtml", () => {
  it("crée une étiquette par paquet et protège les textes du BL", () => {
    const route = {
      name: "LIV-1",
      date: "2026-08-26",
      lifecycle: "Brouillon",
      revision: 1,
      publishedRevision: 0,
      acknowledgedRevision: 0,
      acknowledged: false,
      needsReview: false,
      totalQuantity: 1,
      totalAmount: 0,
      alerts: [],
      routing: { status: "not_calculated", provider: "openrouteservice", profile: "driving-car", optimizationEnabled: false },
      stops: [{
        deliveryNote: "DN-1",
        customer: "CUST-1",
        customerName: "Client <Test>",
        totalQuantity: 1,
        amountToCollect: 0,
        status: "Préparé",
        planningStatus: "Planifié",
        sequence: 1,
        qrCode: "/files/qr.png",
        packageCount: 2,
      }],
    } satisfies DistributionRoute;

    const html = buildRouteLabelsHtml(route);
    expect((html.match(/<section class="label">/g) || []).length).toBe(2);
    expect(html).toContain("Paquet");
    expect(html).toContain("1 / 2");
    expect(html).toContain("2 / 2");
    expect(html).toContain("Client &lt;Test&gt;");
    expect(html).not.toContain("Client <Test>");
  });
});
