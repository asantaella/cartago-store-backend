import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { NextFunction } from "express";
import { cleanResponseData } from "@medusajs/medusa/dist/utils/clean-response-data";
import DraftOrderPricingService from "../../services/draft-order-pricing";
import ShippingSurchargeService from "../../services/shipping-surcharge";

/**
 * Adds a line item to a draft order without using CartService.addOrUpdateLineItems.
 *
 * Medusa v1's native implementation can fail while updating the `has_shipping`
 * flag when a draft order already has shipping methods. Draft orders need to
 * keep those methods, so this handler creates/merges the line item directly and
 * then runs the same native totals decoration used by the mutation endpoint.
 */
export async function handleDraftOrderLineItemCreation(
  req: MedusaRequest,
  res: MedusaResponse,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const { variant_id, quantity, unit_price, metadata } = (req.body || {}) as {
      variant_id?: string;
      quantity?: number;
      unit_price?: number;
      metadata?: Record<string, unknown>;
    };

    if (!variant_id || typeof variant_id !== "string") {
      res.status(400).json({
        type: "invalid_data",
        message: "variant_id is required",
      });
      return;
    }
    if (!Number.isInteger(quantity) || (quantity as number) <= 0) {
      res.status(400).json({
        type: "invalid_data",
        message: "quantity must be a positive integer",
      });
      return;
    }
    if (
      unit_price !== undefined &&
      (!Number.isInteger(unit_price) || unit_price < 0)
    ) {
      res.status(400).json({
        type: "invalid_data",
        message: "unit_price must be a non-negative integer",
      });
      return;
    }
    if (
      metadata !== undefined &&
      (typeof metadata !== "object" || metadata === null || Array.isArray(metadata))
    ) {
      res.status(400).json({
        type: "invalid_data",
        message: "metadata must be an object",
      });
      return;
    }

    const manager = req.scope.resolve("manager") as any;
    const draftOrderService = req.scope.resolve("draftOrderService") as any;
    const lineItemService = req.scope.resolve("lineItemService") as any;
    const cartService = req.scope.resolve("cartService") as any;
    const pricingService = req.scope.resolve(
      "draftOrderPricingService",
    ) as DraftOrderPricingService;
    const surchargeService = req.scope.resolve(
      "shippingSurchargeService",
    ) as ShippingSurchargeService;
    const spanishTaxService = req.scope.resolve("spanishTaxService") as any;

    const draftOrder = await manager.transaction(async (tm: any) => {
      const draft = await draftOrderService.withTransaction(tm).retrieve(id, {
        relations: [
          "cart",
          "cart.items",
          "cart.items.variant",
          "cart.items.tax_lines",
          "cart.shipping_methods",
          "cart.shipping_methods.tax_lines",
          "cart.shipping_address",
          "cart.region",
          "cart.region.tax_rates",
          "cart.region.payment_providers",
          "cart.discounts",
          "cart.discounts.rule",
          "cart.gift_cards",
          "cart.payment_sessions",
        ],
      });

      if (draft.status === "completed") {
        const error = new Error(
          "You are only allowed to update open draft orders",
        ) as Error & { type?: string };
        error.type = "not_allowed";
        throw error;
      }

      const cartId = draft.cart?.id;
      if (!cartId) {
        const error = new Error(`Cart for draft order ${id} was not found`) as Error & {
          type?: string;
        };
        error.type = "not_found";
        throw error;
      }

      // decorateTotals creates tax lines. Remove the previous ones first so
      // adding an item cannot hit the unique shipping-tax-line constraint.
      const shippingTaxLines = (draft.cart.shipping_methods || []).flatMap(
        (method: any) => method.tax_lines || [],
      );
      if (shippingTaxLines.length) {
        await tm.getRepository("ShippingMethodTaxLine").remove(shippingTaxLines);
      }
      const itemTaxLines = (draft.cart.items || []).flatMap(
        (item: any) => item.tax_lines || [],
      );
      if (itemTaxLines.length) {
        await tm.getRepository("LineItemTaxLine").remove(itemTaxLines);
      }

      const line = await lineItemService
        .withTransaction(tm)
        .generate(variant_id, draft.cart.region_id, quantity, {
          metadata,
          unit_price,
        });

      const existingItem = (draft.cart.items || []).find(
        (item: any) =>
          item.variant_id === variant_id &&
          item.should_merge === true &&
          JSON.stringify(item.metadata || {}) === JSON.stringify(metadata || {}),
      );

      const lineItemServiceTx = lineItemService.withTransaction(tm);
      if (existingItem && line.should_merge !== false) {
        await lineItemServiceTx.update(existingItem.id, {
          quantity: existingItem.quantity + quantity,
          ...(unit_price !== undefined && { unit_price }),
        });
      } else {
        await lineItemServiceTx.create({
          ...line,
          cart_id: cartId,
        });
      }

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
      const cartServiceTx = cartService.withTransaction(tm);
      await cartServiceTx.decorateTotals(cart);
      await cartServiceTx.setPaymentSessions(cart);

      if (cart.shipping_methods?.length) {
        await tm.getRepository("ShippingMethod").save(cart.shipping_methods);
      }
      await tm.getRepository("Cart").save(cart);
      draft.cart = cart;

      return draft;
    });

    res.status(200).json({
      draft_order: cleanResponseData(draftOrder, []),
    });
  } catch (error) {
    next(error);
  }
}
