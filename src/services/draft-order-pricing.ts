import { TransactionBaseService } from "@medusajs/medusa";
import {
  applyStandardPricingRestoration,
  applyTaxExemptTransformations,
  hasStaleStandardPricing,
  type CartEntity,
} from "../api/middlewares/cart-pricing-helpers";

/**
 * Owns Cartago-specific tax transformations for draft orders. Shipping
 * surcharges and aggregate totals are handled by dedicated services.
 */
class DraftOrderPricingService extends TransactionBaseService {

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

}

export default DraftOrderPricingService;
