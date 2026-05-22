import StripeProviderService from "medusa-payment-stripe/dist/services/stripe-provider";
import {
  PaymentSessionStatus,
  PaymentProcessorContext,
  PaymentProcessorError,
  PaymentProcessorSessionResponse,
  isPaymentProcessorError,
} from "@medusajs/medusa";

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

  /**
   * Sobrescribe la creación del PaymentIntent para solicitar explícitamente
   * la autenticación 3DS/SCA en pagos con tarjeta (request_three_d_secure: 'automatic').
   * El PaymentIntent se crea primero mediante el método base y luego se actualiza
   * con las opciones de tarjeta. Esto garantiza el cumplimiento de PSD2/SCA.
   */
  async initiatePayment(
    context: PaymentProcessorContext,
  ): Promise<PaymentProcessorError | PaymentProcessorSessionResponse> {
    const intentRequestData = this.getPaymentIntentOptions();
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
      metadata: {
        resource_id,
      },
      capture_method: this.options_.capture ? "automatic" : "manual",
      ...intentRequestData,
      payment_method_options: {
        card: {
          // 'automatic': Stripe evalúa el riesgo y aplica 3DS cuando es necesario
          // según la normativa PSD2/SCA. Para forzar 3DS en todos los pagos
          // con tarjeta, cambiar a 'any'.
          request_three_d_secure: "automatic",
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
      )) as unknown as PaymentProcessorSessionResponse["session_data"];

      return {
        session_data: sessionData,
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
          )) as unknown as PaymentProcessorSessionResponse["session_data"];

          return {
            session_data: sessionData,
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

    const stripe = this.getStripe();
    const paymentIntent = await stripe.paymentIntents.retrieve(id);
    //console.log("Retrieved payment intent:", paymentIntent);
    if (
      paymentIntent.status === "processing" &&
      paymentIntent.payment_method_types?.includes("sepa_debit")
    ) {
      console.log(
        "SEPA Direct Debit payment is processing, marking as authorized.",
      );
      return PaymentSessionStatus.AUTHORIZED;
    }

    //console.log("Payment intent status:", paymentIntent.status);
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
}

export default StripeProviderServiceExtended;
