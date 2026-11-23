import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { NextFunction } from "express";
import {
  isNifCifMissingForCart,
  NifCifCart,
} from "../../utils/nif-cif-requirement";

export const NIF_CIF_REQUIRED_CODE = "nif_cif_required";

/**
 * Blocks payment-session selection for EUR carts of €400 or more that carry no
 * NIF/CIF, so no payable session exists before the customer provides it.
 *
 * Session creation (`POST /store/carts/:id/payment-sessions`) is deliberately
 * not guarded: the storefront creates sessions while rendering checkout, and
 * blocking it would hide the address step where the NIF/CIF is entered.
 * Completion and the Stripe webhook are not guarded either, because the
 * customer has already paid by then.
 */
export async function requireNifCifOnPaymentSession(
  req: MedusaRequest,
  res: MedusaResponse,
  next: NextFunction,
): Promise<void> {
  const cartId = req.params?.id as string | undefined;
  if (!cartId) {
    next();
    return;
  }

  let cart: NifCifCart;
  try {
    const cartService = req.scope.resolve("cartService") as any;
    cart = await cartService.retrieveWithTotals(cartId, {
      relations: ["region", "shipping_address", "billing_address"],
    });
  } catch (error) {
    next(error);
    return;
  }

  if (isNifCifMissingForCart(cart)) {
    res.status(400).json({
      type: "not_allowed",
      code: NIF_CIF_REQUIRED_CODE,
      message:
        "A NIF/CIF is required on the shipping or billing address for orders of €400 or more.",
    });
    return;
  }

  next();
}
