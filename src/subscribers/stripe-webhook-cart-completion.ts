import { type SubscriberArgs, type SubscriberConfig } from "@medusajs/medusa";

type StripePaymentIntentEvent = {
  id?: string;
  type?: string;
  data?: { object?: Record<string, any> };
};

type CompletionContainer = {
  resolve: (name: string) => any;
};

function paymentMethodType(paymentIntent: Record<string, any>): string | null {
  const paymentMethod = paymentIntent.payment_method;
  return typeof paymentMethod === "object" && paymentMethod
    ? paymentMethod.type ?? null
    : null;
}

async function isGenuineSepaPayment(
  paymentIntent: Record<string, any>,
  container: CompletionContainer,
): Promise<boolean> {
  const eventMethod = paymentMethodType(paymentIntent);
  if (eventMethod) {
    return eventMethod === "sepa_debit";
  }

  // payment_method_types describes what was allowed, not what was selected.
  // Retrieve with payment_method expanded before classifying automatic intents.
  const paymentIntentId = paymentIntent.id;
  const stripeProviderService = container.resolve("stripeProviderService");
  if (!paymentIntentId || !stripeProviderService?.retrievePayment) {
    return false;
  }

  const retrieved = await stripeProviderService.retrievePayment({
    id: paymentIntentId,
  });
  return paymentMethodType(retrieved ?? {}) === "sepa_debit";
}

export default async function handleStripePaymentIntentUpdate({
  data,
  container,
}: SubscriberArgs<StripePaymentIntentEvent> & {
  container: CompletionContainer;
}) {
  const event = data;
  const paymentIntent = event.data?.object;

  if (
    event.type !== "payment_intent.processing" ||
    paymentIntent?.status !== "processing"
  ) {
    return;
  }

  const cartId =
    paymentIntent.metadata?.cart_id ?? paymentIntent.metadata?.resource_id;
  const eventId = event.id;

  if (!cartId || !eventId || cartId.startsWith("paycol")) {
    return;
  }

  if (!(await isGenuineSepaPayment(paymentIntent, container))) {
    return;
  }

  const manager = container.resolve("manager");

  await manager.transaction(async (transactionManager: unknown) => {
    const idempotencyKeyService = container
      .resolve("idempotencyKeyService")
      .withTransaction(transactionManager);
    const orderService = container.resolve("orderService");
    const orderServiceTx = orderService?.withTransaction
      ? orderService.withTransaction(transactionManager)
      : orderService;

    try {
      await orderServiceTx.retrieveByCartId(cartId);
      return;
    } catch {
      // The cart has not been completed yet; continue in this transaction.
    }

    let idempotencyKey = await idempotencyKeyService
      .retrieve({
        request_path: "/stripe/hooks",
        idempotency_key: eventId,
      })
      .catch(() => undefined);

    if (idempotencyKey && !idempotencyKey.recovery_point) {
      idempotencyKey = await idempotencyKeyService.update(eventId, {
        recovery_point: "started",
      });
    }

    if (!idempotencyKey) {
      idempotencyKey = await idempotencyKeyService
        .withTransaction(transactionManager)
        .create({
          request_path: "/stripe/hooks",
          idempotency_key: eventId,
        });
    }
    const cart = await container
      .resolve("cartService")
      .withTransaction(transactionManager)
      .retrieve(cartId, { select: ["context"] });
    const cartCompletionStrategy = container.resolve("cartCompletionStrategy");

    await cartCompletionStrategy
      .withTransaction(transactionManager)
      .complete(cartId, idempotencyKey, { ip: cart.context?.ip });
  });
}

export const config: SubscriberConfig = {
  event: "medusa.stripe_payment_intent_update",
  context: {
    subscriberId: "stripe-sepa-processing-cart-completion",
  },
};
