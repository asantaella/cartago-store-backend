import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";

type StripeProviderService = {
  options?: {
    webhook_delay?: number;
    webhook_retries?: number;
  };
  constructWebhookEvent: (body: Buffer, signature: string | string[] | undefined) => unknown;
};

/**
 * Source-owned Stripe webhook route. Keeping this route in src/api ensures
 * Medusa discovers it even when the installed Stripe plugin's route is not
 * mounted by the application loader.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const stripeProviderService = req.scope.resolve(
      "stripeProviderService",
    ) as StripeProviderService;
    const event = stripeProviderService.constructWebhookEvent(
      req.body as Buffer,
      req.headers["stripe-signature"],
    );
    const eventBusService = req.scope.resolve("eventBusService") as {
      emit: (
        eventName: string,
        payload: unknown,
        options: { delay: number; attempts: number },
      ) => Promise<unknown>;
    };
    const options = stripeProviderService.options ?? {};

    await eventBusService.emit("medusa.stripe_payment_intent_update", event, {
      delay: options.webhook_delay ?? 5000,
      attempts: options.webhook_retries ?? 3,
    });

    res.sendStatus(200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook";
    res.status(400).send(`Webhook Error: ${message}`);
  }
}
