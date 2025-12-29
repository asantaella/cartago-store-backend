import { NextFunction, Response } from "express";
import { MedusaRequest } from "@medusajs/medusa";
import SpanishTaxService from "../../services/spanish-tax";
import { adjustDiscountForTaxExempt } from "./cart-pricing-helpers";

/**
 * Middleware que persiste los precios recalculados antes de completar la orden
 * Este middleware intercepta POST /store/carts/:id/complete
 * IMPORTANTE: Persiste ANTES de crear la orden para que los valores correctos
 * se usen en las notificaciones enviadas al cliente
 *
 * Para zonas tax-exempt: obtiene el precio ajustado desde metadata y lo persiste en unit_price
 * Para zonas estándar: no hace cambios, ejecuta el método original
 */
export async function persistCartPricingOnComplete(
  req: MedusaRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const cartId = req.params.id;

    if (!cartId) {
      return next();
    }

    console.log(
      `[cart-pricing-middleware] COMPLETE cart ${cartId} - Persisting prices before order creation`
    );

    const manager = req.scope.resolve("manager");
    const spanishTaxService = req.scope.resolve(
      "spanishTaxService"
    ) as SpanishTaxService;

    // Ejecutar transacción ANTES de que el complete procese
    // Esta transacción DEBE completarse antes de continuar
    await manager.transaction(async (transactionalManager: any) => {
      const cartRepo = transactionalManager.getRepository("Cart");
      const lineItemRepo = transactionalManager.getRepository("LineItem");
      const shippingMethodRepo =
        transactionalManager.getRepository("ShippingMethod");
      const paymentSessionRepo =
        transactionalManager.getRepository("PaymentSession");

      // Obtener cart con relaciones, incluyendo payment_sessions
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
        console.log(
          `[cart-pricing-middleware] Cart ${cartId} not found or is draft_order, skipping`
        );
        return;
      }

      const postalCode = cart.shipping_address?.postal_code;

      if (!postalCode) {
        console.log(
          `[cart-pricing-middleware] Cart ${cartId} has no postal code, skipping`
        );
        return;
      }

      const isTaxExempt = spanishTaxService.isTaxExemptAddress(postalCode);
      const territoryType = spanishTaxService.getTerritoryType(postalCode);

      console.log(
        `[cart-pricing-middleware] Cart ${cartId} - postal=${postalCode} isTaxExempt=${isTaxExempt} territory=${territoryType}`
      );

      // Solo procesar si es zona tax-exempt
      if (!isTaxExempt) {
        console.log(
          `[cart-pricing-middleware] Cart ${cartId} is not tax-exempt, skipping persistence`
        );
        return;
      }

      let itemsUpdated = 0;
      let shippingUpdated = 0;

      // Verificar si los precios ya fueron ajustados previamente
      const pricesAlreadyAdjusted = cart.metadata?.prices_adjusted === true;

      console.log(
        `[cart-pricing-middleware] Cart ${cartId} - pricesAlreadyAdjusted=${pricesAlreadyAdjusted}`
      );

      // Para zonas tax-exempt: calcular y persistir precios ajustados
      if (!pricesAlreadyAdjusted) {
        // Actualizar precios de line items: obtener adjusted_unit_price desde metadata o calcularlo
        if (Array.isArray(cart.items) && cart.items.length > 0) {
          for (const item of cart.items) {
            // Obtener precio ajustado desde metadata o calcularlo
            let adjustedPrice = item.metadata?.adjusted_unit_price;
            
            if (!adjustedPrice || typeof adjustedPrice !== "number") {
              // Si no está en metadata, calcularlo ahora
              const priceWithTax = item.unit_price;
              adjustedPrice = Math.round(priceWithTax / 1.21);
              console.log(
                `[cart-pricing-middleware] WARNING: Item ${item.id} has no adjusted_unit_price in metadata, calculating now: ${adjustedPrice} cents`
              );
            }

            if (
              adjustedPrice &&
              typeof adjustedPrice === "number" &&
              isFinite(adjustedPrice)
            ) {
              const originalPrice = item.unit_price;

              // Actualizar unit_price con el precio ajustado
              // Solo actualizar si es diferente (tolerance de 1 centavo)
              if (Math.abs(originalPrice - adjustedPrice) > 1) {
                item.unit_price = adjustedPrice;

                console.log(
                  `[cart-pricing-middleware] Persisted item ${
                    item.id
                  }: originalPrice ${originalPrice} cents (${(
                    originalPrice / 100
                  ).toFixed(2)}€) → adjustedPrice ${adjustedPrice} cents (${(
                    adjustedPrice / 100
                  ).toFixed(2)}€)`
                );
              }

              // NO modificar discount_total - debe mantener el valor original
              // El descuento es el mismo en ambas regiones

              await lineItemRepo.save(item);
              itemsUpdated++;
            }
          }
        }

        // Actualizar precios de shipping methods: obtener adjusted_price desde data o calcularlo
        if (
          Array.isArray(cart.shipping_methods) &&
          cart.shipping_methods.length > 0
        ) {
          for (const method of cart.shipping_methods) {
            // Obtener precio ajustado desde data o calcularlo
            let adjustedShippingPrice = method.data?.adjusted_price;
            
            if (!adjustedShippingPrice || typeof adjustedShippingPrice !== "number") {
              // Si no está en data, calcularlo ahora
              const priceWithTax = method.price;
              adjustedShippingPrice = Math.round(priceWithTax / 1.21);
              console.log(
                `[cart-pricing-middleware] WARNING: Shipping method ${method.id} has no adjusted_price in data, calculating now: ${adjustedShippingPrice} cents`
              );
            }

            if (
              adjustedShippingPrice &&
              typeof adjustedShippingPrice === "number" &&
              isFinite(adjustedShippingPrice)
            ) {
              const originalPrice = method.price;

              // Solo actualizar si es diferente (tolerance de 1 centavo)
              if (Math.abs(originalPrice - adjustedShippingPrice) > 1) {
                method.price = adjustedShippingPrice;
                await shippingMethodRepo.save(method);

                shippingUpdated++;
                console.log(
                  `[cart-pricing-middleware] Persisted shipping ${
                    method.id
                  }: originalPrice ${originalPrice} cents (${(
                    originalPrice / 100
                  ).toFixed(
                    2
                  )}€) → adjustedPrice ${adjustedShippingPrice} cents (${(
                    adjustedShippingPrice / 100
                  ).toFixed(2)}€)`
                );
              }
            }
          }
        }
      } else {
        console.log(
          `[cart-pricing-middleware] Cart ${cartId} prices already adjusted, skipping persistence`
        );
      }

      // Actualizar metadata del carrito
      cart.metadata = {
        ...cart.metadata,
        territory_type: territoryType,
        prices_adjusted: true,
      };
      await cartRepo.save(cart);

      // Actualizar payment sessions para reflejar el nuevo total del carrito
      // Esto es crítico para evitar el error payment_intent_unexpected_state
      if (cart.payment_sessions && cart.payment_sessions.length > 0) {
        // Calcular nuevo total del carrito usando precios ajustados desde metadata
        // (independientemente de si ya se persistieron o no en unit_price)
        const newSubtotal = cart.items.reduce((sum, item) => {
          const adjustedPrice = item.metadata?.adjusted_unit_price;

          const price =
            adjustedPrice && typeof adjustedPrice === "number"
              ? adjustedPrice
              : item.unit_price;

          // El subtotal NO incluye descuentos
          return sum + price * item.quantity;
        }, 0);

        // Calcular descuento total - usar el valor de BD sin ajustes
        const totalDiscount = cart.items.reduce((sum, item) => {
          return sum + (item.discount_total || 0);
        }, 0);

        const newShippingTotal = cart.shipping_methods.reduce((sum, method) => {
          const adjustedPrice = method.data?.adjusted_price;
          const price =
            adjustedPrice && typeof adjustedPrice === "number"
              ? adjustedPrice
              : method.price;
          return sum + price;
        }, 0);

        const newTotal = newSubtotal + newShippingTotal - totalDiscount;

        console.log(
          `[cart-pricing-middleware] Updating payment sessions. Subtotal: ${newSubtotal} cents, Shipping: ${newShippingTotal} cents, Discount: ${totalDiscount} cents, New total: ${newTotal} cents (${(
            newTotal / 100
          ).toFixed(2)}€)`
        );

        for (const session of cart.payment_sessions) {
          const oldAmount = session.amount;
          session.amount = newTotal;

          // Actualizar data del payment session para reflejar el cambio
          session.data = {
            ...(session.data || {}),
            amount_adjusted_for_tax_exempt: true,
            original_amount: oldAmount,
          };

          await paymentSessionRepo.save(session);

          console.log(
            `[cart-pricing-middleware] Updated payment session ${session.id}: ${oldAmount} cents → ${newTotal} cents`
          );
        }
      }

      console.log(
        `[cart-pricing-middleware] Persisted cart ${cartId}: territory=${territoryType}, tax_exempt=${isTaxExempt}, items=${itemsUpdated}, shipping=${shippingUpdated}, payment_sessions_updated=${
          cart.payment_sessions?.length || 0
        }`
      );
    });

    // La transacción ya se completó. Los precios están persistidos en BD.
    // Ahora continuar con el proceso de complete para crear la orden
    console.log(
      `[cart-pricing-middleware] Cart ${cartId} prices persisted successfully. Proceeding to create order.`
    );

    // Continuar con el proceso de complete
    next();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      "[cart-pricing-middleware] Error persisting prices on complete:",
      msg
    );
    // Continuar incluso si hay error para no bloquear el checkout
    next();
  }
}
