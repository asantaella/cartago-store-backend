import { NextFunction, Response } from "express";
import { MedusaRequest } from "@medusajs/medusa";
import {
  CartEntity,
  TaxContext,
  resolveSpanishTaxService,
  getTaxContext,
  isValidPrice,
  calculateItemsSubtotal,
  calculateShippingTotal,
  calculateTotalDiscount,
  calculatePriceWithoutTax,
  log,
  logError,
  safeJsonTransform,
  getLineItemAdjustedPrice,
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
 * Recalcula tanto el precio base como el descuento asociado
 */
function transformCartItemsForTaxExempt(cart: CartEntity): void {
  if (!Array.isArray(cart.items)) return;

  for (const item of cart.items) {
    if (!isValidPrice(item.unit_price)) continue;

    // Calcular el precio base ajustado
    const originalPrice = item.unit_price;
    const basePrice = item.metadata?.adjusted_unit_price || getLineItemAdjustedPrice(item);
    
    // Para el descuento, usar el valor ORIGINAL guardado en metadata si existe
    // Esto evita recálculos acumulativos en múltiples GETs
    const originalDiscountFromMetadata = item.metadata?.original_discount_total as number | undefined;
    const currentDiscount = item.discount_total || 0;
    
    // Si ya existe original_discount_total en metadata, usar ese valor como base
    // Si no, el valor actual es el original (primera vez que se procesa)
    const originalDiscount = originalDiscountFromMetadata !== undefined 
      ? originalDiscountFromMetadata 
      : currentDiscount;
    
    // Calcular la proporción del ajuste de precio
    const priceRatio = basePrice / originalPrice;
    
    // Ajustar el descuento proporcionalmente SOLO si hay descuento original
    const adjustedDiscount = originalDiscount > 0 
      ? Math.round(originalDiscount * priceRatio)
      : 0;
    
    item.subtotal = basePrice * (item.quantity || 1);
    item.discount_total = adjustedDiscount;
    
    // Guardar el descuento original en metadata para futuras referencias
    if (!item.metadata) {
      item.metadata = {};
    }
    if (originalDiscountFromMetadata === undefined && currentDiscount > 0) {
      (item.metadata as any).original_discount_total = currentDiscount;
    }

    log(
      `GET item ${item.id} - basePrice: ${Math.round(basePrice)} cents (${(
        basePrice / 100
      ).toFixed(2)}€), ` +
        `discount: ${adjustedDiscount} cents (original: ${originalDiscount} cents), ` +
        `subtotal: ${Math.round(item.subtotal)} cents`
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

    // Usar el precio ajustado si existe en data, de lo contrario usar el price original
    // No recalcular automáticamente - confiar en que fue persistido correctamente
    const baseShippingPrice = method.data?.adjusted_price || method.price;
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
  // En zonas tax-exempt, el tax rate de la región debe ser 0%
  const originalTaxRate = cart.region?.tax_rate;

  if (!cart.region) {
    cart.region = {};
  }

  cart.region.tax_rate = 0;

  log(
    `Applied tax_rate 0% to region of cart ${cart.id} (original: ${
      originalTaxRate ?? "undefined"
    })`
  );
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
