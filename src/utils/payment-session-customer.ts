type UpdatePaymentContext = {
  customer?: { metadata?: Record<string, unknown> | null } | null;
  paymentSessionData?: Record<string, unknown>;
};

/**
 * The Stripe base `updatePayment` recreates the PaymentIntent whenever
 * `customer.metadata.stripe_id` differs from the PI customer, which always
 * happens for guests (no stripe_id). Only a real, persisted stripe_id that
 * differs from the PI customer warrants a regeneration; otherwise the context
 * is aligned so the base keeps the same PaymentIntent.
 */
export function keepSamePaymentIntentCustomer<T extends UpdatePaymentContext>(
  context: T,
): T {
  const stripeId = context.customer?.metadata?.stripe_id;
  if (stripeId) {
    return context;
  }

  return {
    ...context,
    customer: {
      ...(context.customer ?? {}),
      metadata: {
        ...(context.customer?.metadata ?? {}),
        stripe_id: context.paymentSessionData?.customer,
      },
    },
  };
}
