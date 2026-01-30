#!/usr/bin/env node

/**
 * Script de testing para PayPal Checkout.
 *
 * FLUJO DEL SCRIPT:
 * 1. Crea cart y selecciona PayPal
 * 2. PayPal crea una orden (via Medusa)
 * 3. Nuestro script autoriza la orden vía API de PayPal (con capture: false = AUTHORIZE flow)
 * 4. PayPal Sandbox envía webhook PAYMENT.AUTHORIZATION.CREATED via ngrok
 * 5. El plugin recibe el webhook, recupera la autorización, y autoriza la sesión de pago
 * 6. Medusa completa el cart y crea la orden
 * 7. Si el webhook no funciona, caemos a fallback manual
 *
 * FLUJO DE DATOS CRÍTICO:
 * - authorizeOrder() retorna: { purchase_units[0].payments.authorizations[0].id }
 * - Este ID se envía a PayPal Sandbox
 * - PayPal envía webhook con event_type="PAYMENT.AUTHORIZATION.CREATED"
 * - El resource.id en el webhook debe coincidir con el Authorization ID
 * - El plugin usa este ID para llamar GET /v2/payments/authorizations/{id}
 *
 * REQUISITOS:
 * - ngrok configurado para recibir webhooks reales de PayPal Sandbox
 * - PAYPAL_AUTH_WEBHOOK_ID configurado en el entorno
 * - medusa-config.js con capture: false para flow AUTHORIZE
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
import { authorizeOrder } from "../utils/paypal-api.mjs";

const WEBHOOK_WAIT_MS = 10000; // Esperar más tiempo para webhooks reales

async function main() {
  console.log(
    "\n▶ Iniciando test PayPal Checkout (con webhooks reales via ngrok)",
  );
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

  // Actualizar cart con envío
  const updatedCart = await medusa.carts.retrieve(cart.id);
  console.log(
    `✓ Total del carrito con envío: ${
      updatedCart.cart.total / 100
    } ${updatedCart.cart.region.currency_code.toUpperCase()}`,
  );

  await createPaymentSessions(medusa, cart.id);
  const cartWithSessions = await setPaymentSession(medusa, cart.id, "paypal");

  // Obtener la sesión de PayPal
  const paypalSession = cartWithSessions.payment_sessions?.find(
    (s) => s.provider_id === "paypal",
  );

  if (!paypalSession?.data?.id) {
    throw new Error("No se encontró el ID de orden en la sesión de PayPal");
  }

  const paypalOrderId = paypalSession.data.id;
  console.log(`✓ Usando PayPal Order creada por Medusa: ${paypalOrderId}`);

  // Autorizar el pago vía API de PayPal
  console.log("\n▶ Autorizando pago PayPal vía API...");
  const authResponse = await authorizeOrder(paypalOrderId);

  // Extraer el Authorization ID de la respuesta
  const authorizationId =
    authResponse.purchase_units?.[0]?.payments?.authorizations?.[0]?.id;

  if (!authorizationId) {
    throw new Error(
      "No se pudo extraer el ID de autorización de la respuesta de PayPal",
    );
  }

  console.log(`✓ Orden autorizada con ID: ${authorizationId}`);

  // El plugin espera que el Authorization ID esté disponible cuando llegue el webhook
  // El webhook enviará este mismo ID, y el plugin lo usará para recuperar la autorización
  console.log(
    `✓ Esperando webhook de PayPal Sandbox que confirme la autorización...`,
  );

  console.log(
    `\n⏳ Esperando ${WEBHOOK_WAIT_MS}ms para que PayPal envíe el webhook via ngrok...`,
  );
  await sleep(WEBHOOK_WAIT_MS);

  // Verificar estado del cart
  console.log("\n▶ Verificando estado final...");
  let finalCart = await medusa.carts.retrieve(cart.id);
  logCart(finalCart.cart);

  // Verificar si el webhook procesó correctamente la autorización
  if (finalCart.cart?.completed_at) {
    console.log(
      "\n✅ ÉXITO - El webhook de PayPal procesó la autorización correctamente",
    );
    const order = await getOrder(medusa, finalCart.cart.order_id);
    console.log(
      `\n✅ ÉXITO - Orden PayPal creada automáticamente via webhook:`,
    );
    console.log(`  - ID: ${order.id}`);
    console.log(`  - Display ID: #${order.display_id}`);
    console.log(`  - Status: ${order.status}`);
    console.log(`  - Payment Status: ${order.payment_status}`);
    console.log(
      `  - Total: ${order.total / 100} ${order.currency_code.toUpperCase()}`,
    );
    console.log(
      `\n💡 El plugin recibió el webhook, recuperó la autorización, y completó la orden.`,
    );
    return;
  }

  // Si el webhook NO procesó, mostrar diagnóstico
  console.warn(
    "\n⚠️  El webhook de PayPal NO completó el cart automáticamente.",
  );
  console.warn(`\n📋 DIAGNÓSTICO:`);
  console.warn(`  - Authorization ID esperado: ${authorizationId}`);
  console.warn(`  - PayPal Order ID: ${paypalOrderId}`);
  console.warn(`  - Medusa Cart ID: ${cart.id}`);
  console.warn(`\n🔍 El plugin intentó recuperar la autorización vía:`);
  console.warn(`  GET /v2/payments/authorizations/${authorizationId}`);
  console.warn(
    `\n💡 Si recibiste 404, significa que PayPal Sandbox no encontró esa autorización.`,
  );
  console.warn(`   Esto puede ocurrir si:`);
  console.warn(`   1. El webhook no llegó correctamente`);
  console.warn(`   2. El Authorization ID en el webhook no coincide`);
  console.warn(
    `   3. Hay un problema con la configuración de webhooks de PayPal`,
  );
  console.warn("\n📌 Completando cart manualmente como fallback...\n");
  try {
    const orderResponse = await medusa.carts.complete(cart.id);
    if (orderResponse.type === "order") {
      const order = orderResponse.data;
      console.log("\n✅ Orden creada manualmente:");
      console.log(`  - ID: ${order.id}`);
      console.log(`  - Display ID: #${order.display_id}`);
      console.log(`  - Status: ${order.status}`);
      console.log(`  - Payment Status: ${order.payment_status}`);
      console.log(
        `  - Total: ${order.total / 100} ${order.currency_code.toUpperCase()}`,
      );
      return;
    }
  } catch (error) {
    console.error("Error al completar cart:", error.message);
  }
}

main().catch((error) => {
  console.error("\n❌ ERROR en test PayPal:", error.message);
  process.exit(1);
});
