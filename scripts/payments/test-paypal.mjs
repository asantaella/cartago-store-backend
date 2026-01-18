#!/usr/bin/env node

/**
 * Script de testing para PayPal Checkout con backend cart completion.
 *
 * FLUJO DE ESTE SCRIPT (Testing):
 * 1. Crea cart y selecciona PayPal
 * 2. Captura el pago vía API de PayPal
 * 3. Simula el webhook CHECKOUT.ORDER.COMPLETED
 * 4. Verifica que el backend creó la orden
 *
 * FLUJO REAL EN PRODUCCIÓN:
 * 1. Frontend crea cart y selecciona PayPal
 * 2. Usuario aprueba el pago en PayPal → Webhook CHECKOUT.ORDER.APPROVED
 * 3. Frontend captura el pago: actions.order.capture()
 * 4. PayPal envía webhook CHECKOUT.ORDER.COMPLETED automáticamente
 * 5. Backend completa el cart al recibir el webhook
 * 6. Frontend hace polling y encuentra la orden
 *
 * NOTA: Este script simula el webhook manualmente porque no estamos
 * pasando por el flujo de aprobación del usuario real de PayPal.
 */

import {
  createMedusaClient,
  createCart,
  updateCart,
  listShippingOptions,
  addShippingMethod,
  createPaymentSessions,
  setPaymentSession,
  loadCartMock,
  logCart,
  getOrder,
  sleep,
  MEDUSA_BACKEND_URL,
} from "../utils/medusa-api.mjs";
import { captureOrder, simulateWebhook } from "../utils/paypal-api.mjs";

const WEBHOOK_WAIT_MS = 5000;

async function main() {
  console.log("\n▶ Iniciando test PayPal Checkout");
  const medusa = createMedusaClient();
  const cartMock = await loadCartMock();

  const cart = await createCart(medusa, cartMock);
  await updateCart(medusa, cart.id, cartMock);

  const shippingOptions = await listShippingOptions(medusa, cart.id);
  if (shippingOptions.length) {
    const shippingOption = shippingOptions.find((option) =>
      option.name.toLowerCase().includes("estándar"),
    );
    if (shippingOption) {
      await addShippingMethod(medusa, cart.id, shippingOption.id);
    }
  }

  await createPaymentSessions(medusa, cart.id);
  await setPaymentSession(medusa, cart.id, "paypal");

  const { cart: cartWithSession } = await medusa.carts.retrieve(cart.id);
  logCart(cartWithSession);

  const paypalSession = cartWithSession.payment_session;
  if (!paypalSession || paypalSession.provider_id !== "paypal") {
    throw new Error("No se encontró la sesión de pago de PayPal seleccionada");
  }

  const sessionData = paypalSession.data;
  const paypalOrderId = sessionData?.id;
  if (!paypalOrderId) {
    throw new Error("La sesión de PayPal no tiene un ID de orden");
  }

  console.log("Capturando pago PayPal vía API...");
  const capturedOrder = await captureOrder(paypalOrderId);

  if (capturedOrder.id !== paypalOrderId) {
    throw new Error(
      `PayPal devolvió una orden distinta a la de la sesión: esperado ${paypalOrderId}, recibido ${capturedOrder.id}`,
    );
  }

  console.log("✓ Orden PayPal capturada");
  console.log(
    "  NOTA: En el frontend real, la captura se hace con actions.order.capture()",
  );
  console.log(
    "        y PayPal envía automáticamente el webhook CHECKOUT.ORDER.COMPLETED",
  );

  // Extraer purchase_units con datos de captura
  const purchaseUnits =
    capturedOrder.purchase_units?.map((unit) => ({
      custom_id: unit.custom_id || cart.id,
      reference_id: unit.reference_id || cart.id,
      amount: unit.amount,
      payments: unit.payments,
    })) ||
    sessionData.purchase_units?.map((unit) => ({
      custom_id: unit.custom_id || cart.id,
      reference_id: unit.reference_id || cart.id,
      amount: unit.amount,
      payments: unit.payments,
    }));

  if (!purchaseUnits?.length) {
    throw new Error("No se pudieron obtener los purchase_units de PayPal");
  }

  // Simular webhook CHECKOUT.ORDER.COMPLETED
  // En producción, PayPal envía este webhook automáticamente tras capturar el pago
  const webhookBase = MEDUSA_BACKEND_URL.replace(/\/$/, "");
  const webhookUrl = `${webhookBase}/webhooks/paypal`;
  const completedOrder = {
    id: capturedOrder.id,
    status: capturedOrder.status,
    resource_id: cart.id, // Campo usado por el plugin de MedusaJS
    purchase_units: purchaseUnits,
  };

  console.log("\nSimulando webhook CHECKOUT.ORDER.COMPLETED...");
  console.log("  URL:", webhookUrl);
  console.log("  PayPal Order ID:", completedOrder.id);
  console.log("  Cart ID:", cart.id);
  await simulateWebhook("CHECKOUT.ORDER.COMPLETED", completedOrder, webhookUrl);

  console.log(
    `Esperando ${WEBHOOK_WAIT_MS}ms para que el webhook se procese en el backend...`,
  );
  await sleep(WEBHOOK_WAIT_MS);

  // Verificar que el cart fue completado por el webhook
  const finalCart = await medusa.carts.retrieve(cart.id);
  logCart(finalCart.cart);

  if (!finalCart.cart?.completed_at) {
    console.error("❌ El cart NO fue completado por el webhook");
    throw new Error("Cart not completed after webhook");
  }

  if (finalCart.cart?.order_id) {
    const order = await getOrder(medusa, finalCart.cart.order_id);
    console.log("\n✓ Orden PayPal resultante:");
    console.log(`  - ID: ${order.id}`);
    console.log(`  - Display ID: #${order.display_id}`);
    console.log(`  - Status: ${order.status}`);
    console.log(`  - Payment Status: ${order.payment_status}`);
    console.log(
      `  - Total: ${order.total / 100} ${order.currency_code.toUpperCase()}`,
    );
    console.log(
      "\n✅ TEST EXITOSO: El backend completó el cart tras el webhook",
    );
  } else {
    console.error("❌ El cart fue completado pero NO tiene order_id");
    throw new Error("Cart completed but no order created");
  }
}

main().catch((error) => {
  console.error("ERROR en test PayPal:", error);
  process.exit(1);
});
