import { TransactionBaseService } from "@medusajs/medusa";

export type LineItemWithVariant = {
  quantity: number;
  variant?: {
    shipping_option_price_extra?: number;
  } | null;
};

export type CartWithItems = {
  items?: LineItemWithVariant[];
};

export type ShippingOptionLike = {
  amount?: number;
  [key: string]: unknown;
};

export type ShippingMethodLike = {
  price: number;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * Servicio de cálculo del recargo extra de envío por variante.
 *
 * Regla: extra_total = SUM(variant.shipping_option_price_extra * item.quantity)
 * sobre todos los line items del carrito.
 *
 * Las claves en ShippingMethod.data son:
 *   original_price        – precio base del método de envío (ya usado por tax-exempt)
 *   adjusted_price        – precio tras eliminar IVA (ya usado por tax-exempt)
 *   shipping_extra_total  – recargo sumado por las variantes (nuevo campo)
 */
class VariantShippingPriceService extends TransactionBaseService {
  static readonly IDENTIFIER = "variantShippingPriceService";

  constructor(container: Record<string, unknown>) {
    super(container);
  }

  /**
   * Suma el recargo de envío de todos los items del carrito.
   * Devuelve 0 si no hay variantes con el campo o si items está vacío.
   */
  calculateCartShippingExtra(cart: CartWithItems): number {
    if (!Array.isArray(cart.items) || cart.items.length === 0) {
      return 0;
    }

    return cart.items.reduce((sum, item) => {
      const extra = item.variant?.shipping_option_price_extra ?? 0;
      if (typeof extra !== "number" || extra <= 0) return sum;
      return sum + extra * (item.quantity || 1);
    }, 0);
  }

  /**
   * Añade el recargo extra al amount de cada opción de envío visible.
   * Muta los objetos en el array (misma semántica que setShippingOptionPrices).
   */
  applyExtraToShippingOptions(
    options: ShippingOptionLike[],
    extraTotal: number
  ): ShippingOptionLike[] {
    if (extraTotal <= 0 || !Array.isArray(options)) return options;

    return options.map((opt) => {
      if (typeof opt.amount === "number") {
        opt.amount = opt.amount + extraTotal;
      }
      return opt;
    });
  }

  /**
   * Actualiza el precio de un shipping method persistido aplicando el recargo.
   * Guarda el extra en method.data.shipping_extra_total para que la lógica
   * de restauración fiscal (cart-pricing-db-update) no lo sobre-escriba.
   */
  applyExtraToShippingMethod(
    method: ShippingMethodLike,
    extraTotal: number
  ): ShippingMethodLike {
    if (extraTotal <= 0) return method;

    if (!method.data) method.data = {};

    // Solo aplicar si no se aplicó ya el mismo extra (idempotente)
    const currentExtra = (method.data.shipping_extra_total as number) ?? 0;
    if (currentExtra === extraTotal) return method;

    // Revertir el extra previo si existía antes de sumar el nuevo
    const basePrice = method.price - currentExtra;
    method.price = basePrice + extraTotal;
    method.data.shipping_extra_total = extraTotal;

    return method;
  }

  /**
   * Elimina el recargo extra de un shipping method (restauración).
   * Usado cuando el carrito cambia de items y hay que recalcular.
   */
  removeExtraFromShippingMethod(method: ShippingMethodLike): ShippingMethodLike {
    if (!method.data) return method;

    const currentExtra = (method.data.shipping_extra_total as number) ?? 0;
    if (currentExtra <= 0) return method;

    method.price = method.price - currentExtra;
    delete method.data.shipping_extra_total;

    return method;
  }
}

export default VariantShippingPriceService;
