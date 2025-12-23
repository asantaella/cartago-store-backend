import { NextFunction, Request, Response } from "express";
import { MedusaRequest } from "@medusajs/medusa";
import SpanishTaxService from "../../services/spanish-tax";

// Helper para calcular precio sin IVA (trabaja con centavos - integers)
// Recibe precio en centavos (ej: 1000 = 10.00€) y devuelve precio sin IVA en centavos
function calculatePriceWithoutTax(priceInCents: number): number {
  return priceInCents / 1.21;
}

// Helper para calcular impuestos del IVA 21% (trabaja con centavos)
function calculateTaxAmount(priceInCents: number): number {
  return priceInCents * 0.21;
}

/**
 * Middleware que recalcula los precios del carrito en las respuestas GET
 * según el código postal de la dirección de envío para zonas con tax 0%
 */
export async function adjustCartPricingOnGet(
  req: MedusaRequest,
  res: Response,
  next: NextFunction
) {
  const originalJson = res.json.bind(res);

  res.json = function (body: any) {
    try {
      // Solo procesar si hay un cart en la respuesta
      if (!(body && body.cart)) {
        return originalJson(body);
      }

      const cart = body.cart;
      const postalCode = cart.shipping_address?.postal_code;

      if (!postalCode) {
        return originalJson(body);
      }

      const spanishTaxService = req.scope.resolve(
        "spanishTaxService"
      ) as SpanishTaxService;

      const isTaxExempt = spanishTaxService.isTaxExemptAddress(postalCode);
      const territoryType = spanishTaxService.getTerritoryType(postalCode);

      console.log(
        `[cart-pricing-middleware] GET cart ${cart.id} - postal=${postalCode} isTaxExempt=${isTaxExempt} territory=${territoryType}`
      );

      // Verificar si los precios ya fueron ajustados (persisted sin IVA en BD)
      const pricesAlreadyAdjusted = cart.metadata?.prices_adjusted === true;

      // Recalcular precios de line items: mostrar subtotal neto en respuesta
      if (Array.isArray(cart.items) && cart.items.length > 0) {
        for (const item of cart.items) {
          const unitPrice = item.unit_price;

          if (typeof unitPrice !== "number" || !isFinite(unitPrice)) {
            continue;
          }

          let basePrice: number;
          let priceWithTax: number;

          if (pricesAlreadyAdjusted) {
            // Los precios en BD ya están sin IVA (basePrice)
            basePrice = unitPrice;
            // Reconstruir priceWithTax para referencia
            priceWithTax = Math.round(basePrice * 1.21 * 100) / 100;
          } else {
            // Los precios en BD tienen IVA, calcular basePrice
            priceWithTax = unitPrice;
            basePrice = calculatePriceWithoutTax(priceWithTax);
          }

          // `netPrice` mantenemos como el precio CON IVA cuando se necesite referenciar
          const netPrice = priceWithTax;

          // El subtotal se calcula sobre el precio SIN IVA (solo para mostrar)
          item.subtotal = basePrice * (item.quantity || 1);

          console.log(
            `[cart-pricing-middleware] GET item ${item.id} - priceWithTax: ${priceWithTax}, basePrice: ${basePrice}, subtotal: ${item.subtotal}, alreadyAdjusted: ${pricesAlreadyAdjusted}`
          );
        }
      }

      // Mostrar precios de shipping netos en respuesta (no modificar en BD)
      if (
        Array.isArray(cart.shipping_methods) &&
        cart.shipping_methods.length > 0
      ) {
        for (const method of cart.shipping_methods) {
          const shippingPrice = method.price;
          if (typeof shippingPrice !== "number" || !isFinite(shippingPrice)) {
            continue;
          }

          let baseShippingPrice: number;
          let priceWithTax: number;

          if (pricesAlreadyAdjusted) {
            // Los precios en BD ya están sin IVA
            baseShippingPrice = shippingPrice;
            priceWithTax = Math.round(baseShippingPrice * 1.21 * 100) / 100;
          } else {
            // Los precios en BD tienen IVA
            priceWithTax = shippingPrice;
            baseShippingPrice = calculatePriceWithoutTax(priceWithTax);
          }

          // Crear propiedad para mostrar el neto (no sobreescribir price)
          (method as any).price_without_tax = baseShippingPrice;

          console.log(
            `[cart-pricing-middleware] GET shipping - priceWithTax: ${priceWithTax}, baseShippingPrice: ${baseShippingPrice}, alreadyAdjusted: ${pricesAlreadyAdjusted}`
          );
        }
      }

      // Recalcular totales del carrito
      // Subtotal = suma de precios netos (sin IVA) de los items
      cart.subtotal =
        cart.items?.reduce(
          (sum: number, item: any) => sum + (item.subtotal || 0),
          0
        ) || 0;

      // Envío neto (sin IVA) - calcular desde price con IVA
      const shippingTotal =
        cart.shipping_methods?.reduce((sum: number, method: any) => {
          const shippingWithTax = method.price;
          if (
            typeof shippingWithTax === "number" &&
            isFinite(shippingWithTax)
          ) {
            return sum + calculatePriceWithoutTax(shippingWithTax);
          }
          return sum;
        }, 0) || 0;

      cart.shipping_total = shippingTotal;

      // Calcular impuestos: 0 para zonas tax-exempt, 21% para zonas estándar
      if (isTaxExempt) {
        cart.tax_total = 0;
      } else {
        const subtotalWithShipping = cart.subtotal + shippingTotal;
        cart.tax_total = calculateTaxAmount(subtotalWithShipping);
      }

      // Total = subtotal neto + envío neto + impuestos
      cart.total =
        cart.subtotal +
        shippingTotal +
        cart.tax_total +
        (cart.discount_total || 0);

      // Marcar en metadata el territorio
      cart.metadata = {
        ...cart.metadata,
        territory_type: territoryType,
        prices_adjusted: isTaxExempt,
      };
    } catch (error) {
      console.error(
        "[cart-pricing-middleware] Error adjusting prices on GET:",
        (error as any).message
      );
    }

    return originalJson(body);
  };

  next();
}

