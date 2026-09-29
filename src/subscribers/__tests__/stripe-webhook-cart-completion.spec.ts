import handleStripePaymentIntentUpdate from "../stripe-webhook-cart-completion";

function buildContainer({ existingRecoveryPoint }: { existingRecoveryPoint?: string | null } = {}) {
  const transactionManager = { name: "transaction-manager" };
  const observedEventIds = new Set<string>();
  const idempotencyKeyService = {
    withTransaction: jest.fn().mockReturnThis(),
    retrieve: jest.fn(async ({ idempotency_key }: { idempotency_key: string }) =>
      observedEventIds.has(idempotency_key)
        ? { id: "ik_evt_1", idempotency_key, recovery_point: existingRecoveryPoint }
        : undefined,
    ),
    create: jest.fn(async ({ idempotency_key }: { idempotency_key: string }) => {
      observedEventIds.add(idempotency_key);
      return { id: "ik_evt_1", idempotency_key, recovery_point: "started" };
    }),
    update: jest.fn(async (_idempotencyKey: string, update: Record<string, unknown>) => ({
      id: "ik_evt_1",
      idempotency_key: "evt_processing_1",
      recovery_point: update.recovery_point,
    })),
  };
  const cartCompletionStrategy = {
    withTransaction: jest.fn().mockReturnThis(),
    complete: jest.fn(async () => ({ response_code: 200 })),
  };
  const cartService = {
    withTransaction: jest.fn().mockReturnThis(),
    retrieve: jest.fn(async () => ({ context: { ip: "203.0.113.10" } })),
  };
  const stripeProviderService = {
    retrievePayment: jest.fn(async () => ({
      id: "pi_sepa_1",
      status: "processing",
      payment_method: { type: "sepa_debit" },
    })),
  };
  const orderService = {
    withTransaction: jest.fn().mockReturnThis(),
    retrieveByCartId: jest.fn<Promise<any>, []>(async () => {
      throw { type: "not_found" };
    }),
  };
  const manager = {
    transaction: jest.fn(async (callback) => callback(transactionManager)),
  };

  return {
    container: {
      resolve: jest.fn((name: string) => {
        const services: Record<string, unknown> = {
          manager,
          idempotencyKeyService,
          cartCompletionStrategy,
          cartService,
          stripeProviderService,
          orderService,
        };
        return services[name];
      }),
    },
    mocks: {
      manager,
      idempotencyKeyService,
      cartCompletionStrategy,
      cartService,
      stripeProviderService,
      orderService,
    },
  };
}

const event: any = {
  id: "evt_processing_1",
  type: "payment_intent.processing",
  data: {
    object: {
      id: "pi_sepa_1",
      metadata: { resource_id: "cart_1" },
      status: "processing",
      payment_method_types: ["sepa_debit"],
    },
  },
};

describe("Stripe webhook cart completion", () => {
  it("completes a genuine SEPA processing cart through the transactional strategy", async () => {
    const { container, mocks } = buildContainer();

    await handleStripePaymentIntentUpdate({
      data: event,
      eventName: "medusa.stripe_payment_intent_update",
      container: container as any,
      pluginOptions: {},
    });

    expect(mocks.idempotencyKeyService.create).toHaveBeenCalledWith({
      request_path: "/stripe/hooks",
      idempotency_key: "evt_processing_1",
    });
    expect(mocks.stripeProviderService.retrievePayment).toHaveBeenCalledWith({
      id: "pi_sepa_1",
    });
    expect(mocks.cartCompletionStrategy.complete).toHaveBeenCalledWith(
      "cart_1",
      expect.objectContaining({ idempotency_key: "evt_processing_1" }),
      { ip: "203.0.113.10" },
    );
    expect(mocks.cartCompletionStrategy.withTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ name: "transaction-manager" }),
    );
    expect(mocks.cartService.retrieve).toHaveBeenCalledWith("cart_1", {
      select: ["context"],
    });
  });

  it("repairs a pre-existing event record with no recovery point before completing", async () => {
    const { container, mocks } = buildContainer({ existingRecoveryPoint: null });
    mocks.idempotencyKeyService.retrieve.mockImplementation(async () => ({
      id: "ik_evt_1",
      idempotency_key: "evt_processing_1",
      recovery_point: null,
    }));

    await handleStripePaymentIntentUpdate({
      data: event,
      eventName: "medusa.stripe_payment_intent_update",
      container: container as any,
      pluginOptions: {},
    });

    expect(mocks.idempotencyKeyService.update).toHaveBeenCalledWith(
      "evt_processing_1",
      { recovery_point: "started" },
    );
    expect(mocks.cartCompletionStrategy.complete).toHaveBeenCalledTimes(1);
  });

  it("does not create a second completion for a repeated event", async () => {
    const { container, mocks } = buildContainer();

    await handleStripePaymentIntentUpdate({
      data: event,
      eventName: "medusa.stripe_payment_intent_update",
      container: container as any,
      pluginOptions: {},
    });
    mocks.idempotencyKeyService.retrieve.mockResolvedValue({
      id: "ik_evt_1",
      idempotency_key: "evt_processing_1",
      recovery_point: "finished",
    });
    await handleStripePaymentIntentUpdate({
      data: event,
      eventName: "medusa.stripe_payment_intent_update",
      container: container as any,
      pluginOptions: {},
    });

    expect(mocks.idempotencyKeyService.create).toHaveBeenCalledTimes(1);
    expect(mocks.cartCompletionStrategy.complete).toHaveBeenCalledTimes(2);
    expect((mocks.cartCompletionStrategy.complete.mock.calls as any[])[1][1]).toEqual(
      expect.objectContaining({ recovery_point: "finished" }),
    );
  });

  it("does not complete card or arbitrary automatic-payment-method processing", async () => {
    const { container, mocks } = buildContainer();
    mocks.stripeProviderService.retrievePayment.mockResolvedValue({
      id: "pi_card_1",
      status: "processing",
      payment_method: { type: "card" },
    });

    await handleStripePaymentIntentUpdate({
      data: {
        ...event,
        data: {
          object: {
            ...event.data.object,
            id: "pi_card_1",
            payment_method_types: ["card", "sepa_debit"],
          },
        },
      },
      eventName: "medusa.stripe_payment_intent_update",
      container: container as any,
      pluginOptions: {},
    });

    expect(mocks.cartCompletionStrategy.complete).not.toHaveBeenCalled();
  });

  it("reuses an existing Order without completing the cart again", async () => {
    const { container, mocks } = buildContainer();
    mocks.orderService.retrieveByCartId.mockResolvedValue({ id: "order_1" });

    await handleStripePaymentIntentUpdate({
      data: event,
      eventName: "medusa.stripe_payment_intent_update",
      container: container as any,
      pluginOptions: {},
    });

    expect(mocks.cartCompletionStrategy.complete).not.toHaveBeenCalled();
    expect(mocks.idempotencyKeyService.create).not.toHaveBeenCalled();
  });

  it.each(["payment_intent.succeeded", "payment_intent.payment_failed"])(
    "leaves existing %s handling to the Stripe plugin",
    async (type) => {
      const { container, mocks } = buildContainer();

      await handleStripePaymentIntentUpdate({
        data: { ...event, type },
        eventName: "medusa.stripe_payment_intent_update",
        container: container as any,
        pluginOptions: {},
      });

      expect(mocks.manager.transaction).not.toHaveBeenCalled();
      expect(mocks.cartCompletionStrategy.complete).not.toHaveBeenCalled();
    },
  );
});
