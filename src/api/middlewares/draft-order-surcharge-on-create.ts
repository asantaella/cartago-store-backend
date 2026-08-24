import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { NextFunction } from "express";
import ShippingSurchargeService from "../../services/shipping-surcharge";
import DraftOrderPricingService from "../../services/draft-order-pricing";

export async function applyDraftOrderSurchargeOnCreate(
  req: MedusaRequest,
  res: MedusaResponse,
  next: NextFunction,
): Promise<void> {
  const manager = req.scope.resolve("manager") as any;
  const cartService = req.scope.resolve("cartService") as any;
  const surchargeService = req.scope.resolve(
    "shippingSurchargeService",
  ) as ShippingSurchargeService;
  const pricingService = req.scope.resolve(
    "draftOrderPricingService",
  ) as DraftOrderPricingService;
  const spanishTaxService = req.scope.resolve("spanishTaxService") as any;
  const originalJson = res.json.bind(res);

  res.json = function (body: any): any {
    void persistCreatedDraftOrder(
      req,
      manager,
      cartService,
      surchargeService,
      pricingService,
      spanishTaxService,
      body,
    )
      .then((updatedBody) => originalJson(updatedBody))
      .catch((error) => {
        const errorBody = {
          type: "unexpected_state",
          message: error instanceof Error ? error.message : String(error),
        };
        res.status(500);
        return originalJson(errorBody);
      });

    return res;
  };

  next();
}

async function persistCreatedDraftOrder(
  req: MedusaRequest,
  manager: any,
  cartService: any,
  surchargeService: ShippingSurchargeService,
  pricingService: DraftOrderPricingService,
  spanishTaxService: any,
  body: any,
): Promise<any> {
  const draftOrder = body?.draft_order;
  const cartId = draftOrder?.cart_id || draftOrder?.cart?.id;
  if (!cartId) return body;

  await manager.transaction(async (tm: any) => {
    const cart = await cartService.withTransaction(tm).retrieveWithTotals(cartId, {
      relations: [
        "items",
        "items.variant",
        "items.tax_lines",
        "items.adjustments",
        "shipping_methods",
        "shipping_methods.tax_lines",
        "shipping_methods.shipping_option",
        "shipping_address",
        "region",
        "region.tax_rates",
        "region.payment_providers",
        "discounts",
        "discounts.rule",
        "gift_cards",
        "payment_sessions",
      ],
    });

    surchargeService.apply(cart);
    pricingService.applyTaxPricing(cart, spanishTaxService);
    await cartService.withTransaction(tm).decorateTotals(cart);
    await cartService.withTransaction(tm).setPaymentSessions(cart);

    // Cart.shipping_methods is a non-cascading relation. Persist the effective
    // shipping price and surcharge metadata explicitly before saving the cart,
    // otherwise the response is correct but the next draft-order read loses it.
    const shippingMethodRepository = tm.getRepository("ShippingMethod");
    if (cart.shipping_methods?.length) {
      await shippingMethodRepository.save(cart.shipping_methods);
    }
    await tm.getRepository("Cart").save(cart);

    draftOrder.cart = cart;
  });

  return body;
}