/**
 * Middleware que recalcula los precios del carrito en las peticiones POST/PATCH
 * según el código postal de la dirección de envío para zonas con tax 0%
 * SOLO AJUSTA LA RESPUESTA - NO PERSISTE EN BD
 */
export async function adjustCartPricingOnPost(
  req: MedusaRequest,
  res: Response,
  next: NextFunction
) {
  const originalJson = res.json.bind(res);

  res.json = function (body: any) {
    try {
      if (!(body && body.cart)) {
        return originalJson(body);
      }

      const cart = body.cart;
      const postalCode = cart.shipping_address?.postal_code;

      if (!postalCode) {
        return originalJson(body);
      }

      const spanishTaxService = req.scope.resolve(
        "spanishTaxService"
      ) as SpanishTaxService;

      const isTaxExempt = spanishTaxService.isTaxExemptAddress(postalCode);
      const territoryType = spanishTaxService.getTerritoryType(postalCode);

      console.log(
        `[cart-pricing-middleware] POST cart ${cart.id} - postal=${postalCode} isTaxExempt=${isTaxExempt} territory=${territoryType}`
      );

      // Verificar si los precios ya fueron ajustados (persisted sin IVA en BD)
      const pricesAlreadyAdjusted = cart.metadata?.prices_adjusted === true;

      // Recalcular precios de line items: mostrar subtotal neto en respuesta
      if (Array.isArray(cart.items) && cart.items.length > 0) {
        for (const item of cart.items) {
          const unitPrice = item.unit_price;

          if (typeof unitPrice !== "number" || !isFinite(unitPrice)) {
            continue;
          }

          let basePrice: number;
          let priceWithTax: number;

          if (pricesAlreadyAdjusted) {
            // Los precios en BD ya están sin IVA (basePrice)
            basePrice = unitPrice;
            // Reconstruir priceWithTax para referencia
            priceWithTax = Math.round(basePrice * 1.21 * 100) / 100;
          } else {
            // Los precios en BD tienen IVA, calcular basePrice
            priceWithTax = unitPrice;
            basePrice = calculatePriceWithoutTax(priceWithTax);
          }

          // `netPrice` mantenemos como el precio CON IVA cuando se necesite referenciar
          const netPrice = priceWithTax;

          // El subtotal se calcula sobre el precio SIN IVA (solo para mostrar)
          item.subtotal = basePrice * (item.quantity || 1);

          console.log(
            `[cart-pricing-middleware] POST item ${item.id} - priceWithTax: ${priceWithTax}, basePrice: ${basePrice}, subtotal: ${item.subtotal}, alreadyAdjusted: ${pricesAlreadyAdjusted}`
          );
        }
      }

      // Mostrar precios de shipping netos en respuesta (no modificar en BD)
      if (
        Array.isArray(cart.shipping_methods) &&
        cart.shipping_methods.length > 0
      ) {
        for (const method of cart.shipping_methods) {
          const shippingPrice = method.price;
          if (typeof shippingPrice !== "number" || !isFinite(shippingPrice)) {
            continue;
          }

          let baseShippingPrice: number;
          let priceWithTax: number;

          if (pricesAlreadyAdjusted) {
            // Los precios en BD ya están sin IVA
            baseShippingPrice = shippingPrice;
            priceWithTax = Math.round(baseShippingPrice * 1.21 * 100) / 100;
          } else {
            // Los precios en BD tienen IVA
            priceWithTax = shippingPrice;
            baseShippingPrice = calculatePriceWithoutTax(priceWithTax);
          }

          // Crear propiedad para mostrar el neto (no sobreescribir price)
          (method as any).price_without_tax = baseShippingPrice;

          console.log(
            `[cart-pricing-middleware] POST shipping - priceWithTax: ${priceWithTax}, baseShippingPrice: ${baseShippingPrice}, alreadyAdjusted: ${pricesAlreadyAdjusted}`
          );
        }
      }

      // Recalcular totales del carrito
      // Subtotal = suma de precios netos (sin IVA) de los items
      cart.subtotal =
        cart.items?.reduce(
          (sum: number, item: any) => sum + (item.subtotal || 0),
          0
        ) || 0;

      // Envío neto (sin IVA) - calcular desde price con IVA
      const shippingTotal =
        cart.shipping_methods?.reduce((sum: number, method: any) => {
          const shippingWithTax = method.price;
          if (
            typeof shippingWithTax === "number" &&
            isFinite(shippingWithTax)
          ) {
            return sum + calculatePriceWithoutTax(shippingWithTax);
          }
          return sum;
        }, 0) || 0;

      cart.shipping_total = shippingTotal;

      // Calcular impuestos: 0 para zonas tax-exempt, 21% para zonas estándar
      if (isTaxExempt) {
        cart.tax_total = 0;
      } else {
        const subtotalWithShipping = cart.subtotal + shippingTotal;
        cart.tax_total = calculateTaxAmount(subtotalWithShipping);
      }

      // Total = subtotal neto + envío neto + impuestos
      cart.total =
        cart.subtotal +
        shippingTotal +
        cart.tax_total +
        (cart.discount_total || 0);

      // Marcar en metadata el territorio
      cart.metadata = {
        ...cart.metadata,
        territory_type: territoryType,
        prices_adjusted: isTaxExempt,
      };
    } catch (error) {
      console.error(
        "[cart-pricing-middleware] Error adjusting prices on POST/PATCH:",
        (error as any).message
      );
    }

    return originalJson(body);
  };

  next();
}

