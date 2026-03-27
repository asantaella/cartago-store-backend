import { MedusaRequest } from "@medusajs/medusa";
import { NextFunction, Response } from "express";
import {
  extractCartFromBody,
  logError,
  resolveManager,
} from "./cart-pricing-helpers";
import { hydrateCartWithShippingExtraResponse } from "./cart-shipping-extra-on-post";

export async function adjustCartShippingExtraOnGet(
  req: MedusaRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const originalJson = res.json.bind(res);

  res.json = function (body: unknown) {
    const { cart, isDraftOrder } = extractCartFromBody(body);

    if (!cart || isDraftOrder) {
      return originalJson(body);
    }

    const manager = resolveManager(req);
    if (!manager || !cart.id) {
      return originalJson(body);
    }

    hydrateCartWithShippingExtraResponse(req, manager, cart.id, body, false)
      .then((updatedBody) => originalJson(updatedBody))
      .catch((error) => {
        logError("Error syncing cart shipping extra GET response", error);
        return originalJson(body);
      });

    return res as unknown as Response;
  };

  next();
}
