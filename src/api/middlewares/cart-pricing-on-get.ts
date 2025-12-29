import { NextFunction, Response } from "express";
import { MedusaRequest } from "@medusajs/medusa";
import SpanishTaxService from "../../services/spanish-tax";
import {
  calculatePriceWithoutTax,
  calculateTaxAmount,
  adjustDiscountForTaxExempt,
} from "./cart-pricing-helpers";

/**
 * Middleware que recalcula los precios del carrito en las respuestas GET
 * según el código postal de la dirección de envío para zonas con tax 0%
 * Lee los valores ajustados desde metadata si existen (para zonas tax-exempt)
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

      // Solo ajustar precios si es zona tax-exempt
      if (!isTaxExempt) {
        return originalJson(body);
      }

      // Recalcular precios de line items: mostrar precio ajustado desde metadata si existe
      if (Array.isArray(cart.items) && cart.items.length > 0) {
        for (const item of cart.items) {
          const priceWithTax = item.unit_price; // Precio con IVA desde BD

          if (typeof priceWithTax !== "number" || !isFinite(priceWithTax)) {
            continue;
          }

          // Usar precio ajustado desde metadata si existe, sino calcularlo
          const adjustedPrice = item.metadata?.adjusted_unit_price;
          const basePrice = adjustedPrice
            ? adjustedPrice
            : calculatePriceWithoutTax(priceWithTax);

          // Usar descuento ajustado desde metadata si existe, sino calcularlo
          const adjustedDiscount = item.metadata?.adjusted_discount_total;
          const discountToApply =
            adjustedDiscount !== undefined
              ? adjustedDiscount
              : item.discount_total
              ? adjustDiscountForTaxExempt(item.discount_total)
              : 0;

          // El subtotal se calcula sobre el precio SIN IVA, menos el descuento ajustado
          const priceAfterDiscount = basePrice - discountToApply;
          item.subtotal = priceAfterDiscount * (item.quantity || 1);

          console.log(
            `[cart-pricing-middleware] GET item ${
              item.id
            } - priceWithTax: ${priceWithTax} cents (${(
              priceWithTax / 100
            ).toFixed(2)}€), basePrice: ${Math.round(basePrice)} cents (${(
              basePrice / 100
            ).toFixed(2)}€), discount: ${Math.round(discountToApply)} cents (${(
              discountToApply / 100
            ).toFixed(2)}€), subtotal: ${item.subtotal} cents`
          );
        }
      }

      // Mostrar precios de shipping ajustados desde metadata si existen
      if (
        Array.isArray(cart.shipping_methods) &&
        cart.shipping_methods.length > 0
      ) {
        for (const method of cart.shipping_methods) {
          const priceWithTax = method.price; // Precio con IVA desde BD
          if (typeof priceWithTax !== "number" || !isFinite(priceWithTax)) {
            continue;
          }

          // Usar precio ajustado desde metadata si existe, sino calcularlo
          const adjustedShippingPrice = method.data?.adjusted_price;
          const baseShippingPrice = adjustedShippingPrice
            ? adjustedShippingPrice
            : calculatePriceWithoutTax(priceWithTax);

          // Crear propiedad para mostrar el neto (no sobreescribir price)
          (method as Record<string, unknown>)["price_without_tax"] =
            baseShippingPrice;

          console.log(
            `[cart-pricing-middleware] GET shipping - priceWithTax: ${priceWithTax} cents (${(
              priceWithTax / 100
            ).toFixed(2)}€), baseShippingPrice: ${Math.round(
              baseShippingPrice
            )} cents (${(baseShippingPrice / 100).toFixed(2)}€)`
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

      // Envío neto (sin IVA) - calcular desde metadata o price con IVA
      const shippingTotal =
        cart.shipping_methods?.reduce((sum: number, method: any) => {
          const shippingWithTax = method.price;
          const adjustedShippingPrice = method.data?.adjusted_price;

          if (adjustedShippingPrice) {
            return sum + adjustedShippingPrice;
          } else if (
            typeof shippingWithTax === "number" &&
            isFinite(shippingWithTax)
          ) {
            return sum + calculatePriceWithoutTax(shippingWithTax);
          }
          return sum;
        }, 0) || 0;

      cart.shipping_total = shippingTotal;

      // Tax total es 0 para zonas tax-exempt
      cart.tax_total = 0;

      // Total = subtotal neto (que ya incluye descuentos) + envío neto
      // NO restamos discount_total aquí porque ya está aplicado en item.subtotal
      cart.total = cart.subtotal + shippingTotal;

      // Marcar en metadata el territorio (solo para información)
      cart.metadata = {
        ...cart.metadata,
        territory_type: territoryType,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        "[cart-pricing-middleware] Error adjusting prices on GET:",
        msg
      );
    }

    return originalJson(body);
  };

  next();
}
