import { PaymentSessionStatus } from "@medusajs/medusa"
import StripeProviderService from "medusa-payment-stripe/dist/services/stripe-provider"
import {
  PaymentIntentOptions,
  StripeOptions,
} from "medusa-payment-stripe/dist/types"

class BizumProviderService extends StripeProviderService {
  static identifier = "stripe-bizum"

  constructor(
    container: Record<string, unknown>,
    options?: Partial<StripeOptions>
  ) {
    const resolvedOptions: StripeOptions = {
      api_key: process.env.STRIPE_API_KEY || "",
      webhook_secret: process.env.STRIPE_WEBHOOK_SECRET || "",
      capture: true,
      automatic_payment_methods: false,
      ...(options ?? {}),
    }

    super(container, resolvedOptions)
  }

  get paymentIntentOptions(): PaymentIntentOptions {
    return {
      payment_method_types: ["bizum"],
      capture_method: "automatic",
    }
  }

  async getPaymentStatus(paymentSessionData: Record<string, unknown>) {
    const id = String(paymentSessionData?.id ?? "")
    if (!id) {
      return super.getPaymentStatus(paymentSessionData)
    }

    const stripe = this.getStripe()
    const paymentIntent = await stripe.paymentIntents.retrieve(id)

    switch (paymentIntent.status) {
      case "requires_payment_method":
      case "requires_confirmation":
      case "processing":
        return PaymentSessionStatus.PENDING
      case "requires_action":
        return PaymentSessionStatus.REQUIRES_MORE
      case "canceled":
        return PaymentSessionStatus.CANCELED
      case "requires_capture":
      case "succeeded":
        return PaymentSessionStatus.AUTHORIZED
      default:
        return PaymentSessionStatus.PENDING
    }
  }
}

export default BizumProviderService