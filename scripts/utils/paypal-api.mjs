/**
 * Helpers para interactuar con la API de PayPal desde scripts de testing.
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "../../.env") });

const PAYPAL_SANDBOX = process.env.PAYPAL_SANDBOX === "true";
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
  throw new Error("Faltan credenciales de PayPal en el entorno");
}

const PAYPAL_API_BASE = PAYPAL_SANDBOX
  ? "https://api-m.sandbox.paypal.com"
  : "https://api-m.paypal.com";

async function getAccessToken() {
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
    throw new Error(`No se pudo obtener access token: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

export async function createOrder(cartId, amount, currency) {
  const accessToken = await getAccessToken();
  const body = {
    intent: "CAPTURE",
    purchase_units: [
      {
        custom_id: cartId,
        reference_id: cartId,
        amount: {
          currency_code: currency.toUpperCase(),
          value: (amount / 100).toFixed(2),
        },
      },
    ],
    application_context: {
      brand_name: "Cartago4x4",
      user_action: "PAY_NOW",
      return_url: "http://localhost:9000/store/orders/confirm",
      cancel_url: "http://localhost:9000/store/cart",
    },
  };

  const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error al crear orden PayPal: ${JSON.stringify(error)}`);
  }

  const order = await response.json();
  console.log(`✓ Orden PayPal creada: ${order.id}`);
  return order;
}

export async function captureOrder(orderId) {
  const accessToken = await getAccessToken();
  const response = await fetch(
    `${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error al capturar orden PayPal: ${JSON.stringify(error)}`);
  }

  const capture = await response.json();
  console.log(`✓ Orden PayPal capturada: ${orderId}`);
  return capture;
}

export async function simulateWebhook(eventType, orderId, webhookUrl) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "paypal-transmission-id": `test-${Date.now()}`,
      "paypal-transmission-time": new Date().toISOString(),
      "paypal-cert-url": `${PAYPAL_API_BASE}/cert`,
      "paypal-transmission-sig": "simulated",
      "paypal-auth-algo": "SHA256withRSA",
    },
    body: JSON.stringify({
      id: `WH-${Date.now()}`,
      event_type: eventType,
      resource: { id: orderId },
    }),
  });

  return response;
}
