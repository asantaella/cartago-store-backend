import { MedusaRequest } from "@medusajs/medusa";
import { NextFunction, Response } from "express";
import DraftOrderPricingService from "../../services/draft-order-pricing";

type ShippingSnapshot = {
  id: string;
  cart_id: string;
  shipping_option_id: string;
  price: number;
  subtotal?: number;
  total?: number;
  tax_total?: number;
  discount_total?: number;
  includes_tax: boolean;
  data: Record<string, unknown>;
};

function setResponseCart(body: any, cart: any): any {
  if (body?.draft_order?.cart) body.draft_order.cart = cart;
  else if (body?.cart) body.cart = cart;
  return body;
}

export async function preserveDraftOrderShippingOnLineItemMutation(
  req: MedusaRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const manager = req.scope.resolve("manager") as any;
  const draftOrderService = req.scope.resolve("draftOrderService") as any;
  const pricingService = req.scope.resolve(
    "draftOrderPricingService",
  ) as DraftOrderPricingService;
  const draftOrderId = req.params.id as string;
  let snapshots: ShippingSnapshot[] = [];

  await manager.transaction(async (tm: any) => {
    const draftOrder = await draftOrderService.withTransaction(tm).retrieve(
      draftOrderId,
      {
        relations: ["cart", "cart.shipping_methods", "cart.shipping_methods.shipping_option"],
      },
    );
    snapshots = (draftOrder.cart?.shipping_methods || []).map((method: any) => ({
      id: method.id,
      cart_id: draftOrder.cart.id,
      shipping_option_id: method.shipping_option_id,
      price: method.price,
      subtotal: method.subtotal,
      total: method.total,
      tax_total: method.tax_total,
      discount_total: method.discount_total,
      includes_tax: method.includes_tax === true,
      data: { ...(method.data || {}) },
    }));
  });

  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    reconcileDraftOrderShipping(
      req,
      manager,
      draftOrderService,
      pricingService,
      draftOrderId,
      snapshots,
      body,
    )
      .then((updatedBody) => originalJson(updatedBody))
      .catch(() => originalJson(body));

    return res;
  };

  next();
}

async function reconcileDraftOrderShipping(
  req: MedusaRequest,
  manager: any,
  draftOrderService: any,
  pricingService: DraftOrderPricingService,
  draftOrderId: string,
  snapshots: ShippingSnapshot[],
  body: any,
): Promise<any> {
  let cart: any;

  await manager.transaction(async (tm: any) => {
    const draftOrder = await draftOrderService.withTransaction(tm).retrieve(
      draftOrderId,
      {
        relations: [
          "cart",
          "cart.items",
          "cart.items.variant",
          "cart.shipping_methods",
          "cart.shipping_methods.shipping_option",
          "cart.shipping_address",
          "cart.region",
          "cart.payment_sessions",
        ],
      },
    );
    cart = draftOrder.cart;

    if (
      cart &&
      cart.items?.length > 0 &&
      cart.shipping_methods?.length === 0 &&
      snapshots.length > 0
    ) {
      const repository = tm.getRepository("ShippingMethod");
      cart.shipping_methods = await repository.save(
        repository.create(snapshots),
      );
    }

    if (!cart) return;

    pricingService.applyShippingExtra(cart);
    pricingService.applyTaxPricing(
      cart,
      req.scope.resolve("spanishTaxService"),
    );
    pricingService.applyTotals(cart);
    await tm.getRepository("Cart").save(cart);
  });

  return cart ? setResponseCart(body, cart) : body;
}
