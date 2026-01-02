import { NextFunction, Response } from "express";
import { MedusaRequest } from "@medusajs/medusa";
import {
  CartEntity,
  TaxContext,
  resolveSpanishTaxService,
  getTaxContext,
  isValidPrice,
  getLineItemAdjustedPrice,
  getShippingMethodAdjustedPrice,
  calculateItemsSubtotal,
  calculateShippingTotal,
  calculateTotalDiscount,
  calculatePriceWithoutTax,
  log,
  logError,
  safeJsonTransform,
} from "./cart-pricing-helpers";

/**
 * Extrae el carrito de la respuesta, soportando múltiples formatos
 */
function extractCartFromBody(body: unknown): {
  cart: CartEntity | null;
  isDraftOrder: boolean;
} {
  if (!body || typeof body !== "object") {
    return { cart: null, isDraftOrder: false };
  }

  const bodyObj = body as Record<string, unknown>;

  if (bodyObj.cart) {
    return { cart: bodyObj.cart as CartEntity, isDraftOrder: false };
  }

  if (
    bodyObj.draft_order &&
    typeof bodyObj.draft_order === "object" &&
    (bodyObj.draft_order as Record<string, unknown>).cart
  ) {
    return {
      cart: (bodyObj.draft_order as Record<string, unknown>).cart as CartEntity,
      isDraftOrder: true,
    };
  }

  return { cart: null, isDraftOrder: false };
}

/**
 * Transforma los items del carrito para zonas tax-exempt
 */
function transformCartItemsForTaxExempt(cart: CartEntity): void {
  if (!Array.isArray(cart.items)) return;

  for (const item of cart.items) {
    if (!isValidPrice(item.unit_price)) continue;

    const basePrice = getLineItemAdjustedPrice(item);
    item.subtotal = basePrice * (item.quantity || 1);

    log(
      `GET item ${item.id} - basePrice: ${Math.round(basePrice)} cents (${(
        basePrice / 100
      ).toFixed(2)}€), ` +
        `discount: ${item.discount_total || 0} cents, subtotal: ${Math.round(
          item.subtotal
        )} cents`
    );
  }
}

/**
 * Transforma los shipping methods del carrito para zonas tax-exempt
 */
function transformShippingMethodsForTaxExempt(cart: CartEntity): void {
  if (!Array.isArray(cart.shipping_methods)) return;

  for (const method of cart.shipping_methods) {
    if (!isValidPrice(method.price)) continue;

    const baseShippingPrice = getShippingMethodAdjustedPrice(method);
    (method as Record<string, unknown>)["price_without_tax"] =
      baseShippingPrice;

    log(
      `GET shipping - baseShippingPrice: ${Math.round(
        baseShippingPrice
      )} cents (${(baseShippingPrice / 100).toFixed(2)}€)`
    );
  }
}

/**
 * Recalcula los totales del carrito para zonas tax-exempt
 */
function recalculateCartTotals(cart: CartEntity): void {
  // Subtotal desde items ya transformados
  cart.subtotal =
    cart.items?.reduce((sum, item) => sum + (item.subtotal || 0), 0) || 0;

  // Envío neto
  cart.shipping_total = calculateShippingTotal(
    cart.shipping_methods || [],
    true
  );

  // Tax es 0 para zonas tax-exempt
  cart.tax_total = 0;

  // Descuento total (sin modificar)
  cart.discount_total = calculateTotalDiscount(cart.items || []);

  // Total final
  cart.total = cart.subtotal + cart.shipping_total - cart.discount_total;
}

function applyTaxRate(cart: CartEntity): void {
  console.log("[CART] Applying tax rate 0% to cart", cart.id);
  console.log("[CART] Original cart tax rate:", cart.tax_rate);
  // En zonas tax-exempt, el tax rate es 0%
  cart.tax_rate = 0;
}

/**
 * Aplica las transformaciones de precio para zona tax-exempt
 */
function applyTaxExemptTransformations(
  cart: CartEntity,
  taxContext: TaxContext
): void {
  transformCartItemsForTaxExempt(cart);
  transformShippingMethodsForTaxExempt(cart);
  recalculateCartTotals(cart);
  applyTaxRate(cart);

  // Agregar metadata del territorio
  cart.metadata = {
    ...cart.metadata,
    territory_type: taxContext.territoryType,
  };
}

/**
 * Middleware que recalcula los precios del carrito en las respuestas GET
 * según el código postal de la dirección de envío para zonas con tax 0%
 */
export async function adjustCartPricingOnGet(
  req: MedusaRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const originalJson = res.json.bind(res);

  const spanishTaxService = resolveSpanishTaxService(req);

  res.json = function (body: unknown) {
    // Si no hay servicio de impuestos, devolver respuesta sin modificar
    if (!spanishTaxService) {
      return originalJson(body);
    }

    const transform = safeJsonTransform((responseBody: unknown) => {
      const { cart, isDraftOrder } = extractCartFromBody(responseBody);

      log(
        `GET intercepted - isDraftOrder=${isDraftOrder}, cart=${
          cart?.id || "null"
        }`
      );

      if (!cart) {
        return responseBody;
      }

      const taxContext = getTaxContext(cart, spanishTaxService);

      if (!taxContext) {
        log(`GET cart ${cart.id} - no postal code, skipping`);
        return responseBody;
      }

      log(
        `GET ${isDraftOrder ? "draft_order" : "cart"} ${cart.id} - ` +
          `postal=${taxContext.postalCode} isTaxExempt=${taxContext.isTaxExempt} territory=${taxContext.territoryType}`
      );

      // Solo transformar si es zona tax-exempt
      if (!taxContext.isTaxExempt) {
        return responseBody;
      }

      applyTaxExemptTransformations(cart, taxContext);

      return responseBody;
    }, "adjustCartPricingOnGet");

    return originalJson(transform(body));
  };

  next();
}
