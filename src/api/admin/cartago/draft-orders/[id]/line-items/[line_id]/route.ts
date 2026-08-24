import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { MedusaError } from "medusa-core-utils";
import {
  defaultAdminDraftOrdersCartFields,
  defaultAdminDraftOrdersCartRelations,
} from "@medusajs/medusa/dist/api/routes/admin/draft-orders";
import { cleanResponseData } from "@medusajs/medusa/dist/utils/clean-response-data";
import DraftOrderPricingService from "../../../../../../../services/draft-order-pricing";
import ShippingSurchargeService from "../../../../../../../services/shipping-surcharge";

type DraftShippingSnapshot = {
  id: string;
  cart_id: string;
  shipping_option_id: string;
  price: number;
  data: Record<string, unknown>;
  includes_tax: boolean;
};

function validateUpdateBody(body: any): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "The request body must be an object",
    );
  }

  const allowed = ["unit_price", "title", "quantity", "metadata"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  if (update.title !== undefined && typeof update.title !== "string") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "title must be a string",
    );
  }
  if (
    update.metadata !== undefined &&
    (typeof update.metadata !== "object" || update.metadata === null || Array.isArray(update.metadata))
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "metadata must be an object",
    );
  }

  if (update.quantity !== undefined &&
      (!Number.isInteger(update.quantity) || (update.quantity as number) < 0)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "quantity must be a non-negative integer",
    );
  }
  if (update.unit_price !== undefined &&
      (!Number.isInteger(update.unit_price) || (update.unit_price as number) < 0)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "unit_price must be a non-negative integer",
    );
  }

  return update;
}

