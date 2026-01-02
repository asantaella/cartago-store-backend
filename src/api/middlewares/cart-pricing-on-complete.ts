import { NextFunction, Response } from "express";
import { MedusaRequest } from "@medusajs/medusa";
import {
  CartEntity,
  LineItemEntity,
  ShippingMethodEntity,
  PaymentSessionEntity,
  TransactionManager,
  resolveSpanishTaxService,
  resolveManager,
  getTaxContext,
  isValidPrice,
  getLineItemAdjustedPrice,
  getShippingMethodAdjustedPrice,
  calculateItemsSubtotal,
  calculateShippingTotal,
  calculateTotalDiscount,
  pricesAreDifferent,
  log,
  logError,
  logCartOperation,
  logPriceChange,
  safeMiddlewareExecution,
} from "./cart-pricing-helpers";

/**
 * Persiste el precio ajustado directamente en unit_price del line item
 */
async function persistLineItemUnitPrice(
  lineItemRepo: { save: (item: LineItemEntity) => Promise<LineItemEntity> },
  item: LineItemEntity,
  adjustedPrice: number
): Promise<boolean> {
  const originalPrice = item.unit_price;

  if (!pricesAreDifferent(originalPrice, adjustedPrice)) {
    return false;
  }

  item.unit_price = adjustedPrice;
  await lineItemRepo.save(item);

  logPriceChange("Persisted item", item.id, originalPrice, adjustedPrice);
  return true;
}

/**
 * Persiste el precio ajustado directamente en price del shipping method
 */
async function persistShippingMethodPrice(
  shippingMethodRepo: {
    save: (method: ShippingMethodEntity) => Promise<ShippingMethodEntity>;
  },
  method: ShippingMethodEntity,
  adjustedPrice: number
): Promise<boolean> {
  const originalPrice = method.price;

  if (!pricesAreDifferent(originalPrice, adjustedPrice)) {
    return false;
  }

  method.price = adjustedPrice;
  await shippingMethodRepo.save(method);

  logPriceChange("Persisted shipping", method.id, originalPrice, adjustedPrice);
  return true;
}

/**
 * Actualiza las payment sessions con el nuevo total del carrito
 */
async function updatePaymentSessions(
  paymentSessionRepo: {
    save: (session: PaymentSessionEntity) => Promise<PaymentSessionEntity>;
  },
  sessions: PaymentSessionEntity[],
  newTotal: number
): Promise<number> {
  let updatedCount = 0;

  for (const session of sessions) {
    const oldAmount = session.amount;
    session.amount = newTotal;
    session.data = {
      ...(session.data || {}),
      amount_adjusted_for_tax_exempt: true,
      original_amount: oldAmount,
    };

    await paymentSessionRepo.save(session);
    updatedCount++;

    log(
      `Updated payment session ${session.id}: ${oldAmount} cents → ${newTotal} cents`
    );
  }

  return updatedCount;
}

/**
 * Calcula el nuevo total del carrito usando precios ajustados
 */
function calculateAdjustedCartTotal(cart: CartEntity): {
  subtotal: number;
  shippingTotal: number;
  discount: number;
  total: number;
} {
  const subtotal = calculateItemsSubtotal(cart.items || [], true);
  const shippingTotal = calculateShippingTotal(
    cart.shipping_methods || [],
    true
  );
  const discount = calculateTotalDiscount(cart.items || []);
  const total = subtotal + shippingTotal - discount;

  return { subtotal, shippingTotal, discount, total };
}

/**
 * Middleware que persiste los precios recalculados antes de completar la orden
 * Este middleware intercepta POST /store/carts/:id/complete
 * IMPORTANTE: Persiste ANTES de crear la orden para que los valores correctos
 * se usen en las notificaciones enviadas al cliente
 */
