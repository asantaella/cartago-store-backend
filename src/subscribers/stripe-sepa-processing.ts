import type {
  SubscriberConfig,
  SubscriberArgs,
} from "@medusajs/medusa";

/**
 * Subscriber para manejar el webhook payment_intent.processing de Stripe
 * específicamente para pagos SEPA Direct Debit.
 */
async function handleStripeSepaProcessing({
  data,
  eventName,
  container,
}: SubscriberArgs<Record<string, any>>) {
  console.log("[SEPA-PROCESSING] ===== SUBSCRIBER INVOKED =====");
  
  let logger: any;
  
  try {
    logger = container.resolve("logger");
    const event = data;
    
    logger.info(`[SEPA-PROCESSING] Received event type: ${event.type}`);
    
    // Solo procesar eventos payment_intent.processing
    if (event.type !== "payment_intent.processing") {
      logger.info(`[SEPA-PROCESSING] Ignoring event type ${event.type}, not processing`);
      return;
    }

    const paymentIntent = event.data.object;
    
    logger.info(`[SEPA-PROCESSING] Payment intent ID: ${paymentIntent.id}, Payment methods: ${JSON.stringify(paymentIntent.payment_method_types)}`);

    // Verificar que sea un pago SEPA Direct Debit
    const isSepaDebit = paymentIntent.payment_method_types?.includes("sepa_debit");
    
    if (!isSepaDebit) {
      logger.info(`[SEPA-PROCESSING] Skipping non-SEPA payment intent: ${paymentIntent.id}`);
      return;
    }

    logger.info(`[SEPA-PROCESSING] Processing SEPA Direct Debit payment: ${paymentIntent.id}`);

    // Obtener el cart_id del metadata del payment intent
    const cartId = paymentIntent.metadata?.cart_id ?? paymentIntent.metadata?.resource_id;

    logger.info(`[SEPA-PROCESSING] Cart ID from metadata: ${cartId}`);

    if (!cartId) {
      logger.warn(`[SEPA-PROCESSING] No cart_id found in payment intent metadata: ${paymentIntent.id}`);
      return;
    }

    logger.info(`[SEPA-PROCESSING] Checking if order already exists for cart ${cartId}...`);

    // Verificar si ya existe una orden para este cart
    const orderService = container.resolve("orderService");
    const existingOrder = await orderService
      .retrieveByCartId(cartId)
      .catch(() => undefined);

    if (existingOrder) {
      logger.info(`[SEPA-PROCESSING] Order already exists for cart ${cartId}: ${existingOrder.id}`);
      return;
    }

    logger.info(`[SEPA-PROCESSING] No existing order found. Starting cart completion...`);

    // Completar el cart y crear la orden
    const manager = container.resolve("manager");
    await manager.transaction(async (transactionManager: any) => {
      const cartCompletionStrategy = container.resolve("cartCompletionStrategy");
      const cartService = container.resolve("cartService");
      const idempotencyKeyService = container.resolve("idempotencyKeyService");

      const idempotencyKeyServiceTx = idempotencyKeyService.withTransaction(
        transactionManager
      );

      // Crear o recuperar la idempotency key usando el event ID
      let idempotencyKey = await idempotencyKeyServiceTx
        .retrieve({
          request_path: "/stripe/hooks",
          idempotency_key: event.id,
        })
        .catch(() => undefined);

      if (!idempotencyKey) {
        idempotencyKey = await idempotencyKeyServiceTx.create({
          request_path: "/stripe/hooks",
          idempotency_key: event.id,
        });
      }

      // Recuperar el cart (solo necesitamos el context para el IP)
      const cart = await cartService
        .withTransaction(transactionManager)
        .retrieve(cartId, { select: ["id", "context"] });

      // Completar el cart
      const { response_code, response_body } = await cartCompletionStrategy
        .withTransaction(transactionManager)
        .complete(cartId, idempotencyKey, { ip: cart.context?.ip });

      if (response_code !== 200) {
        throw new Error(
          `Failed to complete cart: ${response_body?.message || "Unknown error"}`
        );
      }

      logger.info(
        `[SEPA-PROCESSING] Successfully created order for cart ${cartId} from SEPA payment ${paymentIntent.id}`
      );
    });
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    const errorStack = error?.stack || "";
    
    const logError = (msg: string) => {
      if (logger) {
        logger.error(msg);
      } else {
        console.error(msg);
      }
    };
    
    logError(`[SEPA-PROCESSING] Error handling SEPA processing webhook: ${errorMessage}`);
    logError(`[SEPA-PROCESSING] Stack trace: ${errorStack}`);
  }
}

export default handleStripeSepaProcessing;

export const config: SubscriberConfig = {
  event: "medusa.stripe_payment_intent_update",
  context: {
    subscriberId: "sepa-direct-debit-handler",
  },
};
