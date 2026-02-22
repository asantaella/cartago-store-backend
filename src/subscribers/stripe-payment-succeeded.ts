import {
  type SubscriberConfig,
  type SubscriberArgs,
  OrderService,
} from "@medusajs/medusa";

/**
 * Subscriber to handle Stripe payment_intent.succeeded webhook.
 * Attempts to capture the payment for the associated order.
 * Replaces previous SEPA-only logic with generic logic for any payment method.
 */
export default async function handleStripePaymentSucceeded({
  data,
  eventName,
  container,
}: SubscriberArgs<Record<string, any>>) {
  const logger = container.resolve("logger");
  
  try {
    const event = data;
    const paymentIntent = event.data.object;

    // Only process payment_intent.succeeded
    if (event.type !== "payment_intent.succeeded") {
      return;
    }

    logger.info(`[STRIPE-CAPTURE] Processing payment_intent.succeeded: ${paymentIntent.id}`);

    const cartId = paymentIntent.metadata?.cart_id ?? paymentIntent.metadata?.resource_id;

    if (!cartId) {
      logger.warn(`[STRIPE-CAPTURE] No cart_id found in metadata for PaymentIntent: ${paymentIntent.id}`);
      return;
    }

    const orderService: OrderService = container.resolve("orderService");

    // Retry Logic: 3 retries of 5 seconds
    const maxRetries = 3;
    const retryDelay = 5000; // 5 seconds
    let attempt = 0;
    let order = null;

    // First attempt + 3 retries
    while (attempt <= maxRetries) {
      try {
        order = await orderService.retrieveByCartId(cartId);
        if (order) break; // Order found, exit loop
      } catch (error) {
        // Ignore error if order not found yet (404)
      }

      if (attempt < maxRetries) {
        logger.info(`[STRIPE-CAPTURE] Order for cart ${cartId} not found, retrying in ${retryDelay/1000}s (Attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
      attempt++;
    }

    if (!order) {
      logger.error(`[STRIPE-CAPTURE] Failed to find order for cart ${cartId} after ${maxRetries} retries.`);
      return;
    }

    // Capture payment if order exists
    // We check status to avoid double capture attempts if already processed
    if (order.payment_status !== "captured" && order.payment_status !== "partially_refunded" && order.payment_status !== "refunded") {
      logger.info(`[STRIPE-CAPTURE] Capturing payment for order ${order.id}...`);
      await orderService.capturePayment(order.id);
      logger.info(`[STRIPE-CAPTURE] Payment captured for order ${order.id}`);
    } else {
      logger.info(`[STRIPE-CAPTURE] Payment already captured (or refunded) for order ${order.id}. Status: ${order.payment_status}`);
    }

  } catch (error: any) {
    logger.error(`[STRIPE-CAPTURE] Error handling payment_intent.succeeded: ${error.message}`);
  }
}

export const config: SubscriberConfig = {
  event: "medusa.stripe_payment_intent_update",
  context: {
    subscriberId: "stripe-payment-succeeded-handler",
  },
};