async function retrieveDraftOrder(
  draftOrderService: any,
  id: string,
  manager: any,
): Promise<any> {
  const draftOrder = await draftOrderService.withTransaction(manager).retrieve(id, {
    relations: [
      "cart",
      "cart.items",
      "cart.items.tax_lines",
      "cart.shipping_methods",
      "cart.shipping_methods.tax_lines",
      "cart.discounts",
      "cart.discounts.rule",
    ],
  });

  if (draftOrder.status === "completed") {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "You are only allowed to update open draft orders",
    );
  }
  if (!draftOrder.cart) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Cart for draft order ${id} was not found`,
    );
  }
  return draftOrder;
}

function snapshotShippingMethods(cart: any): DraftShippingSnapshot[] {
  return (cart.shipping_methods || []).map((method: any) => ({
    id: method.id,
    cart_id: cart.id,
    shipping_option_id: method.shipping_option_id,
    price: method.price,
    data: {
      ...(method.data || {}),
      free_shipping:
        method.price === 0 &&
        cart.discounts?.some(
          (discount: any) => discount.rule?.type === "free_shipping",
        ) === true,
    },
    includes_tax: method.includes_tax === true,
  }));
}

async function restoreShippingMethods(
  manager: any,
  cart: any,
  snapshots: DraftShippingSnapshot[],
): Promise<void> {
  if ((cart.items || []).length === 0 || (cart.shipping_methods || []).length > 0 || snapshots.length === 0) return;

  const repository = manager.getRepository("ShippingMethod");
  const methods = repository.create(snapshots);
  await repository.save(methods);
  cart.shipping_methods = methods;
}

async function removeTaxLinesBeforeNativeMutation(
  manager: any,
  cart: any,
): Promise<void> {
  const shippingTaxLines = (cart.shipping_methods || []).flatMap(
    (method: any) => method.tax_lines || [],
  );
  if (shippingTaxLines.length > 0) {
    await manager
      .getRepository("ShippingMethodTaxLine")
      .remove(shippingTaxLines);
  }

  const itemTaxLines = (cart.items || []).flatMap(
    (item: any) => item.tax_lines || [],
  );
  if (itemTaxLines.length > 0) {
    await manager.getRepository("LineItemTaxLine").remove(itemTaxLines);
  }
}

async function reloadDraftOrder(
  draftOrderService: any,
  cartService: any,
  pricingService: DraftOrderPricingService,
  surchargeService: ShippingSurchargeService,
  spanishTaxService: any,
  draftOrder: any,
  manager: any,
): Promise<any> {
  draftOrder.cart = await cartService.withTransaction(manager).retrieveWithTotals(
    draftOrder.cart_id,
    {
      relations: defaultAdminDraftOrdersCartRelations,
      select: defaultAdminDraftOrdersCartFields,
    },
  );
  // retrieveWithTotals delegates to Medusa's totals service. Reapply the
  // draft-order-specific aggregate after that read so a stale native aggregate
  // cannot erase shipping or the variant surcharge from the response.
  surchargeService.apply(draftOrder.cart as any);
  pricingService.applyTaxPricing(draftOrder.cart as any, spanishTaxService);
  await cartService.withTransaction(manager).decorateTotals(draftOrder.cart);
  return cleanResponseData(draftOrder, []);
}

async function mutateLineItem(
  req: MedusaRequest,
  operation: "update" | "remove",
): Promise<any> {
  const { id, line_id } = req.params as { id: string; line_id: string };
  const manager = req.scope.resolve("manager") as any;
  const draftOrderService = req.scope.resolve("draftOrderService") as any;
  const cartService = req.scope.resolve("cartService") as any;
  const pricingService = req.scope.resolve(
    "draftOrderPricingService",
  ) as DraftOrderPricingService;
  const surchargeService = req.scope.resolve(
    "shippingSurchargeService",
  ) as ShippingSurchargeService;
  const spanishTaxService = req.scope.resolve("spanishTaxService") as any;

  return manager.transaction(async (transactionManager: any) => {
    const draftOrder = await retrieveDraftOrder(
      draftOrderService,
      id,
      transactionManager,
    );
    const cartId = draftOrder.cart.id;
    const snapshots = snapshotShippingMethods(draftOrder.cart);
    const lineItem = (draftOrder.cart.items || []).find(
      (item: any) => item.id === line_id,
    );

    if (!lineItem) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Could not find line item ${line_id} in draft order ${id}`,
      );
    }

    await removeTaxLinesBeforeNativeMutation(
      transactionManager,
      draftOrder.cart,
    );

    const cartServiceTx = cartService.withTransaction(transactionManager);
    if (operation === "remove") {
      await cartServiceTx.removeLineItem(cartId, line_id);
    } else {
      const update = validateUpdateBody((req as any).body);
      if (update.quantity === 0) {
        await cartServiceTx.removeLineItem(cartId, line_id);
      } else {
        update.region_id = draftOrder.cart.region_id;
        if (lineItem.variant_id) update.variant_id = lineItem.variant_id;
        await cartServiceTx.updateLineItem(cartId, line_id, update);
      }
    }

    const cartRepository = transactionManager.getRepository("Cart");
    const cart = await cartRepository.findOne({
      where: { id: cartId },
      relations: [
        "items",
        "items.variant",
        "items.tax_lines",
        "items.adjustments",
        "shipping_methods",
        "shipping_methods.tax_lines",
        "payment_sessions",
        "shipping_address",
        "region",
        "region.tax_rates",
        "region.payment_providers",
        "discounts",
        "discounts.rule",
        "gift_cards",

      ],
    });
    if (!cart) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Cart ${cartId} was not found after line-item mutation`,
      );
    }

    await restoreShippingMethods(transactionManager, cart, snapshots);
    surchargeService.apply(cart as any);
    pricingService.applyTaxPricing(cart as any, spanishTaxService);
    await cartService
      .withTransaction(transactionManager)
      .decorateTotals(cart);
    await cartService
      .withTransaction(transactionManager)
      .setPaymentSessions(cart);
    // Cart.shipping_methods is a non-cascading relation. Persist the
    // effective shipping price and surcharge metadata explicitly; saving
    // only the cart leaves the response correct but the next read stale.
    const shippingMethodRepository = transactionManager.getRepository(
      "ShippingMethod",
    );
    if (cart.shipping_methods?.length) {
      await shippingMethodRepository.save(cart.shipping_methods);
    }
    await cartRepository.save(cart);

    return reloadDraftOrder(
      draftOrderService,
      cartService,
      pricingService,
      surchargeService,
      spanishTaxService,
      draftOrder,
      transactionManager,
    );
  });
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const draftOrder = await mutateLineItem(req, "update");
  res.status(200).json({ draft_order: draftOrder });
}

export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const draftOrder = await mutateLineItem(req, "remove");
  res.status(200).json({ draft_order: draftOrder });
}