export async function persistCartPricingOnComplete(
  req: MedusaRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  await safeMiddlewareExecution(
    "persistCartPricingOnComplete",
    async () => {
      const cartId = req.params.id;
      if (!cartId) {
        next();
        return;
      }

      log(`COMPLETE cart ${cartId} - Persisting prices before order creation`);

      const manager = resolveManager(req);
      const spanishTaxService = resolveSpanishTaxService(req);

      if (!manager || !spanishTaxService) {
        next();
        return;
      }

      // Ejecutar transacción ANTES de que el complete procese
      await manager.transaction(async (tm: TransactionManager) => {
        const cartRepo = tm.getRepository<CartEntity>("Cart");
        const lineItemRepo = tm.getRepository<LineItemEntity>("LineItem");
        const shippingMethodRepo =
          tm.getRepository<ShippingMethodEntity>("ShippingMethod");
        const paymentSessionRepo =
          tm.getRepository<PaymentSessionEntity>("PaymentSession");

        // Obtener cart con relaciones
        const cart = await cartRepo.findOne({
          where: { id: cartId },
          relations: [
            "items",
            "shipping_methods",
            "shipping_address",
            "payment_sessions",
          ],
        });

        if (!cart || cart.type === "draft_order") {
          log(`Cart ${cartId} not found or is draft_order, skipping`);
          return;
        }

        const taxContext = getTaxContext(cart, spanishTaxService);
        if (!taxContext) {
          log(`Cart ${cartId} has no postal code, skipping`);
          return;
        }

        logCartOperation("COMPLETE", cartId, {
          postal: taxContext.postalCode,
          isTaxExempt: taxContext.isTaxExempt,
          territory: taxContext.territoryType,
        });

        // Solo procesar si es zona tax-exempt
        if (!taxContext.isTaxExempt) {
          log(`Cart ${cartId} is not tax-exempt, skipping persistence`);
          return;
        }

        const pricesAlreadyAdjusted = cart.metadata?.prices_adjusted === true;
        log(`Cart ${cartId} - pricesAlreadyAdjusted=${pricesAlreadyAdjusted}`);

        let itemsUpdated = 0;
        let shippingUpdated = 0;

        // Para zonas tax-exempt: calcular y persistir precios ajustados
        if (!pricesAlreadyAdjusted) {
          // Actualizar precios de line items
          if (Array.isArray(cart.items) && cart.items.length > 0) {
            for (const item of cart.items) {
              const adjustedPrice = getLineItemAdjustedPrice(item);

              if (isValidPrice(adjustedPrice)) {
                const updated = await persistLineItemUnitPrice(
                  lineItemRepo,
                  item,
                  adjustedPrice
                );
                if (updated) itemsUpdated++;
              }
            }
          }

          // Actualizar precios de shipping methods
          if (
            Array.isArray(cart.shipping_methods) &&
            cart.shipping_methods.length > 0
          ) {
            for (const method of cart.shipping_methods) {
              const adjustedPrice = getShippingMethodAdjustedPrice(method);

              if (isValidPrice(adjustedPrice)) {
                const updated = await persistShippingMethodPrice(
                  shippingMethodRepo,
                  method,
                  adjustedPrice
                );
                if (updated) shippingUpdated++;
              }
            }
          }
        } else {
          log(`Cart ${cartId} prices already adjusted, skipping persistence`);
        }

        // Actualizar metadata del carrito
        cart.metadata = {
          ...cart.metadata,
          territory_type: taxContext.territoryType,
          prices_adjusted: true,
        };
        await cartRepo.save(cart);

        // Actualizar payment sessions para reflejar el nuevo total
        if (cart.payment_sessions && cart.payment_sessions.length > 0) {
          const { subtotal, shippingTotal, discount, total } =
            calculateAdjustedCartTotal(cart);

          log(
            `Updating payment sessions. Subtotal: ${subtotal} cents, Shipping: ${shippingTotal} cents, ` +
              `Discount: ${discount} cents, New total: ${total} cents (${(
                total / 100
              ).toFixed(2)}€)`
          );

          await updatePaymentSessions(
            paymentSessionRepo,
            cart.payment_sessions,
            total
          );
        }

        log(
          `Persisted cart ${cartId}: territory=${taxContext.territoryType}, ` +
            `tax_exempt=${taxContext.isTaxExempt}, items=${itemsUpdated}, ` +
            `shipping=${shippingUpdated}, payment_sessions=${
              cart.payment_sessions?.length || 0
            }`
        );
      });

      log(
        `Cart ${cartId} prices persisted successfully. Proceeding to create order.`
      );
      next();
    },
    next,
    true
  );
}
