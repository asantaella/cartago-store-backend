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

const cardExpiry = process.env.PAYPAL_BUYER_CARD_EXPIRY || "12/2030";
const expiryParts = cardExpiry.split("/");
const expiryMonth = (expiryParts[0] || "12").trim().padStart(2, "0");
const expiryYear = (expiryParts[1] || "2030").trim();

const defaultCard = {
  number: process.env.PAYPAL_BUYER_CARD_NUMBER || "4111111111111111",
  security_code: process.env.PAYPAL_BUYER_CARD_SECURITY_CODE || "123",
  name: process.env.PAYPAL_BUYER_NAME || "Sandbox Buyer",
  expiry: `${expiryYear}-${expiryMonth}`,
  billing_address: {
    address_line_1:
      process.env.PAYPAL_BUYER_ADDRESS_LINE_1 || "Av. Julio Cesar 12",
    admin_area_2: process.env.PAYPAL_BUYER_CITY || "Madrid",
    admin_area_1: process.env.PAYPAL_BUYER_REGION || "Madrid",
    postal_code: process.env.PAYPAL_BUYER_POSTAL_CODE || "28013",
    country_code: process.env.PAYPAL_BUYER_COUNTRY || "ES",
  },
};

if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
  throw new Error("Faltan credenciales de PayPal en el entorno");
}

const PAYPAL_API_BASE = PAYPAL_SANDBOX
  ? "https://api-m.sandbox.paypal.com"
  : "https://api-m.paypal.com";

async function getAccessToken() {
  const auth = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`,
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
        "PayPal-Request-Id": `capture-${orderId}-${Date.now()}`,
      },
      body: JSON.stringify({
        payment_source: {
          card: defaultCard,
        },
      }),
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Error al capturar orden PayPal: ${JSON.stringify(error)}`);
  }

  const capture = await response.json();
  console.log(`✓ Orden PayPal capturada: ${orderId}`);
  return capture;
}

export async function getOrder(orderId) {
  const accessToken = await getAccessToken();
  const response = await fetch(
    `${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Error al recuperar orden PayPal: ${JSON.stringify(error)}`,
    );
  }

  return response.json();
}

export async function authorizeOrder(orderId) {
  const accessToken = await getAccessToken();
  const response = await fetch(
    `${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/authorize`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payment_source: {
          card: defaultCard,
        },
      }),
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Error al autorizar orden PayPal: ${JSON.stringify(error)}`,
    );
  }

  return response.json();
}

export async function simulateWebhook(eventType, resource, webhookUrl) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "paypal-transmission-id": `test-${Date.now()}`,
      "paypal-transmission-time": new Date().toISOString(),
      "paypal-cert-url": `${PAYPAL_API_BASE}/cert`,
      "paypal-transmission-sig": "simulated",
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-test-skip-verification": "true",
    },
    body: JSON.stringify({
      id: `WH-${Date.now()}`,
      event_type: eventType,
      resource_type: "checkout-order",
      resource,
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(
      `Simulación de webhook PayPal falló: ${response.status} ${payload}`,
    );
  }

  return response;
}
