import {
  PaymentProcessorContext,
  PaymentSessionStatus,
  isPaymentProcessorError,
} from "@medusajs/medusa";

import StripeProviderServiceExtended from "../stripe-provider";

const buildPaymentIntent = (overrides: Record<string, unknown> = {}) => ({
  id: "pi_test",
  object: "payment_intent",
  status: "requires_payment_method",
  metadata: {
    resource_id: "cart_test",
    request_three_d_secure_policy: "automatic",
  },
  payment_method_options: {
    card: {
      request_three_d_secure: "automatic",
    },
  },
  payment_method_types: ["card"],
  latest_charge: null,
  next_action: null,
  last_payment_error: null,
  ...overrides,
});

describe("StripeProviderServiceExtended", () => {
  let stripeProvider: StripeProviderServiceExtended;
  let stripeMock: {
    paymentIntents: {
      create: jest.Mock;
      retrieve: jest.Mock;
      update: jest.Mock;
    };
    customers: {
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    stripeMock = {
      paymentIntents: {
        create: jest.fn(),
        retrieve: jest.fn(),
        update: jest.fn(),
      },
      customers: {
        create: jest.fn(),
      },
    };

    stripeProvider = new StripeProviderServiceExtended({}, {
      api_key: "test",
      webhook_secret: "whsec_test",
      capture: true,
      automatic_payment_methods: true,
    } as Record<string, unknown>);
    (stripeProvider as any).getStripe = () => stripeMock;
  });

  it("creates card payment intents with automatic 3DS by default", async () => {
    stripeMock.customers.create.mockResolvedValue({ id: "cus_test" });
    stripeMock.paymentIntents.create.mockResolvedValue(buildPaymentIntent());

    const result = await stripeProvider.initiatePayment({
      amount: 1200,
      currency_code: "eur",
      resource_id: "cart_test",
      email: "cliente@example.com",
      context: {},
    } as PaymentProcessorContext);

    expect(stripeMock.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          resource_id: "cart_test",
          request_three_d_secure_policy: "automatic",
        }),
        payment_method_options: {
          card: {
            request_three_d_secure: "automatic",
          },
        },
      }),
    );

    expect(isPaymentProcessorError(result)).not.toBe(true);
    expect((result as any).session_data.medusa_payment_diagnostics).toEqual(
      expect.objectContaining({
        request_three_d_secure_policy: "automatic",
      }),
    );
  });

  it("updates the payment intent policy to any when risk context requests it", async () => {
    stripeMock.paymentIntents.retrieve.mockResolvedValue(buildPaymentIntent());
    stripeMock.paymentIntents.update.mockResolvedValue(
      buildPaymentIntent({
        metadata: {
          resource_id: "cart_test",
          request_three_d_secure_policy: "any",
          risk_review_reason: "manual_review",
        },
        payment_method_options: {
          card: {
            request_three_d_secure: "any",
          },
        },
      }),
    );

    const result = await stripeProvider.configurePaymentIntent(
      { id: "pi_test" },
      {
        requestThreeDSecurePolicy: "any",
        riskReviewReason: "manual_review",
      },
    );

    expect(isPaymentProcessorError(result)).not.toBe(true);
    expect(stripeMock.paymentIntents.update).toHaveBeenCalledWith(
      "pi_test",
      expect.objectContaining({
        metadata: expect.objectContaining({
          request_three_d_secure_policy: "any",
          risk_review_reason: "manual_review",
        }),
        payment_method_options: {
          card: {
            request_three_d_secure: "any",
          },
        },
      }),
    );
    expect((result as any).medusa_payment_diagnostics).toEqual(
      expect.objectContaining({
        request_three_d_secure_policy: "any",
        risk_review_reason: "manual_review",
      }),
    );
  });

  it("preserves upstream status semantics while surfacing 3DS-aware diagnostics", async () => {
    stripeMock.paymentIntents.retrieve.mockResolvedValue(
      buildPaymentIntent({
        status: "requires_action",
        next_action: { type: "use_stripe_sdk" },
      }),
    );

    let status = await stripeProvider.getPaymentStatus({ id: "pi_test" });
    expect(status).toBe(PaymentSessionStatus.REQUIRES_MORE);

    stripeMock.paymentIntents.retrieve.mockResolvedValue(
      buildPaymentIntent({
        status: "requires_payment_method",
        last_payment_error: {
          code: "card_declined",
          decline_code: "do_not_honor",
        },
      }),
    );

    status = await stripeProvider.getPaymentStatus({ id: "pi_test" });
    expect(status).toBe(PaymentSessionStatus.PENDING);

    const paymentIntent = await stripeProvider.retrievePayment({
      id: "pi_test",
    });

    expect(isPaymentProcessorError(paymentIntent)).not.toBe(true);
    expect((paymentIntent as any).medusa_payment_diagnostics).toEqual(
      expect.objectContaining({
        needs_new_payment_method: true,
        last_payment_error_code: "card_declined",
        last_payment_error_decline_code: "do_not_honor",
      }),
    );
  });
});
