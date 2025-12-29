import { NextFunction, Response } from "express";
import { MedusaRequest } from "@medusajs/medusa";
import SpanishTaxService from "../../services/spanish-tax";
import {
  calculatePriceWithoutTax,
  calculateTaxAmount,
  adjustDiscountForTaxExempt,
} from "./cart-pricing-helpers";

/**
 * Middleware que persiste los precios ajustados en metadata para zonas tax-exempt
 * en las peticiones POST/PATCH del carrito.
 * IMPORTANTE: NO modifica unit_price original, solo guarda el precio ajustado en metadata
 */
export async function adjustCartPricingOnPost(
  req: MedusaRequest,
  res: Response,
  next: NextFunction
) {
  const originalJson = res.json.bind(res);

  res.json = function (body: any): Response {
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

      // Solo procesar si es zona tax-exempt
      if (!isTaxExempt) {
        return originalJson(body);
      }

      const manager = req.scope.resolve("manager");

      // Ejecutar transacción ANTES de enviar la respuesta: hacemos IIFE async
      (async () => {
        try {
          await manager.transaction(async (transactionalManager: any) => {
            const lineItemRepo = transactionalManager.getRepository("LineItem");
            const shippingMethodRepo =
              transactionalManager.getRepository("ShippingMethod");

            // Guardar precios ajustados de line items en metadata (no modificar unit_price)
            if (Array.isArray(cart.items) && cart.items.length > 0) {
              for (const item of cart.items) {
                const priceWithTax = item.unit_price; // Precio con IVA desde BD

                if (
                  typeof priceWithTax !== "number" ||
                  !isFinite(priceWithTax)
                ) {
                  continue;
                }

                // Calcular basePrice (sin IVA) dinámicamente
                const basePrice = Math.round(calculatePriceWithoutTax(priceWithTax));

                // El descuento NO se modifica - ya está calculado sobre precio sin IVA
                // No es necesario ajustarlo porque es correcto para ambas regiones
                const discountTotal = item.discount_total || 0;

                // Guardar en metadata solo el precio ajustado
                const dbItem = await lineItemRepo.findOne({
                  where: { id: item.id },
                });
                if (dbItem) {
                  // Actualizar metadata solo con el precio ajustado
                  dbItem.metadata = {
                    ...dbItem.metadata,
                    adjusted_unit_price: basePrice,
                  };
                  
                  // NO modificar discount_total - mantener el valor original
                  
                  await lineItemRepo.save(dbItem);

                  console.log(
                    `[cart-pricing-middleware] POST item ${
                      item.id
                    } - Saved adjusted_unit_price: ${basePrice} cents (${(
                      basePrice / 100
                    ).toFixed(
                      2
                    )}€) in metadata. Original: unit_price ${priceWithTax} cents, discount ${discountTotal} cents`
                  );
                }

                // Mostrar el subtotal ajustado en la respuesta (sin descuentos, solo precio)
                item.subtotal = basePrice * (item.quantity || 1);
                
                // NO modificar item.discount_total - mantener el valor original de BD
              }
            }

            // Guardar precios ajustados de shipping methods en data (no modificar price)
            if (
              Array.isArray(cart.shipping_methods) &&
              cart.shipping_methods.length > 0
            ) {
              for (const method of cart.shipping_methods) {
                const priceWithTax = method.price; // Precio con IVA desde BD
                if (
                  typeof priceWithTax !== "number" ||
                  !isFinite(priceWithTax)
                ) {
                  continue;
                }

                // Calcular basePrice (sin IVA) dinámicamente
                const baseShippingPrice = Math.round(
                  calculatePriceWithoutTax(priceWithTax)
                );

                // Guardar en data el precio ajustado (no modificar price)
                const dbMethod = await shippingMethodRepo.findOne({
                  where: { id: method.id },
                });
                if (dbMethod) {
                  dbMethod.data = {
                    ...dbMethod.data,
                    adjusted_price: baseShippingPrice,
                  };
                  await shippingMethodRepo.save(dbMethod);

                  console.log(
                    `[cart-pricing-middleware] POST shipping ${
                      method.id
                    } - Saved adjusted_price: ${Math.round(
                      baseShippingPrice
                    )} cents (${(baseShippingPrice / 100).toFixed(
                      2
                    )}€) in data. Original price: ${priceWithTax} cents`
                  );
                }

                // Crear propiedad para mostrar el neto en la respuesta
                (method as Record<string, unknown>)["price_without_tax"] =
                  baseShippingPrice;
              }
            }
          });

          // Recalcular totales del carrito para la respuesta (después de la transacción)
          try {
            cart.subtotal =
              cart.items?.reduce(
                (sum: number, it: any) => sum + (it.subtotal || 0),
                0
              ) || 0;

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
            cart.tax_total = 0;
            
            // Calcular el descuento total del carrito
            const totalDiscount =
              cart.items?.reduce(
                (sum: number, it: any) => sum + (it.discount_total || 0),
                0
              ) || 0;
            cart.discount_total = totalDiscount;
            
            // Total = subtotal + shipping - descuentos
            cart.total =
              cart.subtotal + shippingTotal - totalDiscount;
            cart.metadata = {
              ...cart.metadata,
              territory_type: territoryType,
            };
          } catch (e) {
            console.error(
              "[cart-pricing-middleware] Error recalculating totals:",
              e
            );
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(
            "[cart-pricing-middleware] Error adjusting prices on POST/PATCH:",
            msg
          );
        }

        // Enviar la respuesta una vez completada la transacción
        try {
          originalJson(body);
        } catch (e) {
          console.error(
            "[cart-pricing-middleware] Error sending response after transaction:",
            e
          );
        }
      })();

      // Devolver el objeto Response para cumplir la firma
      return res;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[cart-pricing-middleware] Error wrapping res.json:", msg);
      return originalJson(body);
    }
  };

  next();
}
