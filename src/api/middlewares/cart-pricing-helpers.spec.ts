import { describe, expect, it } from "@jest/globals";

import {
  applyStandardPricingRestoration,
  applyTaxExemptTransformations,
  getShippingMethodAdjustedPrice,
  hasStaleStandardPricing,
  type CartEntity,
  type ShippingMethodEntity,
} from "./cart-pricing-helpers";
import { mergeSyncedShippingMethodsIntoCart } from "./cart-shipping-extra-on-post";

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

  it("preserves a discounted shipping price when adjusted_price is higher", () => {
    const method = {
      id: "shipping-method-2",
      price: 0,
      data: {
        adjusted_price: 3057,
      },
    } as ShippingMethodEntity;

    expect(getShippingMethodAdjustedPrice(method)).toBe(0);
  });

  it("prefers a discounted shipping subtotal from the response over adjusted metadata", () => {
    const method = {
      id: "shipping-method-3",
      price: 3057,
      subtotal: 0,
      total: 0,
      tax_total: 0,
      data: {
        adjusted_price: 3057,
      },
    } as ShippingMethodEntity;

    expect(getShippingMethodAdjustedPrice(method)).toBe(0);
  });
});

describe("applyTaxExemptTransformations", () => {
  it("preserves a full shipping discount after recalculating tax-exempt totals", () => {
    const cart = {
      id: "cart_1",
      items: [
        {
          id: "item_1",
          unit_price: 12100,
          quantity: 1,
          subtotal: 12100,
          discount_total: 0,
          metadata: {},
        },
      ],
      shipping_methods: [
        {
          id: "sm_1",
          price: 1210,
          data: {},
        },
      ],
      region: {
        tax_rate: 21,
      },
      shipping_total: 1210,
      discount_total: 1210,
      tax_total: 2100,
      total: 13310,
    } as CartEntity;

    applyTaxExemptTransformations(cart, {
      countryCode: "es",
      postalCode: "35001",
      isTaxExempt: true,
      territoryType: "canarias",
    });

    expect(cart.subtotal).toBe(10000);
    expect(cart.shipping_total).toBe(1000);
    expect(cart.discount_total).toBe(1000);
    expect(cart.total).toBe(10000);
    expect(cart.region?.tax_rate).toBe(0);
  });

  it("keeps item and shipping discounts separated when both are present", () => {
    const cart = {
      id: "cart_2",
      items: [
        {
          id: "item_2",
          unit_price: 12100,
          quantity: 1,
          subtotal: 12100,
          discount_total: 1210,
          metadata: {},
        },
      ],
      shipping_methods: [
        {
          id: "sm_2",
          price: 1210,
          data: {},
        },
      ],
      region: {
        tax_rate: 21,
      },
      shipping_total: 1210,
      discount_total: 2420,
      tax_total: 2310,
      total: 10890,
    } as CartEntity;

    applyTaxExemptTransformations(cart, {
      countryCode: "es",
      postalCode: "35001",
      isTaxExempt: true,
      territoryType: "canarias",
    });

    expect(cart.subtotal).toBe(10000);
    expect(cart.items?.[0].discount_total).toBe(1000);
    expect(cart.shipping_total).toBe(1000);
    expect(cart.discount_total).toBe(2000);
    expect(cart.total).toBe(9000);
  });
});

describe("applyStandardPricingRestoration", () => {
  it("restores original gross item prices for standard territories", () => {
    const cart = {
      id: "cart_4",
      items: [
        {
          id: "item_4",
          unit_price: 1488,
          quantity: 1,
          subtotal: 1230,
          discount_total: 0,
          metadata: {
            adjusted_unit_price: 1488,
            original_unit_price: 1800,
          },
        },
      ],
      shipping_methods: [
        {
          id: "sm_4",
          price: 699,
          subtotal: 578,
          tax_total: 121,
          total: 699,
          data: {},
        },
      ],
      region: {
        tax_rate: 21,
      },
      metadata: {
        territory_type: "canarias",
      },
      subtotal: 1230,
      shipping_total: 578,
      discount_total: 0,
      tax_total: 379,
      total: 2187,
    } as CartEntity;

    expect(hasStaleStandardPricing(cart)).toBe(true);

    applyStandardPricingRestoration(cart, {
      countryCode: "es",
      postalCode: "18100",
      isTaxExempt: false,
      territoryType: "standard",
    });

    expect(cart.items?.[0].unit_price).toBe(1800);
    expect(cart.items?.[0].subtotal).toBe(1488);
    expect(cart.subtotal).toBe(1488);
    expect(cart.shipping_total).toBe(578);
    expect(cart.tax_total).toBe(433);
    expect(cart.total).toBe(2499);
    expect(cart.metadata?.territory_type).toBe("standard");
  });
});

describe("mergeSyncedShippingMethodsIntoCart", () => {
  it("keeps a discounted response shipping price when synced cart has the base amount", () => {
    const cart = {
      id: "cart_3",
      shipping_methods: [
        {
          id: "sm_3",
          price: 0,
          subtotal: 0,
          tax_total: 0,
          total: 0,
          data: {
            adjusted_price: 3057,
          },
        },
      ],
    } as CartEntity;

    const syncedCart = {
      id: "cart_3",
      shipping_methods: [
        {
          id: "sm_3",
          price: 3057,
          data: {
            adjusted_price: 3057,
            original_price: 3699,
          },
        },
      ],
    } as CartEntity;

    mergeSyncedShippingMethodsIntoCart(cart, syncedCart);

    expect(cart.shipping_methods?.[0].price).toBe(0);
    expect(cart.shipping_methods?.[0].data).toEqual({
      adjusted_price: 3057,
      original_price: 3699,
    });
  });
});
