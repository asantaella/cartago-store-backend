import { type CartEntity } from "../api/middlewares/cart-pricing-helpers";

/**
 * Applies Cartago's per-variant shipping surcharge without calculating cart
 * totals. Medusa remains responsible for the aggregate totals pipeline.
 */
class ShippingSurchargeService {
  calculate(cart: CartEntity): number {
    return (cart.items || []).reduce((sum, item) => {
      const extra = (item.variant as any)?.shipping_option_price_extra;
      return typeof extra === "number" && extra > 0
        ? sum + extra * (item.quantity || 1)
        : sum;
    }, 0);
  }

  apply(cart: CartEntity): number {
    const extraTotal = this.calculate(cart);

    for (const method of cart.shipping_methods || []) {
      const data = method.data || {};
      const currentExtra =
        typeof data.shipping_extra_total === "number"
          ? data.shipping_extra_total
          : 0;
      const basePrice =
        typeof data.base_price === "number"
          ? data.base_price
          : method.price - currentExtra;
      const isFreeShipping =
        method.price === 0 &&
        (data.free_shipping === true || currentExtra > 0);

      method.price = isFreeShipping ? 0 : basePrice + extraTotal;
      method.data = {
        ...data,
        base_price: basePrice,
        shipping_extra_total: extraTotal,
      };
    }

    return extraTotal;
  }
}

export default ShippingSurchargeService;
