import StripeProviderService from "medusa-payment-stripe/dist/services/stripe-provider";
import { PaymentSessionStatus } from "@medusajs/medusa";

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

  async getPaymentStatus(paymentSessionData: Record<string, unknown>) {
    console.log("Getting payment status for session:", paymentSessionData);
    const id = String(paymentSessionData?.id ?? "");
    if (!id) {
      return super.getPaymentStatus(paymentSessionData);
    }

    const stripe = this.getStripe();
    const paymentIntent = await stripe.paymentIntents.retrieve(id);
    console.log("Retrieved payment intent:", paymentIntent);
    if (
      paymentIntent.status === "processing" &&
      paymentIntent.payment_method_types?.includes("sepa_debit")
    ) {
      console.log("SEPA Direct Debit payment is processing, marking as authorized.");
      return PaymentSessionStatus.AUTHORIZED;
    }

    console.log("Payment intent status:", paymentIntent.status);
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
