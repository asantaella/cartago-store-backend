import {
  EUR_NIF_CIF_THRESHOLD_MINOR_UNITS,
  hasNifCif,
  isNifCifMissingForCart,
  isNifCifRequiredByCartTotal,
  NifCifCart,
} from "../nif-cif-requirement";

const eurCart = (overrides: Partial<NifCifCart> = {}): NifCifCart => ({
  total: EUR_NIF_CIF_THRESHOLD_MINOR_UNITS,
  region: { currency_code: "eur" },
  shipping_address: { metadata: {} },
  billing_address: { metadata: {} },
  ...overrides,
});

describe("NIF/CIF requirement", () => {
  it("uses a €400 threshold expressed in minor units", () => {
    expect(EUR_NIF_CIF_THRESHOLD_MINOR_UNITS).toBe(40_000);
  });

  describe("isNifCifRequiredByCartTotal", () => {
    it("requires NIF/CIF for EUR carts at exactly €400", () => {
      expect(isNifCifRequiredByCartTotal(eurCart())).toBe(true);
    });

    it("requires NIF/CIF for EUR carts above €400", () => {
      expect(isNifCifRequiredByCartTotal(eurCart({ total: 86_699 }))).toBe(true);
    });

    it("does not require NIF/CIF for EUR carts below €400", () => {
      expect(isNifCifRequiredByCartTotal(eurCart({ total: 39_999 }))).toBe(false);
    });

    it("reads the currency from the region case-insensitively", () => {
      expect(
        isNifCifRequiredByCartTotal(eurCart({ region: { currency_code: "EUR" } }))
      ).toBe(true);
    });

    it("does not require NIF/CIF for non-EUR carts", () => {
      expect(
        isNifCifRequiredByCartTotal(eurCart({ region: { currency_code: "usd" } }))
      ).toBe(false);
    });

    it("does not require NIF/CIF when the region or total is unknown", () => {
      expect(isNifCifRequiredByCartTotal(eurCart({ region: null }))).toBe(false);
      expect(isNifCifRequiredByCartTotal(eurCart({ total: null }))).toBe(false);
      expect(isNifCifRequiredByCartTotal(null)).toBe(false);
    });
  });

  describe("hasNifCif", () => {
    it("accepts a NIF/CIF on the shipping address", () => {
      expect(
        hasNifCif(eurCart({ shipping_address: { metadata: { nif_cif: "B12345678" } } }))
      ).toBe(true);
    });

    it("accepts a NIF/CIF on the billing address", () => {
      expect(
        hasNifCif(eurCart({ billing_address: { metadata: { nif_cif: "12345678Z" } } }))
      ).toBe(true);
    });

    it("rejects blank, whitespace-only, and non-string values", () => {
      for (const nif_cif of ["", "   ", 12345678, null, undefined]) {
        expect(
          hasNifCif(eurCart({ shipping_address: { metadata: { nif_cif } } }))
        ).toBe(false);
      }
    });

    it("rejects carts without addresses or metadata", () => {
      expect(
        hasNifCif(eurCart({ shipping_address: null, billing_address: { metadata: null } }))
      ).toBe(false);
    });
  });

  describe("isNifCifMissingForCart", () => {
    it("flags EUR carts of €400 or more without NIF/CIF", () => {
      expect(isNifCifMissingForCart(eurCart())).toBe(true);
    });

    it("does not flag compliant, low-value, non-EUR, or missing carts", () => {
      expect(
        isNifCifMissingForCart(
          eurCart({ billing_address: { metadata: { nif_cif: "B12345678" } } })
        )
      ).toBe(false);
      expect(isNifCifMissingForCart(eurCart({ total: 100 }))).toBe(false);
      expect(
        isNifCifMissingForCart(eurCart({ region: { currency_code: "gbp" } }))
      ).toBe(false);
      expect(isNifCifMissingForCart(undefined)).toBe(false);
    });
  });
});
