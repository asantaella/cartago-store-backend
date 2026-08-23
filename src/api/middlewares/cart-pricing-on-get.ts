import { NextFunction, Response } from "express";
import { MedusaRequest } from "@medusajs/medusa";
import {
  extractCartFromBody,
  applyStandardPricingRestoration,
  applyTaxExemptTransformations,
  resolveSpanishTaxService,
  resolveManager,
  getTaxContext,
  hasStaleStandardPricing,
  log,
  safeJsonTransform,
} from "./cart-pricing-helpers";
import { adjustCartPricesInDb } from "./cart-pricing-db-update";
import DraftOrderPricingService from "../../services/draft-order-pricing";

/**
 * Middleware que recalcula los precios del carrito en las respuestas GET
 * según el código postal de la dirección de envío para zonas con tax 0%
 */
export async function adjustCartPricingOnGet(
  req: MedusaRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const originalJson = res.json.bind(res);
  const spanishTaxService = resolveSpanishTaxService(req);

  res.json = function (body: unknown) {
    if (!spanishTaxService) {
      return originalJson(body);
    }

    const transform = safeJsonTransform((responseBody: unknown) => {
      const { cart, isDraftOrder } = extractCartFromBody(responseBody);

      log(
        `GET intercepted - isDraftOrder=${isDraftOrder}, cart=${
          cart?.id || "null"
        }`,
      );

      if (!cart) {
        return responseBody;
      }

      const taxContext = getTaxContext(cart, spanishTaxService);

      if (!taxContext) {
        log(`GET cart ${cart.id} - no postal code, skipping`);
        return responseBody;
      }

      log(
        `GET ${isDraftOrder ? "draft_order" : "cart"} ${cart.id} - ` +
          `postal=${taxContext.postalCode} isTaxExempt=${taxContext.isTaxExempt} ` +
          `territory=${taxContext.territoryType}`,
      );

      const manager = resolveManager(req);

      if (!taxContext.isTaxExempt) {
        if (hasStaleStandardPricing(cart)) {
          applyStandardPricingRestoration(cart, taxContext);

          if (manager && !isDraftOrder && cart.id) {
            adjustCartPricesInDb(manager, cart.id, taxContext).catch((err) =>
              log(
                `Background standard DB restore error for cart ${cart.id}: ${err}`,
              ),
            );
          }
        }

        // Draft orders use the native admin GET endpoint. Unlike store carts,
        // they must also expose the variant shipping surcharge in standard
        // territory; otherwise the admin loses it after a line-item update.
        if (isDraftOrder) {
          const draftOrderPricingService = req.scope.resolve(
            "draftOrderPricingService",
          ) as DraftOrderPricingService;
          draftOrderPricingService.applyShippingExtra(cart);
          draftOrderPricingService.applyTotals(cart);
        }

        return responseBody;
      }

      applyTaxExemptTransformations(cart, taxContext);

      // FIRE AND FORGET: Sincronizar DB en segundo plano SOLO si es tax-exempt
      if (manager && !isDraftOrder && cart.id && taxContext.isTaxExempt) {
        adjustCartPricesInDb(manager, cart.id, taxContext).catch((err) =>
          log(`Background DB Sync Error for cart ${cart.id}: ${err}`),
        );
      }

      return responseBody;
    }, "adjustCartPricingOnGet");

    return originalJson(transform(body));
  };

  next();
}
