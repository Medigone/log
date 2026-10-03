import { describe, expect, it } from "vitest";
import { BULK_CLEAR, bulkChanges, changedFields, customersToCsv, parseGps } from "@/features/customers/customerShared";
import type { CustomerRow } from "@/shared/api/customers";

describe("customerShared", () => {
  it("ne garde que les champs modifiés, y compris les tableaux", () => {
    const initial = { phone: "0550", key_account: false, credit_limits: [{ company: "A", credit_limit: 1, bypass_credit_limit_check: false }] };
    expect(changedFields(initial, { ...initial })).toEqual({});
    expect(changedFields(initial, { ...initial, phone: "0661", credit_limits: [] })).toEqual({ phone: "0661", credit_limits: [] });
  });

  it("lit les coordonnées GPS comme le serveur", () => {
    expect(parseGps("35.697, -0.633")).toEqual({ latitude: 35.697, longitude: -0.633 });
    expect(parseGps("0,0")).toBeNull();
    expect(parseGps("95, 3")).toBeNull();
    expect(parseGps("Oran")).toBeNull();
  });

  it("construit les modifications groupées", () => {
    expect(bulkChanges({ status: "", customerGroup: "", priceList: "", paymentTerms: "", activity: "" })).toEqual({});
    expect(
      bulkChanges({ status: "Dormant", customerGroup: "", priceList: BULK_CLEAR, paymentTerms: "30 jours", activity: "disable" }),
    ).toEqual({ status: "Dormant", default_price_list: "", payment_terms: "30 jours", disabled: true });
  });

  it("exporte un CSV compatible Excel", () => {
    const row = {
      name: "CUST-1",
      customer_name: 'PHARMACIE "EL; AMEL"',
      customer_group: "Pharmacie",
      status: "Actif",
      disabled: false,
      is_frozen: false,
      commune: "COM-1",
      commune_name: "Bir El Djir",
      wilaya: "Oran",
      phone: "0550",
      nif: null,
      rc: null,
      default_price_list: null,
      payment_terms: null,
      has_gps: true,
      key_account: false,
      balance: 1500,
      last_order: null,
      creation: null,
    } satisfies CustomerRow;
    const csv = customersToCsv([row]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [header, line] = csv.slice(1).split("\r\n");
    expect(header.startsWith("Code;Raison sociale;")).toBe(true);
    expect(line).toContain('"PHARMACIE ""EL; AMEL"""');
    expect(line.endsWith(";1500.00;")).toBe(true);
  });
});
