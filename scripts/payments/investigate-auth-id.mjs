#!/usr/bin/env node

/**
 * Script para investigar la discrepancia entre:
 * - El Authorization ID que retorna authorizeOrder()
 * - El Authorization ID que PayPal envía en el webhook
 *
 * HIPÓTESIS:
 * El problema es que en v1.20.11 del plugin, la estructura del webhook
 * o la forma en que el plugin procesa el Authorization ID es diferente.
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
  sleep,
} from "../utils/medusa-api.mjs";
import { authorizeOrder, getOrder } from "../utils/paypal-api.mjs";
import fetch from "node-fetch";

const WEBHOOK_WAIT_MS = 5000;

async function main() {
  console.log("\n🔬 INVESTIGANDO DISCREPANCIA DE AUTHORIZATION ID");
  console.log("=".repeat(70));

  const medusa = createMedusaClient();
  const cartMock = await loadCartMock();

  // Setup del cart
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
  const cartWithSessions = await setPaymentSession(medusa, cart.id, "paypal");

  const paypalSession = cartWithSessions.payment_sessions?.find(
    (s) => s.provider_id === "paypal",
  );

  const paypalOrderId = paypalSession.data.id;
  console.log(`\nPayPal Order ID: ${paypalOrderId}`);
  console.log(`Medusa Cart ID: ${cart.id}`);

  // Autorizar
  console.log("\n▶ Autorizando orden...");
  const authResponse = await authorizeOrder(paypalOrderId);

  const authIdFromAPI =
    authResponse.purchase_units?.[0]?.payments?.authorizations?.[0]?.id;

  console.log(`\n✓ Authorization ID del API: ${authIdFromAPI}`);

  // Obtener la orden para ver el estado después de authorize
  console.log("\n▶ Recuperando orden después de authorize...");
  const orderAfterAuth = await getOrder(paypalOrderId);

  const authIdFromOrder =
    orderAfterAuth.purchase_units?.[0]?.payments?.authorizations?.[0]?.id;

  console.log(`✓ Authorization ID en orden: ${authIdFromOrder}`);
  console.log(
    `✓ ¿IDs coinciden? ${authIdFromAPI === authIdFromOrder ? "SÍ" : "NO"}`,
  );

  // Comparar estructuras
  console.log("\n📋 ESTRUCTURA DEL WEBHOOK ESPERADO:");
  console.log(
    "Según la guía de PayPal, el webhook PAYMENT.AUTHORIZATION.CREATED debe contener:",
  );
  console.log(`  event_type: PAYMENT.AUTHORIZATION.CREATED`);
  console.log(`  resource.id: ${authIdFromAPI} (el Authorization ID)`);
  console.log(`  resource.status: CREATED`);
  console.log(`  resource.links: [{rel: "up", href: "..."}, ...]`);

  console.log("\n▶ Esperando webhook para comparar estructura...");
  console.log("⏳ Aguarda 5s...");

  await sleep(WEBHOOK_WAIT_MS);

  // Verificar estado del cart
  const finalCart = await medusa.carts.retrieve(cart.id);

  console.log("\n📋 RESULTADO:");
  if (finalCart.cart?.completed_at) {
    console.log("✅ Cart completado - webhook procesado exitosamente");
  } else {
    console.log("❌ Cart NO completado - webhook no procesó");
    console.log("\n💡 POSIBLES CAUSAS:");
    console.log("  1. El webhook nunca llegó a Medusa");
    console.log("  2. El webhook llegó pero el plugin no lo procesó");
    console.log(
      "  3. El plugin recibió 404 al intentar recuperar la autorización",
    );
    console.log(
      "  4. El Authorization ID en el webhook NO es el que retornó authorize()",
    );
  }

  console.log("\n📌 RECOMENDACIÓN:");
  console.log("Ejecuta el servidor debug webhook:");
  console.log("  node scripts/payments/paypal-webhook-server.mjs");
  console.log(
    "Luego configura ngrok para apuntar a ese servidor y observa exactamente",
  );
  console.log("qué Authorization ID está enviando PayPal en el webhook.");
}

main().catch((error) => {
  console.error("\n❌ ERROR:", error.message);
  process.exit(1);
});
