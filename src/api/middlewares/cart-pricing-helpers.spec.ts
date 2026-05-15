import {
  getShippingMethodAdjustedPrice,
  type ShippingMethodEntity,
} from "./cart-pricing-helpers";

describe("getShippingMethodAdjustedPrice", () => {
  it("keeps shipping_extra_total untouched when adjusted_price is present", () => {
    const method = {
      id: "shipping-method-1",
      price: 1710,
      data: {
        adjusted_price: 1000,
        shipping_extra_total: 500,
      },
    } as ShippingMethodEntity;

    expect(getShippingMethodAdjustedPrice(method)).toBe(1500);
  });
});