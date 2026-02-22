import {
  type SubscriberConfig,
  type SubscriberArgs,
  OrderService,
} from "@medusajs/medusa";

/**
 * Subscriber to handle PayPal PAYMENT.CAPTURE.COMPLETED webhook.
 * Attempts to capture the payment for the associated order.
 * Follows the same pattern as stripe-payment-succeeded subscriber.
 */
export default async function handlePayPalPaymentCapture({
  data,
  eventName,
  container,
}: SubscriberArgs<Record<string, any>>) {
  const logger = container.resolve("logger");
  
  try {
    const event = data;
    const eventType = event.event_type;

    // Only process PAYMENT.CAPTURE.COMPLETED events
    if (eventType !== "PAYMENT.CAPTURE.COMPLETED") {
      logger.info(`[PAYPAL-CAPTURE] Ignoring event type: ${eventType}`);
      return;
    }

    const resourceId = event.resource?.id;
    logger.info(`[PAYPAL-CAPTURE] Processing PAYMENT.CAPTURE.COMPLETED: ${resourceId}`);

    // Extract cart_id from PayPal order metadata
    // PayPal stores cart_id in purchase_units[0].custom_id or reference_id
    const purchaseUnit = event.resource?.purchase_units?.[0];
    const cartId = purchaseUnit?.custom_id || purchaseUnit?.reference_id;

    if (!cartId) {
      logger.warn(`[PAYPAL-CAPTURE] No cart_id found in PayPal event. Resource ID: ${resourceId}`);
      return;
    }

    // Skip payment collections (they have their own flow)
    if (cartId && cartId.startsWith("paycol")) {
      logger.info(`[PAYPAL-CAPTURE] Skipping payment collection: ${cartId}`);
      return;
    }

    const orderService: OrderService = container.resolve("orderService");

    // Retry Logic: 3 retries of 5 seconds
    // This handles race conditions where webhook arrives before order creation completes
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
        logger.info(`[PAYPAL-CAPTURE] Order for cart ${cartId} not found, retrying in ${retryDelay/1000}s (Attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
      attempt++;
    }

    if (!order) {
      logger.error(`[PAYPAL-CAPTURE] Failed to find order for cart ${cartId} after ${maxRetries} retries. PayPal Resource ID: ${resourceId}`);
      return;
    }

    // Capture payment if order exists
    // We check status to avoid double capture attempts if already processed
    if (order.payment_status !== "captured" && order.payment_status !== "partially_refunded" && order.payment_status !== "refunded") {
      logger.info(`[PAYPAL-CAPTURE] Capturing payment for order ${order.id} (status: ${order.payment_status})...`);
      await orderService.capturePayment(order.id);
      logger.info(`[PAYPAL-CAPTURE] Payment captured successfully for order ${order.id}`);
    } else {
      logger.info(`[PAYPAL-CAPTURE] Payment already captured (or refunded) for order ${order.id}. Status: ${order.payment_status}`);
    }

  } catch (error: any) {
    logger.error(`[PAYPAL-CAPTURE] Error handling PAYMENT.CAPTURE.COMPLETED: ${error.message}`, {
      stack: error.stack,
    });
  }
}

export const config: SubscriberConfig = {
  event: "medusa.paypal_webhook_received",
  context: {
    subscriberId: "paypal-payment-capture-handler",
  },
};
