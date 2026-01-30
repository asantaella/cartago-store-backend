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
    const id = String(paymentSessionData?.id ?? "");
    if (!id) {
      return super.getPaymentStatus(paymentSessionData);
    }

    const stripe = this.getStripe();
    const paymentIntent = await stripe.paymentIntents.retrieve(id);

    if (
      paymentIntent.status === "processing" &&
      paymentIntent.payment_method_types?.includes("sepa_debit")
    ) {
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
}

export default StripeProviderServiceExtended;
