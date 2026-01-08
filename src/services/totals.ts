import { TotalsService as MedusaTotalsService } from "@medusajs/medusa";

/**
 * TotalsService override que respeta los precios ajustados para tax-exempt regions
 * Extiende el TotalsService de Medusa para asegurar que los totales calculados
 * usen los precios ya ajustados (sin IVA) cuando cart.metadata.prices_adjusted = true
 */
class TotalsService extends MedusaTotalsService {
  constructor(container: any) {
    super(container);
    console.log(
      "[TotalsService] CUSTOM TotalsService initialized - tax-exempt support enabled"
    );
  }

  /**
   * Calcula el subtotal - override para usar unit_price ya ajustado
   */
  async getSubtotal(
    cartOrOrder: any,
    opts: { excludeNonDiscounts?: boolean } = {}
  ): Promise<number> {
    console.log(
      `[TotalsService.getSubtotal] Called for cart/order ${cartOrOrder.id} - prices_adjusted=${cartOrOrder.metadata?.prices_adjusted}`
    );

    // Si prices_adjusted=true, calcular subtotal basado en unit_price persistido (sin recalcular)
    if (cartOrOrder.metadata?.prices_adjusted === true) {
      console.log(
        `[TotalsService.getSubtotal] Cart ${cartOrOrder.id} has adjusted prices - using persisted unit_price`
      );

      let subtotal = 0;
      if (Array.isArray(cartOrOrder.items)) {
        for (const item of cartOrOrder.items) {
          // Usar unit_price persistido directamente (sin recalcular con IVA)
          subtotal += item.unit_price * item.quantity;
        }
      }

      console.log(
        `[TotalsService.getSubtotal] Cart ${cartOrOrder.id} subtotal: ${subtotal} cents (from persisted prices)`
      );
      return subtotal;
    }

    // Para carts normales, usar comportamiento por defecto
    return super.getSubtotal(cartOrOrder, opts);
  }

  /**
   * Calcula el total de shipping - override para usar price ya ajustado
   */
  async getShippingTotal(cartOrOrder: any): Promise<number> {
    console.log(
      `[TotalsService.getShippingTotal] Called for cart/order ${cartOrOrder.id} - prices_adjusted=${cartOrOrder.metadata?.prices_adjusted}`
    );

    // Si prices_adjusted=true, usar price persistido (sin recalcular)
    if (cartOrOrder.metadata?.prices_adjusted === true) {
      console.log(
        `[TotalsService.getShippingTotal] Cart ${cartOrOrder.id} has adjusted prices - using persisted price`
      );

      let shippingTotal = 0;
      if (Array.isArray(cartOrOrder.shipping_methods)) {
        for (const method of cartOrOrder.shipping_methods) {
          // Usar price persistido directamente (sin recalcular con IVA)
          shippingTotal += method.price || 0;
        }
      }

      console.log(
        `[TotalsService.getShippingTotal] Cart ${cartOrOrder.id} shipping: ${shippingTotal} cents (from persisted prices)`
      );
      return shippingTotal;
    }

    // Para carts normales, usar comportamiento por defecto
    return super.getShippingTotal(cartOrOrder);
  }

  /**
   * Calcula el total del carrito
   * Override para usar precios ya ajustados en tax-exempt regions
   */
  async getTotal(cartOrOrder: any, options: any = {}): Promise<number> {
    console.log(
      `[TotalsService.getTotal] Called for cart/order ${cartOrOrder.id} - prices_adjusted=${cartOrOrder.metadata?.prices_adjusted}`
    );

    // Si el cart tiene metadata.prices_adjusted, significa que ya ajustamos los precios
    // y NO debemos recalcularlos - usamos los métodos que respetan los precios persistidos
    if (cartOrOrder.metadata?.prices_adjusted === true) {
      console.log(
        `[TotalsService.getTotal] Cart ${cartOrOrder.id} has adjusted prices - calculating from persisted values`
      );

      // Calcular basándose en precios persistidos (usando nuestros overrides)
      const subtotal = await this.getSubtotal(cartOrOrder, options);
      const shipping = await this.getShippingTotal(cartOrOrder);
      const discount = await this.getDiscountTotal(cartOrOrder);
      const giftCardTotal = cartOrOrder.gift_card_total || 0;
      const taxTotal = 0; // Tax exempt, so tax is 0

      const total = subtotal + shipping + taxTotal - discount - giftCardTotal;

      console.log(
        `[TotalsService.getTotal] Cart ${cartOrOrder.id} total: ${total} cents ` +
          `(subtotal: ${subtotal}, shipping: ${shipping}, discount: ${discount}, gift_card: ${giftCardTotal})`
      );

      return Math.max(0, total);
    }

    // Para carts normales, usar el comportamiento por defecto
    return super.getTotal(cartOrOrder, options);
  }
}

export default TotalsService;
