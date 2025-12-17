import { NextFunction, Request, Response } from "express";
import { MedusaRequest } from "@medusajs/medusa";
import SpanishTaxService from "../../services/spanish-tax";

// Helper para calcular precio sin IVA
function calculatePriceWithoutTax(basePrice: number): number {
  return Math.round((basePrice / 1.21) * 100) / 100;
}

// Helper para calcular impuestos del IVA 21%
function calculateTaxAmount(netPrice: number): number {
  return Math.round(netPrice * 0.21 * 100) / 100;
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

      // Si ya hemos ajustado precios para este cart y la condición de tax-exempt
      // no ha cambiado, evitamos volver a aplicar la conversión (idempotencia)
      if (cart.metadata?.prices_adjusted === true && isTaxExempt) {
        console.log(
          `[cart-pricing-middleware] GET cart ${cart.id} - prices already adjusted for tax-exempt, skipping recalculation`
        );
        return originalJson(body);
      }

      // Recalcular precios de line items (mantener unit_price original, calcular neto para subtotal)
      if (Array.isArray(cart.items) && cart.items.length > 0) {
        for (const item of cart.items) {
          // Si el item ya contiene original_unit_price significa que ya fue ajustado antes
          if (item.original_unit_price !== undefined) {
            continue;
          }

          // Obtener precio base con IVA
          let basePriceWithTax = item.unit_price;

          if (
            typeof basePriceWithTax !== "number" ||
            !isFinite(basePriceWithTax)
          ) {
            continue;
          }

          // Calcular precio neto sin IVA
          const netPrice = calculatePriceWithoutTax(basePriceWithTax);

          // Guardar el unit_price original (con IVA) para referencia
          item.original_unit_price = basePriceWithTax;

          // El subtotal se calcula sobre el precio neto
          item.subtotal = netPrice * (item.quantity || 1);

          console.log(
            `[cart-pricing-middleware] GET item ${item.id} - unit_price (con IVA): ${basePriceWithTax}, subtotal (sin IVA): ${item.subtotal}`
          );
        }
      }

      // Recalcular precios de shipping methods
      if (
        Array.isArray(cart.shipping_methods) &&
        cart.shipping_methods.length > 0
      ) {
        for (const method of cart.shipping_methods) {
          // Si el método de envío ya contiene original_price significa que ya fue ajustado
          if ((method as any).original_shipping_price !== undefined) {
            continue;
          }

          // Obtener precio de envío con IVA
          const shippingPriceWithTax = method.price;
          if (
            typeof shippingPriceWithTax !== "number" ||
            !isFinite(shippingPriceWithTax)
          ) {
            continue;
          }

          // Calcular precio neto sin IVA
          const netShippingPrice =
            calculatePriceWithoutTax(shippingPriceWithTax);

          // Guardar el precio original (con IVA)
          (method as any).original_shipping_price = shippingPriceWithTax;

          // El precio de envío mostrado será el neto
          method.price = netShippingPrice;

          console.log(
            `[cart-pricing-middleware] GET shipping - price (con IVA): ${shippingPriceWithTax}, price (sin IVA): ${netShippingPrice}`
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

      // Envío neto (sin IVA)
      const shippingTotal =
        cart.shipping_methods?.reduce(
          (sum: number, method: any) => sum + (method.price || 0),
          0
        ) || 0;

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

      // Evitar recalcular si ya fue ajustado previamente para esta condición
      if (cart.metadata?.prices_adjusted === true && isTaxExempt) {
        console.log(
          `[cart-pricing-middleware] POST cart ${cart.id} - prices already adjusted for tax-exempt, skipping recalculation`
        );
        return originalJson(body);
      }

      // Recalcular precios de line items (mantener unit_price original, calcular neto para subtotal)
      if (Array.isArray(cart.items) && cart.items.length > 0) {
        for (const item of cart.items) {
          if (item.original_unit_price !== undefined) {
            continue;
          }

          let basePriceWithTax = item.unit_price;

          if (
            typeof basePriceWithTax !== "number" ||
            !isFinite(basePriceWithTax)
          ) {
            continue;
          }

          const netPrice = calculatePriceWithoutTax(basePriceWithTax);
          item.original_unit_price = basePriceWithTax;
          item.subtotal = netPrice * (item.quantity || 1);

          console.log(
            `[cart-pricing-middleware] POST item ${item.id} - unit_price (con IVA): ${basePriceWithTax}, subtotal (sin IVA): ${item.subtotal}`
          );
        }
      }

      // Recalcular precios de shipping methods
      if (
        Array.isArray(cart.shipping_methods) &&
        cart.shipping_methods.length > 0
      ) {
        for (const method of cart.shipping_methods) {
          if ((method as any).original_shipping_price !== undefined) {
            continue;
          }

          const shippingPriceWithTax = method.price;
          if (
            typeof shippingPriceWithTax !== "number" ||
            !isFinite(shippingPriceWithTax)
          ) {
            continue;
          }

          const netShippingPrice =
            calculatePriceWithoutTax(shippingPriceWithTax);
          (method as any).original_shipping_price = shippingPriceWithTax;
          method.price = netShippingPrice;

          console.log(
            `[cart-pricing-middleware] POST shipping - price (con IVA): ${shippingPriceWithTax}, price (sin IVA): ${netShippingPrice}`
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

      // Envío neto (sin IVA)
      const shippingTotal =
        cart.shipping_methods?.reduce(
          (sum: number, method: any) => sum + (method.price || 0),
          0
        ) || 0;

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

    // Ejecutar transacción ANTES de que el complete procese
    await manager.transaction(async (transactionalManager: any) => {
      const cartRepo = transactionalManager.getRepository("Cart");
      const lineItemRepo = transactionalManager.getRepository("LineItem");
      const shippingMethodRepo =
        transactionalManager.getRepository("ShippingMethod");

      // Obtener cart con relaciones
      const cart = await cartRepo.findOne({
        where: { id: cartId },
        relations: [
          "items",
          "items.variant",
          "items.variant.prices",
          "shipping_methods",
          "shipping_methods.shipping_option",
          "shipping_address",
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

      // Actualizar precios de line items
      if (Array.isArray(cart.items) && cart.items.length > 0) {
        for (const item of cart.items) {
          const basePrice = item.variant?.prices?.find(
            (p: any) => p.currency_code === "eur"
          )?.amount;

          if (typeof basePrice === "number" && isFinite(basePrice)) {
            const targetPrice = calculatePriceWithoutTax(basePrice);

            if (item.unit_price !== targetPrice) {
              await lineItemRepo.update(item.id, {
                unit_price: targetPrice,
              });
              itemsUpdated++;
            }
          }
        }
      }

      // Actualizar precios de shipping methods
      if (
        Array.isArray(cart.shipping_methods) &&
        cart.shipping_methods.length > 0
      ) {
        for (const method of cart.shipping_methods) {
          const basePrice = (method as any)?.shipping_option?.amount;

          if (typeof basePrice === "number" && isFinite(basePrice)) {
            const targetPrice = calculatePriceWithoutTax(basePrice);

            if (method.price !== targetPrice) {
              await shippingMethodRepo.update(method.id, {
                price: targetPrice,
              });
              shippingUpdated++;
            }
          }
        }
      }

      // Actualizar metadata del carrito
      await cartRepo.update(cart.id, {
        metadata: {
          ...cart.metadata,
          territory_type: territoryType,
          prices_adjusted: isTaxExempt,
        },
      });

      console.log(
        `[cart-pricing-middleware] Persisted cart ${cartId}: items=${itemsUpdated}, shipping=${shippingUpdated}`
      );
    });

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
