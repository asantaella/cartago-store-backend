import { NextFunction, Response } from "express";
import { MedusaRequest } from "@medusajs/medusa";
import SpanishTaxService from "../../services/spanish-tax";
import { calculatePriceWithoutTax } from "./cart-pricing-helpers";

/**
 * Middleware para ajustar precios en GET de draft orders
 * Versión simplificada que solo modifica la respuesta sin persistir
 */
export function adjustDraftOrderPricingOnGet(
  req: MedusaRequest,
  res: Response,
  next: NextFunction
) {
  const originalJson = res.json.bind(res);

  res.json = function (body: any) {
    try {
      // Solo procesar si hay un draft_order con cart
      const cart = body?.draft_order?.cart;

      if (!cart) {
        return originalJson(body);
      }

      const countryCode = cart.shipping_address?.country_code ?? "";
      const postalCode = cart.shipping_address?.postal_code;

      if (!postalCode) {
        return originalJson(body);
      }

      let spanishTaxService: SpanishTaxService;
      try {
        spanishTaxService = req.scope.resolve(
          "spanishTaxService"
        ) as SpanishTaxService;
      } catch (e) {
        console.log("[draft-order-pricing] SpanishTaxService not available");
        return originalJson(body);
      }

      const isTaxExempt = spanishTaxService.isTaxExemptAddress(
        countryCode,
        postalCode
      );
      const territoryType = spanishTaxService.getTerritoryType(
        countryCode,
        postalCode
      );

      console.log(
        `[draft-order-pricing] GET draft_order ${body.draft_order.id} - postal=${postalCode} isTaxExempt=${isTaxExempt} territory=${territoryType}`
      );

      if (!isTaxExempt) {
        return originalJson(body);
      }

      // Ajustar precios de line items
      if (Array.isArray(cart.items) && cart.items.length > 0) {
        for (const item of cart.items) {
          const priceWithTax = item.unit_price;

          if (typeof priceWithTax !== "number" || !isFinite(priceWithTax)) {
            continue;
          }

          const adjustedPrice = item.metadata?.adjusted_unit_price;
          const basePrice =
            adjustedPrice || calculatePriceWithoutTax(priceWithTax);

          item.subtotal = basePrice * (item.quantity || 1);

          // No ajustar el descuento aquí - Medusa ya lo mantiene en el formato correcto
          // El descuento ya incluye el ajuste de impuestos necesario
        }
      }

      // Ajustar precios de shipping
      if (
        Array.isArray(cart.shipping_methods) &&
        cart.shipping_methods.length > 0
      ) {
        for (const method of cart.shipping_methods) {
          const priceWithTax = method.price;
          if (typeof priceWithTax !== "number" || !isFinite(priceWithTax)) {
            continue;
          }

          const adjustedShippingPrice = method.data?.adjusted_price;
          const baseShippingPrice =
            adjustedShippingPrice || calculatePriceWithoutTax(priceWithTax);

          (method as Record<string, unknown>)["price_without_tax"] =
            baseShippingPrice;
        }
      }

      // Recalcular totales
      cart.subtotal =
        cart.items?.reduce(
          (sum: number, item: any) => sum + (item.subtotal || 0),
          0
        ) || 0;

      // Calcular shipping: si el precio original es 0 (descuento 100%), mantenerlo en 0
      const shippingTotal =
        cart.shipping_methods?.reduce((sum: number, method: any) => {
          const shippingWithTax = method.price;

          // Si el precio es 0, no ajustar (descuento 100%)
          if (shippingWithTax === 0) {
            return sum;
          }

          const adjustedPrice = method.data?.adjusted_price;
          if (adjustedPrice) {
            return sum + adjustedPrice;
          } else if (
            typeof shippingWithTax === "number" &&
            isFinite(shippingWithTax)
          ) {
            return sum + calculatePriceWithoutTax(shippingWithTax);
          }
          return sum;
        }, 0) || 0;

      cart.shipping_total = shippingTotal;
      cart.tax_total = 0;

      const totalDiscount =
        cart.items?.reduce(
          (sum: number, item: any) => sum + (item.discount_total || 0),
          0
        ) || 0;
      cart.discount_total = totalDiscount;

      cart.total = cart.subtotal + shippingTotal - totalDiscount;
      cart.metadata = {
        ...cart.metadata,
        territory_type: territoryType,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[draft-order-pricing] Error on GET:", msg);
    }

    return originalJson(body);
  };

  next();
}

/**
 * Middleware para ajustar precios en POST de draft orders
 * Ajusta la respuesta Y persiste los precios en la BD de forma asíncrona
 */
export function adjustDraftOrderPricingOnPost(
  req: MedusaRequest,
  res: Response,
  next: NextFunction
) {
  const originalJson = res.json.bind(res);

  res.json = function (body: any) {
    try {
      // Solo procesar si hay un draft_order con cart
      const cart = body?.draft_order?.cart;

      if (!cart) {
        return originalJson(body);
      }

      const countryCode = cart.shipping_address?.country_code ?? "";
      const postalCode = cart.shipping_address?.postal_code;

      if (!postalCode) {
        return originalJson(body);
      }

      let spanishTaxService: SpanishTaxService;
      let manager: any;

      try {
        spanishTaxService = req.scope.resolve(
          "spanishTaxService"
        ) as SpanishTaxService;
        manager = req.scope.resolve("manager");
      } catch (e) {
        console.log("[draft-order-pricing] Required services not available");
        return originalJson(body);
      }

      const isTaxExempt = spanishTaxService.isTaxExemptAddress(
        countryCode,
        postalCode
      );
      const territoryType = spanishTaxService.getTerritoryType(
        countryCode,
        postalCode
      );

      console.log(
        `[draft-order-pricing] POST draft_order ${body.draft_order.id} - postal=${postalCode} isTaxExempt=${isTaxExempt} territory=${territoryType}`
      );

      if (!isTaxExempt) {
        return originalJson(body);
      }

      const cartId = cart.id;

      // Ajustar precios de line items en la respuesta
      if (Array.isArray(cart.items) && cart.items.length > 0) {
        for (const item of cart.items) {
          const priceWithTax = item.unit_price;

          if (typeof priceWithTax !== "number" || !isFinite(priceWithTax)) {
            continue;
          }

          const basePrice = calculatePriceWithoutTax(priceWithTax);
          item.subtotal = basePrice * (item.quantity || 1);

          console.log(
            `[draft-order-pricing] POST item ${
              item.id
            } - priceWithTax: ${priceWithTax}, basePrice: ${Math.round(
              basePrice
            )}, discount: ${item.discount_total}`
          );
        }
      }

      // Ajustar precios de shipping
      if (
        Array.isArray(cart.shipping_methods) &&
        cart.shipping_methods.length > 0
      ) {
        for (const method of cart.shipping_methods) {
          const priceWithTax = method.price;
          if (typeof priceWithTax !== "number" || !isFinite(priceWithTax)) {
            continue;
          }

          const baseShippingPrice = calculatePriceWithoutTax(priceWithTax);
          (method as Record<string, unknown>)["price_without_tax"] =
            baseShippingPrice;
        }
      }

      // Recalcular totales
      cart.subtotal =
        cart.items?.reduce(
          (sum: number, item: any) => sum + (item.subtotal || 0),
          0
        ) || 0;

      // Calcular shipping: si el precio original es 0 (descuento 100%), mantenerlo en 0
      const shippingTotal =
        cart.shipping_methods?.reduce((sum: number, method: any) => {
          const shippingWithTax = method.price;

          // Si el precio es 0, no ajustar (descuento 100%)
          if (shippingWithTax === 0) {
            return sum;
          }

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

      const totalDiscount =
        cart.items?.reduce(
          (sum: number, item: any) => sum + (item.discount_total || 0),
          0
        ) || 0;
      cart.discount_total = totalDiscount;

      cart.total = cart.subtotal + shippingTotal - totalDiscount;
      cart.metadata = {
        ...cart.metadata,
        territory_type: territoryType,
      };

      // Persistir los precios ajustados en la BD de forma asíncrona (después de enviar la respuesta)
      setImmediate(async () => {
        try {
          await manager.transaction(async (tm: any) => {
            const lineItemRepo = tm.getRepository("LineItem");
            const shippingMethodRepo = tm.getRepository("ShippingMethod");
            const cartRepo = tm.getRepository("Cart");

            // Cargar el cart actualizado
            const cartEntity = await cartRepo.findOne({
              where: { id: cartId },
              relations: ["items", "shipping_methods"],
            });

            if (!cartEntity) return;

            // Persistir precios de items
            if (cartEntity.items) {
              for (const item of cartEntity.items) {
                const originalPrice = item.unit_price;
                const adjustedPrice = Math.round(
                  calculatePriceWithoutTax(originalPrice)
                );

                if (originalPrice !== adjustedPrice) {
                  item.unit_price = adjustedPrice;

                  // Ajustar descuento proporcionalmente
                  if (item.discount_total && item.discount_total > 0) {
                    const originalDiscount =
                      item.metadata?.original_discount_total ||
                      item.discount_total;
                    const priceRatio = adjustedPrice / originalPrice;
                    item.discount_total = Math.round(
                      originalDiscount * priceRatio
                    );

                    if (!item.metadata?.original_discount_total) {
                      item.metadata = {
                        ...item.metadata,
                        original_discount_total: originalDiscount,
                        adjusted_unit_price: adjustedPrice,
                      };
                    }
                  } else {
                    item.metadata = {
                      ...item.metadata,
                      adjusted_unit_price: adjustedPrice,
                    };
                  }

                  await lineItemRepo.save(item);
                  console.log(
                    `[draft-order-pricing] PERSISTED item ${item.id} - ${originalPrice} → ${adjustedPrice}`
                  );
                }
              }
            }

            // Persistir precios de shipping
            if (cartEntity.shipping_methods) {
              for (const method of cartEntity.shipping_methods) {
                const originalPrice = method.price;
                const adjustedPrice = Math.round(
                  calculatePriceWithoutTax(originalPrice)
                );

                if (originalPrice !== adjustedPrice) {
                  method.price = adjustedPrice;
                  method.data = {
                    ...method.data,
                    adjusted_price: adjustedPrice,
                  };

                  await shippingMethodRepo.save(method);
                  console.log(
                    `[draft-order-pricing] PERSISTED shipping ${method.id} - ${originalPrice} → ${adjustedPrice}`
                  );
                }
              }
            }

            // Actualizar metadata
            cartEntity.metadata = {
              ...cartEntity.metadata,
              territory_type: territoryType,
              prices_adjusted: true,
            };
            await cartRepo.save(cartEntity);

            console.log(
              `[draft-order-pricing] POST persistence completed for cart ${cartId}`
            );
          });
        } catch (err) {
          console.error(`[draft-order-pricing] Error persisting prices:`, err);
        }
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[draft-order-pricing] Error on POST:", msg);
    }

    return originalJson(body);
  };

  next();
}

/**
 * Middleware para persistir precios ajustados cuando se registra el pago de un draft order
 * Este middleware intercepta POST /admin/draft-orders/:id/pay
 */
export async function persistDraftOrderPricing(
  req: MedusaRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const draftOrderId = req.params.id;
    if (!draftOrderId) {
      next();
      return;
    }

    console.log(
      `[draft-order-pricing] PAY draft_order ${draftOrderId} - Persisting prices before payment registration`
    );

    let manager: any;
    let spanishTaxService: SpanishTaxService;

    try {
      manager = req.scope.resolve("manager");
      spanishTaxService = req.scope.resolve(
        "spanishTaxService"
      ) as SpanishTaxService;
    } catch (e) {
      console.log("[draft-order-pricing] Required services not available");
      next();
      return;
    }

    // Ejecutar transacción para persistir precios
    await manager.transaction(async (transactionalManager: any) => {
      // Obtener el draft order con su cart
      const draftOrderRepo = transactionalManager.getRepository("DraftOrder");
      const cartRepo = transactionalManager.getRepository("Cart");
      const lineItemRepo = transactionalManager.getRepository("LineItem");
      const shippingMethodRepo =
        transactionalManager.getRepository("ShippingMethod");

      const draftOrder = await draftOrderRepo.findOne({
        where: { id: draftOrderId },
        relations: [
          "cart",
          "cart.items",
          "cart.shipping_methods",
          "cart.shipping_address",
          "cart.region",
        ],
      });

      if (!draftOrder || !draftOrder.cart) {
        console.log(
          `[draft-order-pricing] Draft order ${draftOrderId} or cart not found`
        );
        return;
      }

      const cart = draftOrder.cart;
      const countryCode = cart.shipping_address?.country_code ?? "";
      const postalCode = cart.shipping_address?.postal_code;

      if (!postalCode) {
        console.log(`[draft-order-pricing] No postal code for cart ${cart.id}`);
        return;
      }

      const isTaxExempt = spanishTaxService.isTaxExemptAddress(
        countryCode,
        postalCode
      );
      const territoryType = spanishTaxService.getTerritoryType(
        countryCode,
        postalCode
      );

      console.log(
        `[draft-order-pricing] PAY cart ${cart.id} - postal=${postalCode} isTaxExempt=${isTaxExempt} territory=${territoryType}`
      );

      if (!isTaxExempt) {
        console.log(
          `[draft-order-pricing] Cart ${cart.id} is not tax-exempt, skipping`
        );
        return;
      }

      // Verificar si los precios ya fueron ajustados
      const alreadyAdjusted = cart.metadata?.prices_adjusted === true;
      if (alreadyAdjusted) {
        console.log(
          `[draft-order-pricing] Cart ${cart.id} prices already adjusted`
        );
        // Aún así, continuar para asegurar que todo esté correcto
      }

      let itemsUpdated = 0;
      let shippingUpdated = 0;
      let subtotal = 0;
      let discountTotal = 0;

      // Persistir precios ajustados en line items
      if (Array.isArray(cart.items) && cart.items.length > 0) {
        for (const item of cart.items) {
          const originalPrice = item.unit_price;
          const adjustedPrice =
            item.metadata?.adjusted_unit_price ||
            Math.round(calculatePriceWithoutTax(originalPrice));

          // Guardar el descuento original ANTES de cualquier ajuste
          const currentDiscount = item.discount_total || 0;
          const originalDiscount = item.metadata?.original_discount_total as
            | number
            | undefined;

          if (originalDiscount === undefined && currentDiscount > 0) {
            // Primera vez que se ajusta, guardar el descuento original
            item.metadata = {
              ...item.metadata,
              original_discount_total: currentDiscount,
            };
          }

          // Ajustar precio
          item.unit_price = adjustedPrice;

          // Ajustar descuento proporcionalmente
          if (currentDiscount > 0) {
            const discountToUse =
              originalDiscount !== undefined
                ? originalDiscount
                : currentDiscount;
            const priceRatio = adjustedPrice / originalPrice;
            item.discount_total = Math.round(discountToUse * priceRatio);
          }

          // Recalcular subtotal del item
          item.subtotal = adjustedPrice * (item.quantity || 1);

          await lineItemRepo.save(item);
          itemsUpdated++;

          subtotal += item.subtotal;
          discountTotal += item.discount_total || 0;

          console.log(
            `[draft-order-pricing] PAY item ${item.id} - price: ${originalPrice} → ${adjustedPrice}, discount: ${item.discount_total}, subtotal: ${item.subtotal}`
          );
        }
      }

      let shippingTotal = 0;

      // Persistir precios ajustados en shipping methods
      if (
        Array.isArray(cart.shipping_methods) &&
        cart.shipping_methods.length > 0
      ) {
        for (const method of cart.shipping_methods) {
          const originalPrice = method.price;
          const adjustedPrice =
            method.data?.adjusted_price ||
            Math.round(calculatePriceWithoutTax(originalPrice));

          method.price = adjustedPrice;
          await shippingMethodRepo.save(method);
          shippingUpdated++;

          shippingTotal += adjustedPrice;

          console.log(
            `[draft-order-pricing] PAY shipping ${method.id} - price: ${originalPrice} → ${adjustedPrice}`
          );
        }
      }

      // Actualizar metadata del cart (no modificar totales ni región aquí)
      // Los totales serán recalculados por Medusa automáticamente
      cart.metadata = {
        ...cart.metadata,
        territory_type: territoryType,
        prices_adjusted: true,
      };
      await cartRepo.save(cart);

      console.log(
        `[draft-order-pricing] PAY completed - items: ${itemsUpdated}, shipping: ${shippingUpdated}, ` +
          `subtotal: ${subtotal}, discount: ${discountTotal}, shipping: ${shippingTotal}, calculated total: ${
            subtotal + shippingTotal - discountTotal
          }`
      );
    });

    console.log(
      `[draft-order-pricing] Draft order ${draftOrderId} prices persisted successfully. Proceeding to create order.`
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[draft-order-pricing] Error persisting prices: ${msg}`);
  }

  next();
}
