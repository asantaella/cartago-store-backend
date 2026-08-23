import DraftOrderPricingService from "../draft-order-pricing";

describe("DraftOrderPricingService", () => {
  it("applies the tax policy without calculating aggregate totals", () => {
    const service = new DraftOrderPricingService({} as any);
    const cart: any = {
      items: [{ unit_price: 1210, quantity: 1, subtotal: 1210 }],
      shipping_methods: [{ price: 500 }],
      shipping_address: { country_code: "ES", postal_code: "07001" },
      metadata: {},
    };
    const taxService = {
      isTaxExemptAddress: jest.fn().mockReturnValue(true),
      getTerritoryType: jest.fn().mockReturnValue("canarias"),
    };

    service.applyTaxPricing(cart, taxService);

    expect(cart.metadata.territory_type).toBe("canarias");
    expect(taxService.isTaxExemptAddress).toHaveBeenCalledWith("ES", "07001");
  });
});
