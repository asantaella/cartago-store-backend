import { adjustCartPricingOnGet } from "./cart-pricing-on-get";

describe("adjustCartPricingOnGet for draft orders", () => {
  it("leaves native draft-order totals untouched in standard territory", () => {
    const cart: any = {
      id: "cart_1",
      items: [
        {
          quantity: 2,
          subtotal: 2000,
          discount_total: 0,
          variant: { shipping_option_price_extra: 150 },
        },
      ],
      shipping_methods: [{ price: 500, discount_total: 0, tax_total: 0 }],
      shipping_total: 500,
      shipping_address: { country_code: "ES", postal_code: "28770" },
      gift_card_total: 0,
      tax_total: 0,
    };
    const body = { draft_order: { id: "draft_1", cart } };
    const json = jest.fn();
    const req: any = {
      scope: {
        resolve: jest.fn((name: string) => {
          if (name === "spanishTaxService") {
            return {
              isTaxExemptAddress: jest.fn().mockReturnValue(false),
              getTerritoryType: jest.fn().mockReturnValue("standard"),
            };
          }
          throw new Error(`Unexpected dependency: ${name}`);
        }),
      },
    };
    const res: any = { json };

    adjustCartPricingOnGet(req, res, jest.fn());
    res.json(body);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        draft_order: expect.objectContaining({
          cart: expect.objectContaining({
            shipping_total: 500,
            shipping_methods: [{ price: 500, discount_total: 0, tax_total: 0 }],
          }),
        }),
      }),
    );
  });
});
