// src/api/store/shipping-options/{cart_id}/list-shipping-options.route.ts

import {
  MedusaRequest,
  MedusaResponse,
  ShippingOption,
} from "@medusajs/medusa";
import { listShippingOptionsForCartWorkflow } from "@medusajs/core-flows";
import {
  CartService,
  PricingService,
  ShippingProfileService,
} from "@medusajs/medusa/dist/services";
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
  const { cart_id } = req.params;

  const cartService: CartService = req.scope.resolve("cartService");
  const pricingService: PricingService = req.scope.resolve("pricingService");
  const shippingProfileService: ShippingProfileService = req.scope.resolve(
    "shippingProfileService"
  );

  const cart = await cartService.retrieveWithTotals(cart_id, {
    relations: ["shipping_address"],
  });

  const postalCode = cart.shipping_address?.postal_code;

  if (!postalCode) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Postal code is required in shipping address"
    );
  }

  let options: ShippingOption[] = await shippingProfileService.fetchCartOptions(
    cart
  );

  options = options.filter((option) => {
    const postalCodeConstraints = option.metadata?.postal_code_constraints as
      | string
      | undefined;
    if (!postalCodeConstraints) {
      return false;
    }

    return new RegExp(postalCodeConstraints).test(postalCode);
  });

  const data = await pricingService.setShippingOptionPrices(options, {
    cart_id,
  });

  

  res.status(200).json({ shipping_options: data });
};
