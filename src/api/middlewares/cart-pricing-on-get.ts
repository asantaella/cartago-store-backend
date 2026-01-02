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
      console.log(
        `[cart-pricing-middleware] GET intercepted - body keys: ${
          body ? Object.keys(body).join(", ") : "null"
        }`
      );

      // Soportar tanto cart directo como draft_order.cart
      let cart: any = null;
      let isDraftOrder = false;

      if (body?.cart) {
        cart = body.cart;
      } else if (body?.draft_order?.cart) {
        cart = body.draft_order.cart;
        isDraftOrder = true;
      }

      console.log(
        `[cart-pricing-middleware] GET - isDraftOrder=${isDraftOrder}, cart exists=${!!cart}, cart.id=${
          cart?.id
        }`
      );

      // Solo procesar si hay un cart en la respuesta
      if (!cart) {
        return originalJson(body);
      }

      console.log(
        `[cart-pricing-middleware] GET - shipping_address exists=${!!cart.shipping_address}, postal_code=${
          cart.shipping_address?.postal_code
        }`
      );

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
        `[cart-pricing-middleware] GET ${
          isDraftOrder ? "draft_order" : "cart"
        } ${
          cart.id
        } - postal=${postalCode} isTaxExempt=${isTaxExempt} territory=${territoryType}`
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

          // El descuento NO se modifica - mantener el valor original de BD
          // El descuento en BD ya está calculado sobre precio sin IVA (0.25€)
          // y es correcto para ambas regiones

          // El subtotal se calcula sobre el precio SIN IVA (sin descuentos)
          item.subtotal = basePrice * (item.quantity || 1);

          console.log(
            `[cart-pricing-middleware] GET item ${
              item.id
            } - priceWithTax: ${priceWithTax} cents (${(
              priceWithTax / 100
            ).toFixed(2)}€), basePrice: ${Math.round(basePrice)} cents (${(
              basePrice / 100
            ).toFixed(2)}€), discount: ${item.discount_total} cents (${(
              (item.discount_total || 0) / 100
            ).toFixed(2)}€), subtotal: ${Math.round(item.subtotal)} cents (${(
              item.subtotal / 100
            ).toFixed(2)}€)`
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

      // Calcular el descuento total del carrito
      const totalDiscount =
        cart.items?.reduce(
          (sum: number, item: any) => sum + (item.discount_total || 0),
          0
        ) || 0;
      cart.discount_total = totalDiscount;

      // Total = subtotal neto + envío neto - descuento total
      cart.total = cart.subtotal + shippingTotal - totalDiscount;

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
