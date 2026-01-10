import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { webhookLogger } from "../../../utils/logger";

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_AUTH_WEBHOOK_ID = process.env.PAYPAL_AUTH_WEBHOOK_ID;
const PAYPAL_SANDBOX = process.env.PAYPAL_SANDBOX === "true";
const PAYPAL_SKIP_WEBHOOK_VERIFICATION =
  process.env.PAYPAL_SKIP_WEBHOOK_VERIFICATION === "true";

const PAYPAL_API_BASE = PAYPAL_SANDBOX
  ? "https://api-m.sandbox.paypal.com"
  : "https://api-m.paypal.com";

interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  resource_type: string;
  resource: {
    id: string;
    status: string;
    purchase_units?: Array<{
      custom_id?: string;
      reference_id?: string;
      payments?: {
        captures?: Array<{
          id: string;
          status: string;
        }>;
      };
    }>;
  };
  create_time: string;
  links: Array<{ href: string; rel: string; method: string }>;
}

interface PayPalVerifyResponse {
  verification_status: "SUCCESS" | "FAILURE";
}

/**
 * Obtiene un access token de PayPal usando client credentials.
 */
async function getPayPalAccessToken(): Promise<string> {
  const auth = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(`Failed to get PayPal access token: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Verifica la firma del webhook de PayPal.
 *
 * @see https://developer.paypal.com/docs/api/webhooks/v1/#verify-webhook-signature
 */
async function verifyPayPalWebhook(
  req: MedusaRequest,
  rawBody: string
): Promise<boolean> {
  if (!PAYPAL_AUTH_WEBHOOK_ID) {
    webhookLogger.warn(
      { path: "/webhooks/paypal" },
      "PAYPAL_AUTH_WEBHOOK_ID not configured, skipping verification"
    );
    return true; // En desarrollo sin webhook_id configurado
  }

  try {
    const skipSignal =
      PAYPAL_SKIP_WEBHOOK_VERIFICATION ||
      (req.headers["paypal-test-skip-verification"] as string) === "true";

    if (skipSignal) {
      webhookLogger.info(
        { path: "/webhooks/paypal", skip_verification: "test-override" },
        "Skipping PayPal webhook verification"
      );
      return true;
    }

    const accessToken = await getPayPalAccessToken();

    const transmissionId = req.headers["paypal-transmission-id"] as string;
    const transmissionTime = req.headers["paypal-transmission-time"] as string;
    const certUrl = req.headers["paypal-cert-url"] as string;
    const transmissionSig = req.headers["paypal-transmission-sig"] as string;
    const authAlgo = req.headers["paypal-auth-algo"] as string;

    if (
      !transmissionId ||
      !transmissionTime ||
      !certUrl ||
      !transmissionSig ||
      !authAlgo
    ) {
      webhookLogger.warn(
        {
          path: "/webhooks/paypal",
          headers: {
            transmissionId: !!transmissionId,
            transmissionTime: !!transmissionTime,
            certUrl: !!certUrl,
            transmissionSig: !!transmissionSig,
            authAlgo: !!authAlgo,
          },
        },
        "Missing PayPal webhook headers"
      );
      return false;
    }

    const verifyPayload = {
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: PAYPAL_AUTH_WEBHOOK_ID,
      webhook_event: JSON.parse(rawBody),
    };

    const response = await fetch(
      `${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(verifyPayload),
      }
    );

    if (!response.ok) {
      webhookLogger.error(
        {
          path: "/webhooks/paypal",
          status: response.status,
        },
        "PayPal webhook verification request failed"
      );
      return false;
    }

    const result: PayPalVerifyResponse = await response.json();
    return result.verification_status === "SUCCESS";
  } catch (error) {
    webhookLogger.error(
      {
        path: "/webhooks/paypal",
        error: error instanceof Error ? error.message : String(error),
      },
      "PayPal webhook verification error"
    );
    return false;
  }
}

/**
 * POST /webhooks/paypal
 *
 * Endpoint para recibir webhooks de PayPal.
 *
 * Eventos manejados:
 * - CHECKOUT.ORDER.COMPLETED: Orden de PayPal completada y pagada
 *
 * @see https://developer.paypal.com/docs/api/webhooks/v1/
 * @see https://developer.paypal.com/docs/api-basics/notifications/webhooks/event-names/
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    webhookLogger.error(
      { path: "/webhooks/paypal" },
      "PayPal credentials not configured"
    );
    return res.status(500).json({ error: "PayPal not configured" });
  }

  // El body viene como Buffer gracias al middleware raw()
  const rawBody = (req.body as Buffer).toString("utf8");

  // Verificar firma del webhook
  const isValid = await verifyPayPalWebhook(req, rawBody);

  if (!isValid) {
    webhookLogger.warn(
      { path: "/webhooks/paypal" },
      "PayPal webhook signature verification failed"
    );
    return res
      .status(401)
      .json({ error: "Webhook signature verification failed" });
  }

  let event: PayPalWebhookEvent;

  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    webhookLogger.error(
      { path: "/webhooks/paypal" },
      "Invalid JSON in PayPal webhook body"
    );
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const logContext = {
    event_id: event.id,
    event_type: event.event_type,
    resource_type: event.resource_type,
    resource_id: event.resource?.id,
  };

  webhookLogger.info(logContext, "Received PayPal webhook event");

  try {
    const paymentWebhookService = req.scope.resolve("paymentWebhookService");

    switch (event.event_type) {
      case "CHECKOUT.ORDER.COMPLETED": {
        webhookLogger.info(
          { ...logContext, paypal_order_id: event.resource.id },
          "Processing CHECKOUT.ORDER.COMPLETED"
        );

        const result = await paymentWebhookService.handlePayPalCompleted({
          id: event.resource.id,
          status: event.resource.status,
          purchase_units: event.resource.purchase_units || [],
        });

        if (result.success) {
          webhookLogger.info(
            { ...logContext, order_id: result.order_id },
            "CHECKOUT.ORDER.COMPLETED processed successfully"
          );
        } else {
          webhookLogger.warn(
            { ...logContext, error: result.error },
            "CHECKOUT.ORDER.COMPLETED processing completed with warning"
          );
        }
        break;
      }

      case "PAYMENT.CAPTURE.COMPLETED": {
        // Este evento es complementario y puede usarse como backup
        webhookLogger.info(
          {
            ...logContext,
            capture_id: event.resource.id,
          },
          "PAYMENT.CAPTURE.COMPLETED received (handled by PayPal plugin)"
        );
        break;
      }

      case "PAYMENT.CAPTURE.DENIED": {
        webhookLogger.warn(
          {
            ...logContext,
            capture_id: event.resource.id,
          },
          "PAYMENT.CAPTURE.DENIED received"
        );
        // TODO: Implementar manejo de pago denegado similar a charge.failed de Stripe
        break;
      }

      default:
        webhookLogger.debug({ ...logContext }, "Unhandled PayPal event type");
    }

    // Siempre responder 200 para que PayPal no reintente
    return res.status(200).json({ received: true, event_id: event.id });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    webhookLogger.error(
      { ...logContext, error: errorMessage },
      "Error processing PayPal webhook"
    );

    // Responder 500 para que PayPal reintente
    return res.status(500).json({ error: "Webhook processing failed" });
  }
};

/**
 * OPTIONS /webhooks/paypal
 *
 * Manejo de preflight CORS para el webhook.
 */
export const OPTIONS = async (req: MedusaRequest, res: MedusaResponse) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, paypal-transmission-id, paypal-transmission-time, paypal-cert-url, paypal-transmission-sig, paypal-auth-algo",
  });
  return res.status(204).send();
};
