import DraftOrderPricingService from "../draft-order-pricing";

describe("DraftOrderPricingService", () => {
  it("applies the variant shipping extra idempotently", () => {
    const service = new DraftOrderPricingService({} as any);
    const cart: any = {
      items: [
        { quantity: 2, variant: { shipping_option_price_extra: 150 } },
        { quantity: 1, variant: { shipping_option_price_extra: 75 } },
      ],
      shipping_methods: [
        { price: 1000, data: { shipping_extra_total: 0 } },
      ],
    };

    service.applyShippingExtra(cart);
    service.applyShippingExtra(cart);

    expect(cart.shipping_methods[0].price).toBe(1375);
    expect(cart.shipping_methods[0].data.shipping_extra_total).toBe(375);
  });

  it("keeps free shipping free after reapplying the variant extra", () => {
    const service = new DraftOrderPricingService({} as any);
    const cart: any = {
      items: [{ quantity: 1, variant: { shipping_option_price_extra: 300 } }],
      shipping_methods: [
        {
          price: 0,
          data: { adjusted_price: 500, shipping_extra_total: 300 },
        },
      ],
    };

    service.applyShippingExtra(cart);

    expect(cart.shipping_methods[0].price).toBe(0);
    expect(cart.shipping_methods[0].data.shipping_extra_total).toBe(300);
  });

  it("calculates draft totals including shipping and gift cards", () => {
    const service = new DraftOrderPricingService({} as any);
    const cart: any = {
      items: [{ subtotal: 2000, discount_total: 100 }],
      shipping_methods: [{ price: 500, discount_total: 0 }],
      tax_total: 0,
      gift_card_total: 200,
    };

    expect(service.calculateTotals(cart)).toEqual({
      subtotal: 2000,
      shipping_total: 500,
      item_tax_total: 0,
      shipping_tax_total: 0,
      tax_total: 0,
      discount_total: 100,
      gift_card_total: 200,
      gift_card_tax_total: 0,
      total: 2200,
    });
  });

  it("keeps the variant shipping extra in tax-exempt shipping totals", () => {
    const service = new DraftOrderPricingService({} as any);
    const cart: any = {
      items: [
        {
          quantity: 2,
          subtotal: 2000,
          variant: { shipping_option_price_extra: 150 },
        },
      ],
      shipping_methods: [
        { price: 500, data: { adjusted_price: 400 } },
      ],
      shipping_address: { country_code: "ES", postal_code: "07001" },
    };
    const taxService = {
      isTaxExemptAddress: jest.fn().mockReturnValue(true),
      getTerritoryType: jest.fn().mockReturnValue("canarias"),
    };

    service.applyShippingExtra(cart);
    service.applyTaxPricing(cart, taxService);

    expect(cart.shipping_total).toBe(700);
    expect(cart.shipping_methods[0].data.shipping_extra_total).toBe(300);
  });

  it("converts tax-included shipping extra to net shipping and tax totals", () => {
    const service = new DraftOrderPricingService({} as any);
    const cart: any = {
      items: [
        {
          quantity: 1,
          subtotal: 2066,
          tax_total: 434,
          variant: { shipping_option_price_extra: 1000 },
        },
      ],
      shipping_methods: [
        {
          price: 699,
          includes_tax: true,
          tax_total: 121,
          data: { shipping_extra_total: 0 },
        },
      ],
      region: { tax_rate: 21 },
      gift_card_total: 0,
    };

    service.applyShippingExtra(cart);
    const totals = service.applyTotals(cart);

    expect(totals.shipping_total).toBe(1404);
    expect(totals.shipping_tax_total).toBe(295);
    expect(totals.tax_total).toBe(729);
    expect(totals.total).toBe(4199);
    expect(cart.shipping_methods[0].price).toBe(1699);
  });
});
