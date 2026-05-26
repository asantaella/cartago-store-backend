import StripeProviderService from "medusa-payment-stripe/dist/services/stripe-provider";
import Stripe from "stripe";
import {
  PaymentSessionStatus,
  PaymentProcessorContext,
  PaymentProcessorError,
  PaymentProcessorSessionResponse,
  isPaymentProcessorError,
} from "@medusajs/medusa";

type ThreeDSecurePolicy = "automatic" | "any";

type StripePaymentDiagnostics = {
  payment_intent_status: string;
  request_three_d_secure_policy: ThreeDSecurePolicy;
  risk_review_reason: string | null;
  requires_customer_action: boolean;
  needs_new_payment_method: boolean;
  awaiting_confirmation: boolean;
  next_action_type: string | null;
  last_payment_error_code: string | null;
  last_payment_error_decline_code: string | null;
  three_d_secure_result: string | null;
  authentication_satisfied: boolean;
  authentication_attempt_acknowledged: boolean;
  three_d_secure_unavailable_or_not_applied: boolean;
};

type StripePaymentSessionData =
  PaymentProcessorSessionResponse["session_data"] & {
    metadata?: Record<string, string>;
    medusa_payment_diagnostics?: StripePaymentDiagnostics;
    status?: string;
    payment_method_types?: string[];
  };

type ConfigurePaymentIntentInput = {
  requestThreeDSecurePolicy?: ThreeDSecurePolicy;
  riskReviewReason?: string | null;
};

class StripeProviderServiceExtended extends StripeProviderService {
  static identifier = "stripe";

  constructor(
    container: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) {
    const resolvedOptions = {
      api_key: process.env.STRIPE_API_KEY,
      webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
      capture: true,
      automatic_payment_methods: true,
      ...(options ?? {}),
    };

    super(container, resolvedOptions);
  }

  private getRequestThreeDSecurePolicy(value: unknown): ThreeDSecurePolicy {
    return value === "any" ? "any" : "automatic";
  }

