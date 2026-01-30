#!/usr/bin/env node

/**
 * Script de testing para PayPal Checkout con CAPTURE flow.
 * 
 * Este script prueba el flujo CAPTURE (capture: true) en lugar de AUTHORIZE
 * para determinar si el problema es específico del flujo AUTHORIZE.
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
} from "../utils/medusa-api.mjs";
import { captureOrder } from "../utils/paypal-api.mjs";

const WEBHOOK_WAIT_MS = 10000;

async function main() {
  console.log(
    "\n▶ Iniciando test PayPal Checkout con CAPTURE flow (capture: true)",
  );
  console.log("=".repeat(70));

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

  const updatedCart = await medusa.carts.retrieve(cart.id);
  console.log(
    `✓ Total: ${updatedCart.cart.total / 100} ${updatedCart.cart.region.currency_code.toUpperCase()}`
  );

  await createPaymentSessions(medusa, cart.id);
  const cartWithSessions = await setPaymentSession(medusa, cart.id, "paypal");

  const paypalSession = cartWithSessions.payment_sessions?.find(
    (s) => s.provider_id === "paypal",
  );

  if (!paypalSession?.data?.id) {
    throw new Error("No se encontró el ID de orden en la sesión de PayPal");
  }

  const paypalOrderId = paypalSession.data.id;
  console.log(`✓ PayPal Order ID: ${paypalOrderId}`);
  console.log(`✓ Medusa Cart ID: ${cart.id}`);
  console.log(`✓ Medusa Payment Session: ${paypalSession.id}`);

  // DIFERENCIA: Usar captureOrder en lugar de authorizeOrder
  console.log("\n▶ CAPTURANDO pago PayPal vía API (CAPTURE flow)...");
  const captureResponse = await captureOrder(paypalOrderId);

  const captureId = captureResponse.purchase_units?.[0]?.payments
    ?.captures?.[0]?.id;

  if (!captureId) {
    throw new Error(
      "No se pudo extraer el ID de captura de la respuesta de PayPal"
    );
  }

  console.log(`✓ Orden capturada con Capture ID: ${captureId}`);
  console.log(`\n⏳ Esperando ${WEBHOOK_WAIT_MS}ms para webhook de captura...`);
  await sleep(WEBHOOK_WAIT_MS);

  // Verificar estado del cart
  console.log("\n▶ Verificando estado final...");
  const finalCart = await medusa.carts.retrieve(cart.id);
  logCart(finalCart.cart);

  if (finalCart.cart?.completed_at) {
    console.log("\n✅ ÉXITO - El webhook de CAPTURE completó el cart");
    console.log("El flujo CAPTURE funciona correctamente.");
    const order = await getOrder(medusa, finalCart.cart.order_id);
    console.log(`Orden creada: #${order.display_id}`);
  } else {
    console.log("\n❌ FALLO - El webhook de CAPTURE NO completó el cart");
    console.log("El problema puede estar en:");
    console.log("  1. El flujo CAPTURE también tiene el mismo problema");
    console.log("  2. El webhook de PAYMENT.CAPTURE.COMPLETED no está siendo enviado");
    console.log("  3. Hay un problema general con el setup de webhooks");
  }
}

main().catch((error) => {
  console.error("\n❌ ERROR:", error.message);
  process.exit(1);
});
