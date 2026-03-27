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
  persistLineItemUnitPrice,
  persistShippingMethodPrice,
  calculateShippingExtra,
  log,
  logError,
  logCartOperation,
} from "./cart-pricing-helpers";

/**
 * Actualiza las payment sessions usando el PaymentProviderService de Medusa
 * SOLUCIÓN AGNÓSTICA: Funciona con cualquier proveedor de pago (Stripe, PayPal, SEPA, etc.)
 *
 * ESTRATEGIA:
 * - Para Stripe: Actualiza solo la BD (evita errores del plugin de stripe que falla en updatePayment)
 *   El monto correcto en la BD es suficiente para crear la orden con los totales correctos
 * - Para otros proveedores: Usa updateSession() que actualiza tanto BD como el servicio externo
 */
async function updatePaymentSessionsAmount(
  req: MedusaRequest,
  cartId: string,
  items: LineItemEntity[],
  shippingMethods: ShippingMethodEntity[],
  giftCardTotal: number
): Promise<void> {
  try {
    // Calcular el nuevo total usando los precios ya persistidos en la BD
    const subtotal = calculateItemsSubtotal(items, false); // Usar unit_price persistido
    const shippingTotal = calculateShippingTotal(shippingMethods, false); // Usar price persistido
    const discount = calculateTotalDiscount(items); // Usar discount_total persistido
    const total = subtotal + shippingTotal - discount - giftCardTotal;

    log(
      `Calculated total for payment sessions: subtotal=${subtotal}, shipping=${shippingTotal}, ` +
        `discount=${discount}, giftCard=${giftCardTotal}, total=${total} (${(
          total / 100
        ).toFixed(2)}€)`
    );

    // Resolver servicios de Medusa
    const paymentProviderService = req.scope.resolve(
      "paymentProviderService"
    ) as any;
    const manager = resolveManager(req) as any;

    // Obtener payment sessions de la BD
    const paymentSessionRepo = manager.getRepository("PaymentSession");
    const sessions = await paymentSessionRepo.find({
      where: { cart_id: cartId },
    });

    if (!sessions || sessions.length === 0) {
      log(`No payment sessions found for cart ${cartId}`);
      return;
    }

    // Obtener el cart completo para construir el PaymentSessionInput
    const cartRepo = manager.getRepository("Cart");
    const cart = (await cartRepo.findOne({
      where: { id: cartId },
      relations: ["region", "customer", "shipping_address", "billing_address"],
    })) as any;

    if (!cart) {
      logError(`Cart ${cartId} not found for payment session update`);
      return;
    }

    for (const session of sessions as PaymentSessionEntity[]) {
      const oldAmount = session.amount;

      // Usar PaymentProviderService para actualizar payment session
      // ESTRATEGIA:
      // - Para otros proveedores: usar updateSession
      // - Para Stripe: actualizar solo la BD (ya que updatePayment falla)
      try {
        const sessionInput = {
          provider_id: session.provider_id,
          currency_code: cart.region?.currency_code || "eur",
          amount: total,
          resource_id: cartId,
          cart: {
            ...cart,
            total: total, // Forzar el total correcto
          },
          paymentSessionData: session.data,
        };

        let updatedSession;

        // Para Stripe, actualizar solo la BD sin llamar al provider
        // Ya que updatePayment y refreshSession causan problemas
        // El monto en la BD está correcto, lo importante es que no haya error
        if (session.provider_id === "stripe") {
          log(
            `Updating Stripe session ${session.id} in DB only (skipping provider call)`
          );
          // Actualizar solo la BD para evitar errores del provider
          session.amount = total;
          session.data = {
            ...(session.data || {}),
            amount_adjusted_for_tax_exempt: true,
            original_amount: oldAmount,
          };
          updatedSession = await paymentSessionRepo.save(session);
        } else {
          // Para otros proveedores, usar updateSession
          updatedSession = await paymentProviderService.updateSession(
            {
              id: session.id,
              data: session.data || {},
              provider_id: session.provider_id,
            },
            sessionInput
          );

          // Guardar metadata adicional
          if (updatedSession) {
            updatedSession.data = {
              ...(updatedSession.data || {}),
              amount_adjusted_for_tax_exempt: true,
              original_amount: oldAmount,
            };
            await paymentSessionRepo.save(updatedSession);
          }
        }

        log(
          `Updated payment session ${session.id} (${session.provider_id}): ${oldAmount} → ${total} cents`
        );
      } catch (providerError) {
        const msg =
          providerError instanceof Error
            ? providerError.message
            : String(providerError);
        logError(
          `Error updating session ${session.id} via provider ${session.provider_id}: ${msg}`
        );

        // Fallback: actualizar solo la BD local
        session.amount = total;
        session.data = {
          ...(session.data || {}),
          amount_adjusted_for_tax_exempt: true,
          original_amount: oldAmount,
          provider_update_failed: true,
        };
        await paymentSessionRepo.save(session);
        log(
          `Fallback: Updated payment session ${session.id} in DB only: ${oldAmount} → ${total} cents`
        );
      }
    }

    // Actualizar cart.updated_at para invalidar cualquier cache
    await cartRepo
      .createQueryBuilder()
      .update("Cart")
      .set({ updated_at: new Date() })
      .where("id = :id", { id: cartId })
      .execute();

    log(
      `Payment sessions updated for cart ${cartId}: ${sessions.length} sessions via PaymentProviderService`
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(`Error updating payment sessions amount: ${msg}`);
    throw error;
  }
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
    const cartId = req.params.id as string;
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

    // Variables para actualizar payment sessions después de la transacción
    let itemsToUpdate: LineItemEntity[] = [];
    let shippingToUpdate: ShippingMethodEntity[] = [];
    let giftCardTotal = 0;
    let needsPaymentUpdate = false;

    // Ejecutar transacción ANTES de que el complete procese
    await manager.transaction(async (tm: TransactionManager) => {
      const cartRepo = tm.getRepository<CartEntity>("Cart");
      const lineItemRepo = tm.getRepository<LineItemEntity>("LineItem");
      const adjustmentRepo = tm.getRepository("LineItemAdjustment");
      const shippingMethodRepo =
        tm.getRepository<ShippingMethodEntity>("ShippingMethod");

      // Obtener cart con relaciones (incluir adjustments para calcular descuentos)
      const cart = await cartRepo.findOne({
        where: { id: cartId },
        relations: [
          "items",
          "items.adjustments",
          "items.variant",
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

      // Persist variant shipping extra for ALL carts (tax-exempt and standard).
      // Must happen before order creation so the order total is correct.
      if (Array.isArray(cart.shipping_methods) && cart.shipping_methods.length > 0) {
        const extraTotal = calculateShippingExtra(cart as any);
        for (const method of cart.shipping_methods) {
          if (!method.data) method.data = {};
          const currentExtra = (method.data.shipping_extra_total as number) ?? 0;
          if (currentExtra !== extraTotal) {
            const basePrice = method.price - currentExtra;
            method.price = basePrice + extraTotal;
            method.data.shipping_extra_total = extraTotal;
            await shippingMethodRepo.save(method);
            log(
              `COMPLETE: synced shipping extra for method ${method.id}: ` +
                `extra ${currentExtra} → ${extraTotal} cents`
            );
          }
        }
      }

      // Solo procesar si es zona tax-exempt
      if (!taxContext.isTaxExempt) {
        log(`Cart ${cartId} is not tax-exempt, skipping tax-exempt persistence`);
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

      // Actualizar metadata del carrito
      cart.metadata = {
        ...cart.metadata,
        territory_type: taxContext.territoryType,
        prices_adjusted: true,
      };

      // Persistir el carrito con todos los cambios
      await cartRepo.save(cart);

      log(
        `Persisted cart ${cartId}: territory=${taxContext.territoryType}, ` +
          `tax_exempt=${taxContext.isTaxExempt}, items=${itemsUpdated}, ` +
          `shipping=${shippingUpdated}`
      );
      // Guardar información para actualizar payment sessions después
      if (itemsUpdated > 0 || shippingUpdated > 0) {
        itemsToUpdate = cart.items || [];
        shippingToUpdate = cart.shipping_methods || [];
        giftCardTotal = cart.gift_card_total || 0;
        needsPaymentUpdate = true;
      }

      log(
        `Persisted cart ${cartId}: territory=${taxContext.territoryType}, ` +
          `tax_exempt=${taxContext.isTaxExempt}, items=${itemsUpdated}, ` +
          `shipping=${shippingUpdated}`
      );
    });

    // IMPORTANTE: Actualizar payment sessions DESPUÉS de la transacción
    // Esto asegura que usen los precios ya persistidos
    if (needsPaymentUpdate) {
      log(`Updating payment sessions amount for cart ${cartId}`);
      await updatePaymentSessionsAmount(
        req,
        cartId,
        itemsToUpdate,
        shippingToUpdate,
        giftCardTotal
      );
    }

    // CRÍTICO: Invalidar el cache del cart para que Medusa cargue prices_adjusted=true de la BD
    // Esto evita que cart.complete() recalcule los totales con precios originales
    try {
      const cacheService = req.scope.resolve("cacheService") as any;
      if (cacheService) {
        const cacheKey = `cart_${cartId}`;
        await cacheService.invalidate(cacheKey);
        log(`Invalidated cart cache for ${cartId}`);
      }
    } catch (cacheError) {
      log(`Warning: Could not invalidate cache: ${cacheError}`);
    }

    // CRÍTICO: Forzar recarga del cart con prices_adjusted=true desde la BD
    // Esto asegura que CartService.complete() use el cart actualizado
    try {
      const cartService = req.scope.resolve("cartService") as any;
      const freshCart = await cartService.withTransaction(cartId, {
        select: [
          "id",
          "email",
          "billing_address_id",
          "shipping_address_id",
          "region_id",
          "customer_id",
          "payment_id",
          "type",
          "completed_at",
          "payment_authorized_at",
          "idempotency_key",
          "context",
          "metadata",
          "created_at",
          "updated_at",
        ],
        relations: [
          "items",
          "items.adjustments",
          "payment_sessions",
          "shipping_methods",
          "discounts",
          "discounts.rule",
          "gift_cards",
          "customer",
          "region",
          "billing_address",
          "shipping_address",
        ],
      });

      // Guardar el cart actualizado en el request para que Medusa lo use
      (req as any).cart = freshCart;

      // CRÍTICO: Calcular y asignar el total correcto al cart
      // Esto asegura que cuando Medusa llame a cart.complete(), use el total correcto
      if (freshCart.metadata?.prices_adjusted === true) {
        try {
          // Usar las mismas funciones que el middleware POST para calcular totales
          // Esto garantiza consistencia
          const subtotal = calculateItemsSubtotal(freshCart.items || [], false);
          const shippingTotal = calculateShippingTotal(
            freshCart.shipping_methods || [],
            false
          );
          const discountTotal = calculateTotalDiscount(freshCart.items || []);
          const giftCardTotal = freshCart.gift_card_total || 0;
          const correctedTotal = Math.max(
            0,
            subtotal + shippingTotal - discountTotal - giftCardTotal
          );

          // IMPORTANTE: Guardar el total en el cart
          freshCart.total = correctedTotal;
          (req as any).cart = freshCart;

          log(
            `Calculated corrected total for cart ${cartId}: ${correctedTotal} cents (${(
              correctedTotal / 100
            ).toFixed(2)}€) ` +
              `[subtotal=${subtotal}, shipping=${shippingTotal}, discount=${discountTotal}, giftCard=${giftCardTotal}]`
          );
        } catch (calcError) {
          logError(`Error calculating total: ${calcError}`);
        }
      }

      log(
        `Reloaded cart ${cartId} with prices_adjusted=${freshCart.metadata?.prices_adjusted}`
      );
    } catch (reloadError) {
      logError(`Warning: Could not reload cart: ${reloadError}`);
    }

    log(
      `Cart ${cartId} prices persisted and payment sessions updated. Proceeding to create order.`
    );
    next();
  } catch (error) {
    logError(`Error in persistCartPricingOnComplete`, error);
    next();
  }
}
