import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";

type PayPalWebhookHandler = (
  req: MedusaRequest,
  res: MedusaResponse,
) => Promise<void>;

/**
 * The PayPal plugin's route is not mounted by this application's source route
 * loader. Keep the business handler in the plugin and adapt it here instead
 * of duplicating verification, event emission, or cart completion logic.
 *
 * build:server compiles src first and builds the local PayPal plugin after it;
 * therefore the runtime adapter resolves the plugin's compiled handler.
 */
function loadPayPalWebhookHandler(): PayPalWebhookHandler {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const module = require(
    "../../../../plugins/medusa-payment-paypal/dist/api/routes/hooks/paypal",
  ) as { default?: PayPalWebhookHandler } | PayPalWebhookHandler;

  return typeof module === "function" ? module : module.default!;
}

/**
 * Medusa discovers POST handlers exported from src/api route modules.
 * The global JSON parser has already materialized req.body; PayPal's existing
 * handler verifies that JSON payload and owns the 200/401/409 responses.
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  try {
    await loadPayPalWebhookHandler()(req, res);
  } catch (error) {
    // A handler failure must be retried by PayPal rather than acknowledged.
    if (!res.headersSent) {
      res.sendStatus(409);
    }
  }
}
