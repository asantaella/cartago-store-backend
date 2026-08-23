import ShippingSurchargeService from "../shipping-surcharge";

describe("ShippingSurchargeService", () => {
  it("applies the variant surcharge idempotently", () => {
    const service = new ShippingSurchargeService();
    const cart: any = {
      items: [
        { quantity: 2, variant: { shipping_option_price_extra: 150 } },
        { quantity: 1, variant: { shipping_option_price_extra: 75 } },
      ],
      shipping_methods: [{ price: 1000, data: {} }],
    };

    service.apply(cart);
    service.apply(cart);

    expect(cart.shipping_methods[0].price).toBe(1375);
    expect(cart.shipping_methods[0].data).toEqual({
      base_price: 1000,
      shipping_extra_total: 375,
    });
  });

  it("does not charge a surcharge when native free shipping set price to zero", () => {
    const service = new ShippingSurchargeService();
    const cart: any = {
      items: [{ quantity: 1, variant: { shipping_option_price_extra: 300 } }],
      shipping_methods: [
        {
          price: 0,
          data: { base_price: 500, free_shipping: true },
        },
      ],
    };

    service.apply(cart);

    expect(cart.shipping_methods[0].price).toBe(0);
    expect(cart.shipping_methods[0].data.shipping_extra_total).toBe(300);
  });
});