  private getRiskReviewReason(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  private toMetadataRecord(
    metadata: Stripe.Metadata | null | undefined,
  ): Record<string, string> {
    const normalized: Record<string, string> = {};

    for (const [key, value] of Object.entries(metadata ?? {})) {
      if (typeof value === "string") {
        normalized[key] = value;
      }
    }

    return normalized;
  }

  private buildPaymentMetadata({
    existingMetadata,
    resourceId,
    requestThreeDSecurePolicy,
    riskReviewReason,
  }: {
    existingMetadata?: Record<string, string>;
    resourceId?: string | null;
    requestThreeDSecurePolicy: ThreeDSecurePolicy;
    riskReviewReason?: string | null;
  }): Record<string, string> {
    const metadata: Record<string, string> = {
      ...(existingMetadata ?? {}),
      request_three_d_secure_policy: requestThreeDSecurePolicy,
    };

    if (resourceId) {
      metadata.resource_id = resourceId;
    }

    if (riskReviewReason) {
      metadata.risk_review_reason = riskReviewReason;
    } else {
      delete metadata.risk_review_reason;
    }

    return metadata;
  }

  private getThreeDSecureResult(
    paymentIntent: Stripe.PaymentIntent,
  ): string | null {
    const latestCharge =
      paymentIntent.latest_charge &&
      typeof paymentIntent.latest_charge !== "string"
        ? (paymentIntent.latest_charge as Stripe.Charge)
        : null;

    const paymentMethodDetails = latestCharge?.payment_method_details;

    if (!paymentMethodDetails || paymentMethodDetails.type !== "card") {
      return null;
    }

    return paymentMethodDetails.card?.three_d_secure?.result ?? null;
  }

  private buildPaymentDiagnostics(
    paymentIntent: Stripe.PaymentIntent,
  ): StripePaymentDiagnostics {
    const metadata = this.toMetadataRecord(paymentIntent.metadata);
    const requestThreeDSecure = this.getRequestThreeDSecurePolicy(
      paymentIntent.payment_method_options?.card?.request_three_d_secure ??
        metadata.request_three_d_secure_policy,
    );
    const riskReviewReason = this.getRiskReviewReason(
      metadata.risk_review_reason,
    );
    const threeDSecureResult = this.getThreeDSecureResult(paymentIntent);

    return {
      payment_intent_status: paymentIntent.status,
      request_three_d_secure_policy: requestThreeDSecure,
      risk_review_reason: riskReviewReason,
      requires_customer_action: paymentIntent.status === "requires_action",
      needs_new_payment_method:
        paymentIntent.status === "requires_payment_method",
      awaiting_confirmation: paymentIntent.status === "requires_confirmation",
      next_action_type: paymentIntent.next_action?.type ?? null,
      last_payment_error_code: paymentIntent.last_payment_error?.code ?? null,
      last_payment_error_decline_code:
        paymentIntent.last_payment_error?.decline_code ?? null,
      three_d_secure_result: threeDSecureResult,
      authentication_satisfied: threeDSecureResult === "authenticated",
      authentication_attempt_acknowledged:
        threeDSecureResult === "attempt_acknowledged",
      three_d_secure_unavailable_or_not_applied:
        ["requires_capture", "succeeded"].includes(paymentIntent.status) &&
        !threeDSecureResult,
    };
  }

  private withDiagnostics(
    paymentIntent: Stripe.PaymentIntent,
  ): StripePaymentSessionData {
    return {
      ...(paymentIntent as unknown as Record<string, unknown>),
      metadata: this.toMetadataRecord(paymentIntent.metadata),
      medusa_payment_diagnostics: this.buildPaymentDiagnostics(paymentIntent),
    } as StripePaymentSessionData;
  }

  private async retrieveExpandedPaymentIntent(
    id: string,
  ): Promise<Stripe.PaymentIntent> {
    const stripe = this.getStripe();

    return (await stripe.paymentIntents.retrieve(id, {
      expand: ["latest_charge"],
    } as never)) as Stripe.PaymentIntent;
  }

  private mapPaymentIntentStatus(
    paymentIntent: Pick<
      StripePaymentSessionData,
      "status" | "payment_method_types"
    >,
  ): PaymentSessionStatus {
    if (
      paymentIntent.status === "processing" &&
      paymentIntent.payment_method_types?.includes("sepa_debit")
    ) {
      console.log(
        "SEPA Direct Debit payment is processing, marking as authorized.",
      );
      return PaymentSessionStatus.AUTHORIZED;
    }

    switch (paymentIntent.status) {
      case "requires_payment_method":
      case "requires_confirmation":
      case "processing":
        return PaymentSessionStatus.PENDING;
      case "requires_action":
        return PaymentSessionStatus.REQUIRES_MORE;
      case "canceled":
        return PaymentSessionStatus.CANCELED;
      case "requires_capture":
      case "succeeded":
        return PaymentSessionStatus.AUTHORIZED;
      default:
        return PaymentSessionStatus.PENDING;
    }
  }

  async configurePaymentIntent(
    paymentSessionData: Record<string, unknown>,
    input: ConfigurePaymentIntentInput,
  ): Promise<PaymentProcessorError | StripePaymentSessionData> {
    const id = String(paymentSessionData?.id ?? "");

    if (!id) {
      return this.buildError(
        "Missing payment intent id while configuring Stripe payment intent",
        new Error("Missing payment intent id"),
      );
    }

    try {
      const currentPaymentIntent = await this.retrieveExpandedPaymentIntent(id);
      const requestThreeDSecurePolicy = this.getRequestThreeDSecurePolicy(
        input.requestThreeDSecurePolicy,
      );
      const riskReviewReason = this.getRiskReviewReason(input.riskReviewReason);
      const metadata = this.buildPaymentMetadata({
        existingMetadata: this.toMetadataRecord(currentPaymentIntent.metadata),
        resourceId:
          this.toMetadataRecord(currentPaymentIntent.metadata).resource_id ??
          null,
        requestThreeDSecurePolicy,
        riskReviewReason,
      });

      const stripe = this.getStripe();
      const updatedPaymentIntent = (await stripe.paymentIntents.update(id, {
        metadata,
        payment_method_options: {
          card: {
            request_three_d_secure: requestThreeDSecurePolicy,
          },
        },
        expand: ["latest_charge"],
      } as never)) as Stripe.PaymentIntent;

      return this.withDiagnostics(updatedPaymentIntent);
    } catch (error: any) {
      return this.buildError(
        "An error occurred while configuring the Stripe payment intent",
        error,
      );
    }
  }

  /**
   * Sobrescribe la creación del PaymentIntent para solicitar explícitamente
   * la política 3DS/SCA configurada para pagos con tarjeta.
   */
  async initiatePayment(
    context: PaymentProcessorContext,
  ): Promise<PaymentProcessorError | PaymentProcessorSessionResponse> {
    const intentRequestData = this.getPaymentIntentOptions();
    const contextData = (context.context ?? {}) as Record<string, unknown>;
    const requestThreeDSecurePolicy = this.getRequestThreeDSecurePolicy(
      contextData.request_three_d_secure_policy,
    );
    const riskReviewReason = this.getRiskReviewReason(
      contextData.risk_review_reason,
    );
    const {
      email,
      context: cartContext,
      currency_code,
      amount,
      resource_id,
      customer,
    } = context;

    const description =
      cartContext.payment_description ?? this.options_.payment_description;

    const intentRequest: Record<string, unknown> = {
      description,
      amount: Math.round(amount),
      currency: currency_code,
      expand: ["latest_charge"],
      metadata: this.buildPaymentMetadata({
        resourceId: resource_id,
        requestThreeDSecurePolicy,
        riskReviewReason,
      }),
      capture_method: this.options_.capture ? "automatic" : "manual",
      ...intentRequestData,
      payment_method_options: {
        card: {
          request_three_d_secure: requestThreeDSecurePolicy,
        },
      },
    };

    if (this.options_.automatic_payment_methods) {
      intentRequest.automatic_payment_methods = { enabled: true };
    }

    if (customer?.metadata?.stripe_id) {
      intentRequest.customer = customer.metadata.stripe_id;
    } else if (email) {
      try {
        const stripe = this.getStripe();
        const stripeCustomer = await stripe.customers.create({
          email,
        });

        intentRequest.customer = stripeCustomer.id;
      } catch (error: any) {
        console.warn(
          "[StripeProvider] No se pudo crear Stripe customer, continuando sin customer:",
          error?.message,
        );
      }
    }

    try {
      const stripe = this.getStripe();
      const sessionData = (await stripe.paymentIntents.create(
        intentRequest as never,
      )) as unknown as Stripe.PaymentIntent;

      return {
        session_data: this.withDiagnostics(sessionData),
        update_requests: customer?.metadata?.stripe_id
          ? undefined
          : intentRequest.customer
            ? {
                customer_metadata: {
                  stripe_id: intentRequest.customer,
                },
              }
            : undefined,
      };
    } catch (error: any) {
      if (error?.code === "resource_missing" && intentRequest.customer) {
        try {
          const retryIntentRequest = { ...intentRequest };
          delete retryIntentRequest.customer;

          const stripe = this.getStripe();
          const sessionData = (await stripe.paymentIntents.create(
            retryIntentRequest as never,
          )) as unknown as Stripe.PaymentIntent;

          return {
            session_data: this.withDiagnostics(sessionData),
            update_requests: undefined,
          };
        } catch (retryError: any) {
          return this.buildError(
            "An error occurred in InitiatePayment during the creation of the stripe payment intent",
            retryError,
          );
        }
      }

      return this.buildError(
        "An error occurred in InitiatePayment during the creation of the stripe payment intent",
        error,
      );
    }
  }

  async getPaymentStatus(paymentSessionData: Record<string, unknown>) {
    const id = String(paymentSessionData?.id ?? "");
    if (!id) {
      return super.getPaymentStatus(paymentSessionData);
    }

    const paymentIntent = await this.retrievePayment(paymentSessionData);

    if (isPaymentProcessorError(paymentIntent)) {
      return super.getPaymentStatus(paymentSessionData);
    }

    return this.mapPaymentIntentStatus(
      paymentIntent as StripePaymentSessionData,
    );
  }

  async authorizePayment(
    paymentSessionData: Record<string, unknown>,
    _context: Record<string, unknown>,
  ): Promise<
    | PaymentProcessorError
    | {
        status: PaymentSessionStatus;
        data: PaymentProcessorSessionResponse["session_data"];
      }
  > {
    const paymentIntent = await this.retrievePayment(paymentSessionData);

    if (isPaymentProcessorError(paymentIntent)) {
      return paymentIntent;
    }

    return {
      data: paymentIntent,
      status: this.mapPaymentIntentStatus(
        paymentIntent as StripePaymentSessionData,
      ),
    };
  }

  async retrievePayment(
    paymentSessionData: Record<string, unknown>,
  ): Promise<
    PaymentProcessorError | PaymentProcessorSessionResponse["session_data"]
  > {
    const id = String(paymentSessionData?.id ?? "");

    if (!id) {
      return this.buildError(
        "Missing payment intent id while retrieving Stripe payment intent",
        new Error("Missing payment intent id"),
      );
    }

    try {
      const paymentIntent = await this.retrieveExpandedPaymentIntent(id);

      return this.withDiagnostics(paymentIntent);
    } catch (error: any) {
      return this.buildError("An error occurred in retrievePayment", error);
    }
  }
}

export default StripeProviderServiceExtended;
