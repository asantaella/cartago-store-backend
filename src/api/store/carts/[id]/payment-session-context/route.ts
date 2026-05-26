import {
  CartService,
  MedusaRequest,
  MedusaResponse,
  isPaymentProcessorError,
} from "@medusajs/medusa";
import {
  defaultStoreCartFields,
  defaultStoreCartRelations,
} from "@medusajs/medusa/dist/api/routes/store/carts";
import { cleanResponseData } from "@medusajs/medusa/dist/utils/clean-response-data";
import StripeProviderServiceExtended from "../../../../../services/stripe-provider";

type ThreeDSecurePolicy = "automatic" | "any";

type PaymentSessionContextRequestBody = {
  provider_id?: string;
  request_three_d_secure_policy?: ThreeDSecurePolicy;
  risk_review_reason?: string;
};

type SelectedPaymentSession = {
  id: string;
  data: Record<string, unknown>;
};

function isThreeDSecurePolicy(value: unknown): value is ThreeDSecurePolicy {
  return value === "automatic" || value === "any";
}

/**
 * @oas [post] /store/carts/{id}/payment-session-context
 * operationId: "PostCartsCartPaymentSessionContext"
 * summary: "Select a Payment Session with Checkout Context"
 * description: "Selects the active payment session and optionally configures Stripe-specific checkout context such as the 3DS policy for card payments."
 * tags:
 *   - Carts
 * responses:
 *   200:
 *     description: "The updated cart."
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const cartId = req.params.id as string;
  const body = (req.body ?? {}) as PaymentSessionContextRequestBody;
  const providerId = body.provider_id?.trim();

  if (!providerId) {
    res.status(400).json({
      message: "provider_id is required",
      type: "invalid_data",
    });
    return;
  }

  if (
    body.request_three_d_secure_policy !== undefined &&
    !isThreeDSecurePolicy(body.request_three_d_secure_policy)
  ) {
    res.status(400).json({
      message: "request_three_d_secure_policy must be 'automatic' or 'any'",
      type: "invalid_data",
    });
    return;
  }

  const cartService = req.scope.resolve("cartService") as CartService;
  const productVariantInventoryService = req.scope.resolve(
    "productVariantInventoryService",
  ) as {
    setVariantAvailability: (
      variants: unknown[],
      salesChannelId?: string | null,
    ) => Promise<void>;
  };
  const manager = req.scope.resolve("manager") as {
    transaction: <T>(
      handler: (transactionManager: any) => Promise<T>,
    ) => Promise<T>;
  };

  const selectedPaymentSession = await manager.transaction(
    async (transactionManager): Promise<SelectedPaymentSession | null> => {
      const cartServiceTx = cartService.withTransaction(transactionManager);

      await cartServiceTx.setPaymentSession(cartId, providerId);

      const cart = await cartServiceTx.retrieveWithTotals(cartId, {
        relations: ["payment_sessions"],
      });

      if (!cart.payment_session) {
        return null;
      }

      return {
        id: cart.payment_session.id,
        data: (cart.payment_session.data ?? {}) as Record<string, unknown>,
      };
    },
  );

  if (!selectedPaymentSession) {
    res.status(409).json({
      message: `No active payment session found for cart ${cartId}`,
      type: "invalid_state",
    });
    return;
  }

  if (providerId === "stripe") {
    const stripeProvider = req.scope.resolve(
      "pp_stripe",
    ) as StripeProviderServiceExtended;
    const configuredPaymentIntent = await stripeProvider.configurePaymentIntent(
      selectedPaymentSession.data,
      {
        requestThreeDSecurePolicy: body.request_three_d_secure_policy,
        riskReviewReason: body.risk_review_reason,
      },
    );

    if (isPaymentProcessorError(configuredPaymentIntent)) {
      res.status(422).json({
        message: configuredPaymentIntent.error,
        type: "payment_error",
        detail: configuredPaymentIntent.detail,
      });
      return;
    }

    await manager.transaction(async (transactionManager) => {
      const paymentSessionRepo =
        transactionManager.getRepository("PaymentSession");

      await paymentSessionRepo.update(
        { id: selectedPaymentSession.id },
        { data: configuredPaymentIntent },
      );
    });
  }

  const cart = await cartService.retrieveWithTotals(cartId, {
    select: defaultStoreCartFields,
    relations: defaultStoreCartRelations,
  });

  await productVariantInventoryService.setVariantAvailability(
    cart.items.map((item) => item.variant),
    cart.sales_channel_id,
  );

  res.status(200).json({
    cart: cleanResponseData(cart, []),
  });
}
