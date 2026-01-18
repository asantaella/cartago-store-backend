#!/usr/bin/env node

/**
 * Script para simular el webhook PAYMENT.CAPTURE.COMPLETED de PayPal
 *
 * Uso:
 *   node scripts/simulate-paypal-capture-completed.mjs <paypal_order_id>
 *
 * Ejemplo:
 *   node scripts/simulate-paypal-capture-completed.mjs 41F447870W9829456
 */

const WEBHOOK_URL =
  process.env.WEBHOOK_URL || "http://localhost:9000/webhooks/paypal";

async function simulatePayPalCaptureCompleted(paypalOrderId, captureId) {
  const payload = {
    id: `WH-SIMULATED-${Date.now()}`,
    event_version: "1.0",
    create_time: new Date().toISOString(),
    resource_type: "capture",
    resource_version: "2.0",
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    summary: "Payment completed for EUR 16.99 EUR",
    resource: {
      id:
        captureId || `${Math.random().toString(36).substring(7).toUpperCase()}`,
      status: "COMPLETED",
      status_details: {},
      amount: {
        currency_code: "EUR",
        value: "16.99",
      },
      final_capture: true,
      seller_protection: {
        status: "ELIGIBLE",
        dispute_categories: ["ITEM_NOT_RECEIVED", "UNAUTHORIZED_TRANSACTION"],
      },
      supplementary_data: {
        related_ids: {
          order_id: paypalOrderId,
        },
      },
      create_time: new Date().toISOString(),
      update_time: new Date().toISOString(),
      links: [
        {
          href: `https://api.sandbox.paypal.com/v2/payments/captures/${captureId}`,
          rel: "self",
          method: "GET",
        },
        {
          href: `https://api.sandbox.paypal.com/v2/payments/captures/${captureId}/refund`,
          rel: "refund",
          method: "POST",
        },
        {
          href: `https://api.sandbox.paypal.com/v2/checkout/orders/${paypalOrderId}`,
          rel: "up",
          method: "GET",
        },
      ],
    },
    links: [
      {
        href: `https://api.sandbox.paypal.com/v1/notifications/webhooks-events/WH-SIMULATED-${Date.now()}`,
        rel: "self",
        method: "GET",
      },
      {
        href: "https://api.sandbox.paypal.com/v1/notifications/webhooks-events/WH-SIMULATED/resend",
        rel: "resend",
        method: "POST",
      },
    ],
  };

  console.log("\n🔧 Simulando webhook PAYMENT.CAPTURE.COMPLETED");
  console.log("PayPal Order ID:", paypalOrderId);
  console.log("Capture ID:", payload.resource.id);
  console.log("Webhook URL:", WEBHOOK_URL);
  console.log("\n📤 Enviando webhook...\n");

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "PayPal/SIMULATED",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    if (response.ok) {
      console.log("✅ Webhook enviado exitosamente");
      console.log("Status:", response.status);
      console.log("Response:", responseText);

      console.log("\n💡 Verifica los logs del backend para confirmar:");
      console.log("   - 'Processing PayPal CAPTURE.COMPLETED'");
      console.log("   - 'PAYMENT_CAPTURED event emitted'");
      console.log("   - 'Order will transition from awaiting to captured'");
    } else {
      console.error("❌ Error al enviar webhook");
      console.error("Status:", response.status);
      console.error("Response:", responseText);
    }
  } catch (error) {
    console.error("\n❌ Error:", error.message);
  }
}

// Main
const paypalOrderId = process.argv[2];
const captureId = process.argv[3];

if (!paypalOrderId) {
  console.error("❌ Error: PayPal Order ID requerido");
  console.log("\nUso:");
  console.log(
    "  node scripts/simulate-paypal-capture-completed.mjs <paypal_order_id> [capture_id]",
  );
  console.log("\nEjemplo:");
  console.log(
    "  node scripts/simulate-paypal-capture-completed.mjs 41F447870W9829456",
  );
  console.log(
    "  node scripts/simulate-paypal-capture-completed.mjs 41F447870W9829456 40429357W8442562X",
  );
  process.exit(1);
}

simulatePayPalCaptureCompleted(paypalOrderId, captureId);