/**
 * Middleware que persiste los precios recalculados antes de completar la orden
 * Este middleware intercepta POST /store/carts/:id/complete
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

    // Interceptar la respuesta para ajustar totales de la orden creada
    const originalJson = res.json.bind(res);

    // Ejecutar transacción ANTES de que el complete procese
    await manager.transaction(async (transactionalManager: any) => {
      const cartRepo = transactionalManager.getRepository("Cart");
      const lineItemRepo = transactionalManager.getRepository("LineItem");
      const shippingMethodRepo =
        transactionalManager.getRepository("ShippingMethod");

      // Obtener cart con relaciones, incluyendo payment_sessions y payment
      const cart = await cartRepo.findOne({
        where: { id: cartId },
        relations: [
          "items",
          "items.variant",
          "items.variant.prices",
          "shipping_methods",
          "shipping_methods.shipping_option",
          "shipping_address",
          "payment_sessions",
          "payment",
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

      let itemsUpdated = 0;
      let shippingUpdated = 0;

      // Para zonas tax-exempt: persistir unit_price neto (sin IVA) en BD
      // Para zonas estándar: mantener unit_price bruto (con IVA) en BD
      if (isTaxExempt) {
        // Actualizar precios de line items: convertir de priceWithTax (con IVA) a basePrice (sin IVA)
        if (Array.isArray(cart.items) && cart.items.length > 0) {
          for (const item of cart.items) {
            const priceWithTax = item.unit_price; // en centavos (ej: 1000 = 10.00€)

            if (typeof priceWithTax === "number" && isFinite(priceWithTax)) {
              // Calcular basePrice (sin IVA) en centavos
              const basePrice = calculatePriceWithoutTax(priceWithTax);

              // Solo actualizar si es diferente (tolerance de 1 centavo)
              if (Math.abs(priceWithTax - basePrice) > 1) {
                await lineItemRepo.update(item.id, {
                  unit_price: basePrice, // entero en centavos
                });
                itemsUpdated++;
                console.log(
                  `[cart-pricing-middleware] Persisted item ${
                    item.id
                  }: priceWithTax ${priceWithTax} cents (${(
                    priceWithTax / 100
                  ).toFixed(2)}€) → basePrice ${basePrice} cents (${(
                    basePrice / 100
                  ).toFixed(2)}€)`
                );
              }
            }
          }
        }

        // Actualizar precios de shipping methods: convertir de priceWithTax a basePrice
        if (
          Array.isArray(cart.shipping_methods) &&
          cart.shipping_methods.length > 0
        ) {
          for (const method of cart.shipping_methods) {
            const priceWithTax = method.price; // en centavos

            if (typeof priceWithTax === "number" && isFinite(priceWithTax)) {
              // Calcular basePrice (sin IVA) en centavos
              const baseShippingPrice = calculatePriceWithoutTax(priceWithTax);

              // Solo actualizar si es diferente (tolerance de 1 centavo)
              if (Math.abs(priceWithTax - baseShippingPrice) > 1) {
                await shippingMethodRepo.update(method.id, {
                  price: baseShippingPrice, // entero en centavos
                });
                shippingUpdated++;
                console.log(
                  `[cart-pricing-middleware] Persisted shipping ${
                    method.id
                  }: priceWithTax ${priceWithTax} cents (${(
                    priceWithTax / 100
                  ).toFixed(2)}€) → basePrice ${baseShippingPrice} cents (${(
                    baseShippingPrice / 100
                  ).toFixed(2)}€)`
                );
              }
            }
          }
        }
      }

      // Actualizar metadata del carrito
      // NOTA: Los totales (subtotal, shipping_total, tax_total, total) se calculan
      // dinámicamente en Medusa desde los line items y shipping methods.
      // No se pueden persistir directamente en el Cart.
      await cartRepo.update(cart.id, {
        metadata: {
          ...cart.metadata,
          territory_type: territoryType,
          prices_adjusted: isTaxExempt,
        },
      });

      console.log(
        `[cart-pricing-middleware] Persisted cart ${cartId}: territory=${territoryType}, tax_exempt=${isTaxExempt}, items=${itemsUpdated}, shipping=${shippingUpdated}`
      );
    });

    // Interceptar respuesta para ajustar totales de la orden
    res.json = function (body: any) {
      try {
        if (body && body.type === "order" && body.data) {
          const order = body.data;

          // Si la orden tiene metadata de precios ajustados, recalcular totales
          if (
            order.metadata?.prices_adjusted === true ||
            order.cart?.metadata?.prices_adjusted === true
          ) {
            console.log(
              `[cart-pricing-middleware] Adjusting order ${order.id} totals for tax-exempt zone`
            );

            // Recalcular subtotal desde items (valores en centavos)
            if (Array.isArray(order.items) && order.items.length > 0) {
              const subtotal = order.items.reduce(
                (sum: number, item: any) =>
                  sum + (item.unit_price * item.quantity || 0),
                0
              );
              order.subtotal = subtotal; // ya es integer en centavos
            }

            // Recalcular shipping_total desde shipping_methods (valores en centavos)
            if (
              Array.isArray(order.shipping_methods) &&
              order.shipping_methods.length > 0
            ) {
              const shippingTotal = order.shipping_methods.reduce(
                (sum: number, method: any) => sum + (method.price || 0),
                0
              );
              order.shipping_total = shippingTotal; // ya es integer en centavos
            }

            // tax_total debe ser 0 para tax-exempt
            order.tax_total = 0;

            // Recalcular total
            order.total =
              (order.subtotal || 0) +
              (order.shipping_total || 0) +
              (order.tax_total || 0) -
              (order.discount_total || 0);

            console.log(
              `[cart-pricing-middleware] Order ${order.id} adjusted totals: subtotal=${order.subtotal}, shipping=${order.shipping_total}, tax=${order.tax_total}, total=${order.total}`
            );
          }
        }
      } catch (error) {
        console.error(
          "[cart-pricing-middleware] Error adjusting order response:",
          (error as any).message
        );
      }
      return originalJson(body);
    };

    // Continuar con el proceso de complete
    next();
  } catch (error: any) {
    console.error(
      "[cart-pricing-middleware] Error persisting prices on complete:",
      error.message
    );
    // Continuar incluso si hay error
    next();
  }
}
