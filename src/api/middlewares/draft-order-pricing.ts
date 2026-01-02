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

      const isTaxExempt = spanishTaxService.isTaxExemptAddress(postalCode);
      const territoryType = spanishTaxService.getTerritoryType(postalCode);

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

          // Ajustar el descuento para zonas tax-exempt (dividir entre 1.21)
          if (item.discount_total && typeof item.discount_total === "number") {
            item.discount_total = Math.round(
              calculatePriceWithoutTax(item.discount_total)
            );
          }
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
 * Versión simplificada que solo modifica la respuesta
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

      const isTaxExempt = spanishTaxService.isTaxExemptAddress(postalCode);
      const territoryType = spanishTaxService.getTerritoryType(postalCode);

      console.log(
        `[draft-order-pricing] POST draft_order ${body.draft_order.id} - postal=${postalCode} isTaxExempt=${isTaxExempt} territory=${territoryType}`
      );

      if (!isTaxExempt) {
        return originalJson(body);
      }

      // Ajustar precios de line items en la respuesta
      if (Array.isArray(cart.items) && cart.items.length > 0) {
        for (const item of cart.items) {
          const priceWithTax = item.unit_price;

          if (typeof priceWithTax !== "number" || !isFinite(priceWithTax)) {
            continue;
          }

          const basePrice = calculatePriceWithoutTax(priceWithTax);
          item.subtotal = basePrice * (item.quantity || 1);

          // Ajustar el descuento para zonas tax-exempt (dividir entre 1.21)
          if (item.discount_total && typeof item.discount_total === "number") {
            item.discount_total = calculatePriceWithoutTax(item.discount_total);
          }

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
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[draft-order-pricing] Error on POST:", msg);
    }

    return originalJson(body);
  };

  next();
}
