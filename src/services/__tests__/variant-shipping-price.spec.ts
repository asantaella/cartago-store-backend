import VariantShippingPriceService from "../variant-shipping-price.service";

// Minimal mock container (TransactionBaseService requires it)
const mockContainer = {};

describe("VariantShippingPriceService", () => {
  let service: VariantShippingPriceService;

  beforeEach(() => {
    // @ts-ignore
    service = new VariantShippingPriceService(mockContainer);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // calculateCartShippingExtra
  // ──────────────────────────────────────────────────────────────────────────

  describe("calculateCartShippingExtra", () => {
    it("returns 0 for empty cart", () => {
      expect(service.calculateCartShippingExtra({ items: [] })).toBe(0);
    });

    it("returns 0 when no item has the field", () => {
      const cart = {
        items: [
          { quantity: 2, variant: null },
          { quantity: 1, variant: { title: "S" } },
        ],
      };
      expect(service.calculateCartShippingExtra(cart)).toBe(0);
    });

    it("sums single item with extra × quantity", () => {
      const cart = {
        items: [{ quantity: 3, variant: { shipping_option_price_extra: 500 } }],
      };
      expect(service.calculateCartShippingExtra(cart)).toBe(1500);
    });

    it("sums multiple items correctly", () => {
      const cart = {
        items: [
          { quantity: 2, variant: { shipping_option_price_extra: 400 } },
          { quantity: 1, variant: { shipping_option_price_extra: 200 } },
          { quantity: 1, variant: null },
        ],
      };
      // 2×400 + 1×200 = 1000
      expect(service.calculateCartShippingExtra(cart)).toBe(1000);
    });

    it("ignores items with extra = 0", () => {
      const cart = {
        items: [
          { quantity: 5, variant: { shipping_option_price_extra: 0 } },
          { quantity: 2, variant: { shipping_option_price_extra: 300 } },
        ],
      };
      expect(service.calculateCartShippingExtra(cart)).toBe(600);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // applyExtraToShippingOptions
  // ──────────────────────────────────────────────────────────────────────────

  describe("applyExtraToShippingOptions", () => {
    it("returns same array unchanged when extraTotal = 0", () => {
      const options = [{ amount: 1000 }, { amount: 2000 }];
      const result = service.applyExtraToShippingOptions(options, 0);
      expect(result[0].amount).toBe(1000);
      expect(result[1].amount).toBe(2000);
    });

    it("adds extra to each option's amount", () => {
      const options = [{ amount: 1000 }, { amount: 1500 }];
      const result = service.applyExtraToShippingOptions(options, 500);
      expect(result[0].amount).toBe(1500);
      expect(result[1].amount).toBe(2000);
    });

    it("does not touch options without amount field", () => {
      const options = [{ name: "Free" }];
      const result = service.applyExtraToShippingOptions(options, 500);
      expect((result[0] as any).amount).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // applyExtraToShippingMethod
  // ──────────────────────────────────────────────────────────────────────────

  describe("applyExtraToShippingMethod", () => {
    it("returns method unchanged when extra = 0", () => {
      const method = { price: 1000, data: {} };
      service.applyExtraToShippingMethod(method, 0);
      expect(method.price).toBe(1000);
    });

    it("applies extra to price and stores it in data", () => {
      const method = { price: 1000, data: {} };
      service.applyExtraToShippingMethod(method, 500);
      expect(method.price).toBe(1500);
      expect((method.data as any).shipping_extra_total).toBe(500);
    });

    it("is idempotent when the same extra is applied again", () => {
      const method = { price: 1000, data: {} };
      service.applyExtraToShippingMethod(method, 500);
      service.applyExtraToShippingMethod(method, 500);
      expect(method.price).toBe(1500);
    });

    it("updates price correctly when extra changes", () => {
      const method = { price: 1000, data: {} };
      service.applyExtraToShippingMethod(method, 300);
      expect(method.price).toBe(1300);
      service.applyExtraToShippingMethod(method, 700);
      expect(method.price).toBe(1700);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // removeExtraFromShippingMethod
  // ──────────────────────────────────────────────────────────────────────────

  describe("removeExtraFromShippingMethod", () => {
    it("returns method unchanged when no extra stored", () => {
      const method = { price: 1000, data: {} };
      service.removeExtraFromShippingMethod(method);
      expect(method.price).toBe(1000);
    });

    it("removes extra from price and deletes data key", () => {
      const method = { price: 1500, data: { shipping_extra_total: 500 } };
      service.removeExtraFromShippingMethod(method);
      expect(method.price).toBe(1000);
      expect((method.data as any).shipping_extra_total).toBeUndefined();
    });
  });
});
