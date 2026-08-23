import { TransactionBaseService } from "@medusajs/medusa";
import {
  applyStandardPricingRestoration,
  applyTaxExemptTransformations,
  hasStaleStandardPricing,
  type CartEntity,
} from "../api/middlewares/cart-pricing-helpers";

export type DraftOrderTotals = {
  subtotal: number;
  shipping_total: number;
  item_tax_total: number;
  shipping_tax_total: number;
  tax_total: number;
  discount_total: number;
  gift_card_total: number;
  total: number;
};

/**
 * Owns Cartago-specific calculations for draft orders without replacing
 * Medusa's global CartService.
 */
class DraftOrderPricingService extends TransactionBaseService {
  private calculateShippingExtra(cart: CartEntity): number {
    return (cart.items || []).reduce((sum, item) => {
      const extra = (item.variant as any)?.shipping_option_price_extra;
      return typeof extra === "number" && extra > 0
        ? sum + extra * (item.quantity || 1)
        : sum;
    }, 0);
  }

  applyShippingExtra(cart: CartEntity): number {
    const extraTotal = this.calculateShippingExtra(cart);

    for (const method of cart.shipping_methods || []) {
      const data = method.data || {};
      const currentExtra = data.shipping_extra_total || 0;
      const basePrice = method.price - currentExtra;

      method.price = basePrice + extraTotal;
      method.data = {
        ...data,
        shipping_extra_total: extraTotal,
      };
    }

    return extraTotal;
  }

  applyTaxPricing(cart: CartEntity, spanishTaxService: any): void {
    const countryCode = cart.shipping_address?.country_code || "";
    const postalCode = cart.shipping_address?.postal_code;
    if (!postalCode) return;

    const isTaxExempt = spanishTaxService.isTaxExemptAddress(
      countryCode,
      postalCode,
    );
    const territoryType = spanishTaxService.getTerritoryType(
      countryCode,
      postalCode,
    );

    if (isTaxExempt) {
      applyTaxExemptTransformations(cart, {
        countryCode,
        postalCode,
        isTaxExempt: true,
        territoryType,
      });
    } else if (hasStaleStandardPricing(cart)) {
      applyStandardPricingRestoration(cart, {
        countryCode,
        postalCode,
        isTaxExempt: false,
        territoryType,
      });
    }

    cart.metadata = { ...cart.metadata, territory_type: territoryType };
  }

  calculateTotals(cart: CartEntity): DraftOrderTotals {
    const items = cart.items || [];
    const shippingMethods = cart.shipping_methods || [];
    const subtotal = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    const taxRate = cart.region?.tax_rate ?? cart.tax_rate ?? 0;
    let shippingTotal = 0;
    let shippingTaxTotal = 0;

    for (const method of shippingMethods) {
      const grossPrice = method.price || 0;
      const includesTax = method.includes_tax === true && taxRate > 0;
      const methodSubtotal = includesTax
        ? Math.round(grossPrice / (1 + taxRate / 100))
        : method.subtotal ?? grossPrice;
      const methodTaxTotal = includesTax
        ? grossPrice - methodSubtotal
        : method.tax_total || 0;

      method.subtotal = methodSubtotal;
      method.tax_total = methodTaxTotal;
      method.total = methodSubtotal + methodTaxTotal;
      shippingTotal += methodSubtotal;
      shippingTaxTotal += methodTaxTotal;
    }

    const itemTaxTotal = items.reduce(
      (sum, item) => sum + ((item as any).tax_total || 0),
      0,
    );
    const discountTotal =
      items.reduce((sum, item) => sum + (item.discount_total || 0), 0) +
      shippingMethods.reduce(
        (sum, method) => sum + ((method as any).discount_total || 0),
        0,
      );
    const giftCardTotal = cart.gift_card_total || 0;
    const taxTotal = itemTaxTotal + shippingTaxTotal;

    return {
      subtotal,
      shipping_total: shippingTotal,
      item_tax_total: itemTaxTotal,
      shipping_tax_total: shippingTaxTotal,
      tax_total: taxTotal,
      discount_total: discountTotal,
      gift_card_total: giftCardTotal,
      total:
        subtotal + shippingTotal + taxTotal - discountTotal - giftCardTotal,
    };
  }

  applyTotals(cart: CartEntity): DraftOrderTotals {
    const totals = this.calculateTotals(cart);
    cart.subtotal = totals.subtotal;
    cart.shipping_total = totals.shipping_total;
    cart.item_tax_total = totals.item_tax_total;
    cart.shipping_tax_total = totals.shipping_tax_total;
    cart.tax_total = totals.tax_total;
    cart.discount_total = totals.discount_total;
    cart.total = totals.total;

    for (const session of cart.payment_sessions || []) {
      session.amount = totals.total;
    }

    return totals;
  }
}

export default DraftOrderPricingService;
