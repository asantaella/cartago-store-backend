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
  calculateDiscountFromAdjustments,
  calculateAdjustedDiscount,
  adjustGiftCardTotal,
  pricesAreDifferent,
  log,
  logError,
  logCartOperation,
  logPriceChange,
} from "./cart-pricing-helpers";

/**
 * Persiste el precio ajustado directamente en unit_price del line item
 * Recalcula el descuento proporcionalmente y actualiza adjustments
 */
async function persistLineItemUnitPrice(
  lineItemRepo: { save: (item: LineItemEntity) => Promise<LineItemEntity> },
  adjustmentRepo: any,
  item: LineItemEntity,
  adjustedPrice: number
): Promise<boolean> {
  const originalPrice = item.unit_price;

  if (!pricesAreDifferent(originalPrice, adjustedPrice)) {
    return false;
  }

  // Obtener el descuento original desde adjustments o discount_total
  const discountFromAdjustments = calculateDiscountFromAdjustments(
    (item as any).adjustments
  );
  const originalDiscount =
    discountFromAdjustments > 0
      ? discountFromAdjustments
      : item.discount_total || 0;

  // Recalcular descuento proporcionalmente al cambio de precio
  const adjustedDiscount = calculateAdjustedDiscount(
    originalDiscount,
    originalPrice,
    adjustedPrice
  );

  log(
    `COMPLETE item ${item.id} - originalPrice: ${originalPrice}, adjustedPrice: ${adjustedPrice}, ` +
      `originalDiscount: ${originalDiscount}, adjustedDiscount: ${adjustedDiscount}`
  );

  item.unit_price = adjustedPrice;
  item.discount_total = adjustedDiscount;
  await lineItemRepo.save(item);

  // Actualizar los adjustments de descuento con el nuevo importe
  if (Array.isArray((item as any).adjustments)) {
    for (const adj of (item as any).adjustments) {
      if (adj && adj.description === "discount") {
        const sign = adj.amount >= 0 ? 1 : -1;
        adj.amount = sign * Math.abs(adjustedDiscount);
        await adjustmentRepo.save(adj);
        log(
          `Updated adjustment ${adj.id} for item ${item.id}: ${originalDiscount} cents → ${adj.amount} cents`
        );
      }
    }
  }

  logPriceChange("Persisted item", item.id, originalPrice, adjustedPrice);
  log(
    `Persisted discount for item ${item.id}: ${originalDiscount} cents → ${adjustedDiscount} cents`
  );

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
  try {
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
      const adjustmentRepo = tm.getRepository("LineItemAdjustment");
      const shippingMethodRepo =
        tm.getRepository<ShippingMethodEntity>("ShippingMethod");
      const paymentSessionRepo =
        tm.getRepository<PaymentSessionEntity>("PaymentSession");

      // Obtener cart con relaciones (incluir adjustments para calcular descuentos)
      const cart = await cartRepo.findOne({
        where: { id: cartId },
        relations: [
          "items",
          "items.adjustments",
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
      let giftCardAdjusted = false;

      // Para zonas tax-exempt: calcular y persistir precios ajustados
      if (!pricesAlreadyAdjusted) {
        // Ajustar gift_card_total si existe
        const originalGiftCardTotal = cart.gift_card_total || 0;
        if (originalGiftCardTotal > 0) {
          const adjustedGiftCardTotal = adjustGiftCardTotal(
            originalGiftCardTotal
          );

          // Guardar el gift card total original en metadata
          if (!cart.metadata) {
            cart.metadata = {};
          }
          cart.metadata.original_gift_card_total = originalGiftCardTotal;

          // Actualizar el gift_card_total del carrito
          cart.gift_card_total = adjustedGiftCardTotal;
          giftCardAdjusted = true;

          log(
            `COMPLETE cart ${cartId} - Gift card adjusted: ${originalGiftCardTotal} cents (${(
              originalGiftCardTotal / 100
            ).toFixed(2)}€) → ${adjustedGiftCardTotal} cents (${(
              adjustedGiftCardTotal / 100
            ).toFixed(2)}€)`
          );
        }
        // Actualizar precios de line items
        if (Array.isArray(cart.items) && cart.items.length > 0) {
          for (const item of cart.items) {
            const adjustedPrice = getLineItemAdjustedPrice(item);

            log(
              `COMPLETE item ${item.id} - unit_price: ${item.unit_price} cents, ` +
                `discount_total: ${
                  item.discount_total || 0
                } cents, adjustments: ${JSON.stringify(
                  item.adjustments || []
                )}, ` +
                `adjustedPrice: ${adjustedPrice} cents`
            );

            if (isValidPrice(adjustedPrice)) {
              const updated = await persistLineItemUnitPrice(
                lineItemRepo,
                adjustmentRepo,
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

      // Actualizar metadata del carrito (esto también persiste gift_card_total si fue ajustado)
      cart.metadata = {
        ...cart.metadata,
        territory_type: taxContext.territoryType,
        prices_adjusted: true,
      };

      // Persistir el carrito con todos los cambios (incluyendo gift_card_total ajustado)
      await cartRepo.save(cart);

      if (giftCardAdjusted) {
        log(
          `Cart ${cartId} gift_card_total persisted: ${cart.gift_card_total} cents`
        );
      }

      // Actualizar payment sessions para reflejar el nuevo total
      if (cart.payment_sessions && cart.payment_sessions.length > 0) {
        const subtotal = calculateItemsSubtotal(cart.items || [], true);
        const shippingTotal = calculateShippingTotal(
          cart.shipping_methods || [],
          true
        );
        const discount = calculateTotalDiscount(cart.items || []);
        const giftCardTotal = cart.gift_card_total || 0;
        const total = subtotal + shippingTotal - discount - giftCardTotal;

        log(
          `Updating payment sessions. Subtotal: ${subtotal} cents, Shipping: ${shippingTotal} cents, ` +
            `Discount: ${discount} cents, Gift card: ${giftCardTotal} cents, New total: ${total} cents (${(
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
          `shipping=${shippingUpdated}, gift_card=${
            giftCardAdjusted ? "adjusted" : "none"
          }, payment_sessions=${cart.payment_sessions?.length || 0}`
      );
    });

    log(
      `Cart ${cartId} prices persisted successfully. Proceeding to create order.`
    );
    next();
  } catch (error) {
    logError(`Error in persistCartPricingOnComplete`, error);
    next();
  }
}
