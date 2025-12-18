import { type SubscriberArgs, type SubscriberConfig } from "@medusajs/medusa";
import { persistTaxExemptPrices } from "../utils/tax-exempt-persistence";
import PostalPricingService from "../services/postal-pricing";

// Subscriber agresivo para capturar múltiples eventos de cart que pueden necesitar persistencia
export default async function handleCartUpdatesAgressive({
  data,
  eventName,
  container,
}: SubscriberArgs<Record<string, any>>) {
  try {
    // Extraer cart ID del evento
    let cartId: string | null = null;

    if (typeof data === "string") {
      cartId = data;
    } else if (data?.id) {
      cartId = data.id;
    } else if (data?.cart_id) {
      cartId = data.cart_id;
    } else if (data?.cart?.id) {
      cartId = data.cart.id;
    }

    if (!cartId) {
      console.log(`[cart-upate] No cart ID found in event ${eventName}`);
      return;
    }

    const cartService = container.resolve("cartService");

    // Verificar si el cart tiene dirección de envío y cargar payment_sessions
    const cart = await cartService.retrieve(cartId, {
      relations: ["shipping_address", "payment_sessions", "payment"],
    });

    const postal = cart?.shipping_address?.postal_code;
    const isTaxExempt = postal && postal.match(/^(35|38|51|52)\d{3}$/);

    // Always execute pricing - the service will decide what to do internally
    try {
      // Intentar usar el nuevo servicio de pricing postal primero
      const postalPricingService: PostalPricingService = container.resolve(
        "postalPricingService"
      );
      const transaction = await postalPricingService.applyPostalPricing(cartId);

      if (transaction) {
        console.log(
          `[cart-update] Postal pricing completed for cart ${cartId} (${transaction.territoryType}): ${transaction.itemAdjustments.length} items, ${transaction.shippingAdjustments.length} shipping adjusted`
        );
      } else {
        // Fallback al método anterior
        const result = await persistTaxExemptPrices(container, cartId);
        console.log(
          `[cart-update] Fallback persistence completed for cart ${cartId}, result: ${result}`
        );
      }
    } catch (error) {
      console.error(
        `[cart-update] Pricing error for cart ${cartId}:`,
        error.message,
        error.stack
      );
    }
  } catch (error) {
    console.error(`[cart-update] Error processing event ${eventName}:`, error);
  }
}

export const config: SubscriberConfig = {
  // Escuchar múltiples eventos relacionados con carts y direcciones
  event: [
    "cart.customer_updated",
    "cart.updated",
    "cart.shipping_methods_updated",
    "cart.shipping_address_updated", // Cambios específicos de dirección de envío
    "address.created", // Nueva dirección creada
    "address.updated", // Dirección existente actualizada
  ],
  context: {
    subscriberId: "cart-update-tax-exempt",
  },
};
