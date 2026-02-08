// src/api/store/shipping-options/{cart_id}/list-shipping-options.route.ts

import {
  MedusaRequest,
  MedusaResponse,
  ShippingOption,
} from "@medusajs/medusa";
import {
  CartService,
  PricingService,
  ShippingProfileService,
} from "@medusajs/medusa/dist/services";
import SpanishTaxService from "../../../../services/spanish-tax";
import { MedusaError } from "@medusajs/utils";

/**
 * @oas [get] /store/shipping-options/{cart_id}
 * operationId: "GetStoreShippingOptions"
 * summary: "List Shipping Options"
 * description: "Retrieves shipping options available for a given cart."
 * parameters:
 *   - (path) cart_id {string} The ID of the Cart to retrieve shipping options for.
 * tags:
 *   - Shipping Options
 * responses:
 *   200:
 *     description: "An array of available shipping options."
 *     content:
 *       application/json:
 *         schema:
 *           type: object
 *           properties:
 *             shipping_options:
 *               type: array
 *               items:
 *                 $ref: "#/components/schemas/shipping_option"
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const  cart_id  = req.params.cart_id as string;

  const cartService: CartService = req.scope.resolve("cartService");
  const pricingService: PricingService = req.scope.resolve("pricingService");
  const shippingProfileService: ShippingProfileService = req.scope.resolve(
    "shippingProfileService"
  );

  const cart = await cartService.retrieveWithTotals(cart_id, {
    relations: ["shipping_address"],
  });

  const postalCode = cart.shipping_address?.postal_code;

  let data = [];

  if (postalCode) {
    let options: ShippingOption[] =
      await shippingProfileService.fetchCartOptions(cart);

    options = options.filter((option) => {
      const postalCodeConstraints = option.metadata?.postal_code_constraints as
        | string
        | undefined;
      if (!postalCodeConstraints) {
        return false;
      }

      return new RegExp(postalCodeConstraints).test(postalCode);
    });

    data = await pricingService.setShippingOptionPrices(options, {
      cart_id,
    });

    // If the cart postal code belongs to Canarias, convert shipping prices
    // from gross (incl. IVA) to net before returning so that the client and
    // any subsequent order creation see the net price.
    try {
      const spanishTaxService: SpanishTaxService =
        req.scope.resolve("spanishTaxService");
      if (
        spanishTaxService &&
        spanishTaxService.isTaxExemptAddress(postalCode) &&
        Array.isArray(data)
      ) {
        data = data.map((opt: any) => {
          try {
            if (typeof opt.amount === "number") {
              opt.amount = spanishTaxService.calculatePriceWithoutTax(opt.amount);
            }
            if (typeof opt.price === "number") {
              opt.price = spanishTaxService.calculatePriceWithoutTax(opt.price);
            }
            if (typeof opt.price_incl_tax === "number") {
              opt.price_incl_tax = spanishTaxService.calculatePriceWithoutTax(
                opt.price_incl_tax
              );
            }
            // Some shapes include a nested shipping_option object with price
            if (
              opt.shipping_option &&
              typeof opt.shipping_option.price === "number"
            ) {
              opt.shipping_option.price = spanishTaxService.calculatePriceWithoutTax(
                opt.shipping_option.price
              );
            }
          } catch (e) {
            // Non-fatal: leave the option as-is if conversion fails
            // eslint-disable-next-line no-console
            console.warn(
              "[shipping-options route] could not adjust shipping option price:",
              e
            );
          }
          return opt;
        });
      }
    } catch (e) {
      // If the canarias service isn't available, skip the adjustment.
      // eslint-disable-next-line no-console
      console.warn(
        "[shipping-options route] spanishTaxService not available:",
        e
      );
    }
  }

  res.status(200).json({ shipping_options: data });
};
