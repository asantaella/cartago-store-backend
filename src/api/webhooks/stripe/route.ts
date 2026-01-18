import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import Stripe from "stripe";
import { webhookLogger } from "../../../utils/logger";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * POST /webhooks/stripe
 *
 * Endpoint para recibir webhooks de Stripe.
 *
 * Eventos manejados:
 * - charge.captured: Pago completado (tarjeta y SEPA final)
 * - payment_intent.processing: Pago SEPA en proceso (pendiente de confirmación bancaria)
 * - charge.failed: Pago fallido (especialmente SEPA rechazado)
 *
 * @see https://stripe.com/docs/webhooks
 * @see https://stripe.com/docs/api/events/types
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const signature = req.headers["stripe-signature"] as string;

  if (!signature) {
    webhookLogger.warn(
      { path: "/webhooks/stripe" },
      "Missing stripe-signature header"
    );
    return res.status(400).json({ error: "Missing stripe-signature header" });
  }

  if (!STRIPE_WEBHOOK_SECRET) {
    webhookLogger.error(
      { path: "/webhooks/stripe" },
      "STRIPE_WEBHOOK_SECRET not configured"
    );
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  const stripe = new Stripe(process.env.STRIPE_API_KEY!, {
    apiVersion: "2022-11-15",
  });

  let event: Stripe.Event;

  try {
    // El body viene como Buffer gracias al middleware raw()
    const rawBody = req.body as Buffer;
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    webhookLogger.error(
      { path: "/webhooks/stripe", error: errorMessage },
      "Webhook signature verification failed"
    );
    return res.status(400).json({
      error: `Webhook signature verification failed: ${errorMessage}`,
    });
  }

  const logContext = {
    event_id: event.id,
    event_type: event.type,
    livemode: event.livemode,
  };

  webhookLogger.info(logContext, "Received Stripe webhook event");

  try {
    const paymentWebhookService = req.scope.resolve("paymentWebhookService");

    switch (event.type) {
      case "charge.captured":
      case "charge.succeeded": {
        const charge = event.data.object as Stripe.Charge;
        webhookLogger.info(
          { ...logContext, charge_id: charge.id },
          "Processing charge.succeeded"
        );

        const result = await paymentWebhookService.handleStripeChargeCaptured({
          id: charge.id,
          payment_intent: charge.payment_intent,
          metadata: charge.metadata,
          status: charge.status,
        });

        if (result.success) {
          webhookLogger.info(
            { ...logContext, order_id: result.order_id },
            "charge.captured processed successfully"
          );
        } else {
          webhookLogger.warn(
            { ...logContext, error: result.error },
            "charge.captured processing completed with warning"
          );
        }
        break;
      }

      case "payment_intent.processing": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        webhookLogger.info(
          { ...logContext, payment_intent_id: paymentIntent.id },
          "Processing payment_intent.processing"
        );

        const result = await paymentWebhookService.handleStripeProcessing({
          id: paymentIntent.id,
          metadata: paymentIntent.metadata,
          payment_method_types: paymentIntent.payment_method_types,
          status: paymentIntent.status,
        });

        if (result.success) {
          webhookLogger.info(
            { ...logContext, order_id: result.order_id },
            "payment_intent.processing handled successfully"
          );
        } else {
          webhookLogger.warn(
            { ...logContext, error: result.error },
            "payment_intent.processing completed with warning"
          );
        }
        break;
      }

      case "charge.failed": {
        const charge = event.data.object as Stripe.Charge;
        webhookLogger.warn(
          {
            ...logContext,
            charge_id: charge.id,
            failure_code: charge.failure_code,
            failure_message: charge.failure_message,
          },
          "Processing charge.failed"
        );

        const result = await paymentWebhookService.handleStripeChargeFailed({
          id: charge.id,
          payment_intent: charge.payment_intent,
          metadata: charge.metadata,
          status: charge.status,
          failure_code: charge.failure_code ?? undefined,
          failure_message: charge.failure_message ?? undefined,
        });

        if (result.success) {
          webhookLogger.info(
            { ...logContext, order_id: result.order_id },
            "charge.failed processed successfully"
          );
        } else {
          webhookLogger.warn(
            { ...logContext, error: result.error },
            "charge.failed processing completed with warning"
          );
        }
        break;
      }

      case "payment_intent.succeeded": {
        // Este evento es manejado por el plugin de Stripe por defecto
        // pero lo logueamos para trazabilidad
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        webhookLogger.info(
          {
            ...logContext,
            payment_intent_id: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
          },
          "payment_intent.succeeded received (handled by Stripe plugin)"
        );
        break;
      }

      default:
        webhookLogger.debug({ ...logContext }, "Unhandled Stripe event type");
    }

    // Siempre responder 200 para que Stripe no reintente
    return res.status(200).json({ received: true, event_id: event.id });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    webhookLogger.error(
      { ...logContext, error: errorMessage },
      "Error processing Stripe webhook"
    );

    // Responder 500 para que Stripe reintente
    return res.status(500).json({ error: "Webhook processing failed" });
  }
};

/**
 * OPTIONS /webhooks/stripe
 *
 * Manejo de preflight CORS para el webhook.
 */
export const OPTIONS = async (req: MedusaRequest, res: MedusaResponse) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, stripe-signature",
  });
  return res.status(204).send();
};
