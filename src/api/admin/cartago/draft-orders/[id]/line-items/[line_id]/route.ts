import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { MedusaError } from "medusa-core-utils";
import {
  defaultAdminDraftOrdersCartFields,
  defaultAdminDraftOrdersCartRelations,
  defaultAdminDraftOrdersFields,
} from "@medusajs/medusa/dist/api/routes/admin/draft-orders";
import { cleanResponseData } from "@medusajs/medusa/dist/utils/clean-response-data";
import DraftOrderPricingService from "../../../../../../../services/draft-order-pricing";

type DraftShippingSnapshot = {
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
    select: defaultAdminDraftOrdersFields,
    relations: ["cart", "cart.items", "cart.shipping_methods"],
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
    cart_id: cart.id,
    shipping_option_id: method.shipping_option_id,
    price: method.price,
    data: { ...(method.data || {}) },
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

async function reloadDraftOrder(
  draftOrderService: any,
  cartService: any,
  pricingService: DraftOrderPricingService,
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
  pricingService.applyShippingExtra(draftOrder.cart as any);
  pricingService.applyTaxPricing(draftOrder.cart as any, spanishTaxService);
  pricingService.applyTotals(draftOrder.cart as any);
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
  const spanishTaxService = req.scope.resolve("spanishTaxService") as any;

  return manager.transaction(async (transactionManager: any) => {
    const draftOrder = await retrieveDraftOrder(
      draftOrderService,
      id,
      transactionManager,
    );
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

    const cartServiceTx = cartService.withTransaction(transactionManager);
    if (operation === "remove") {
      await cartServiceTx.removeLineItem(draftOrder.cart_id, line_id);
    } else {
      const update = validateUpdateBody((req as any).body);
      if (update.quantity === 0) {
        await cartServiceTx.removeLineItem(draftOrder.cart_id, line_id);
      } else {
        update.region_id = draftOrder.cart.region_id;
        if (lineItem.variant_id) update.variant_id = lineItem.variant_id;
        await cartServiceTx.updateLineItem(draftOrder.cart_id, line_id, update);
      }
    }

    const cartRepository = transactionManager.getRepository("Cart");
    const cart = await cartRepository.findOne({
      where: { id: draftOrder.cart_id },
      relations: [
        "items",
        "items.variant",
        "shipping_methods",
        "payment_sessions",
        "shipping_address",
        "region",
      ],
    });
    if (!cart) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Cart ${draftOrder.cart_id} was not found after line-item mutation`,
      );
    }

    await restoreShippingMethods(transactionManager, cart, snapshots);
    pricingService.applyShippingExtra(cart as any);
    pricingService.applyTaxPricing(cart as any, spanishTaxService);
    pricingService.applyTotals(cart as any);
    await cartRepository.save(cart);

    return reloadDraftOrder(
      draftOrderService,
      cartService,
      pricingService,
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
