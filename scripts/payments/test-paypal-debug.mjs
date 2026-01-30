#!/usr/bin/env node

/**
 * Script de DEBUG para PayPal Checkout.
 * 
 * Este script investiga exactamente qué está sucediendo en el flujo de webhooks.
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
import { authorizeOrder, getOrder as getPayPalOrder } from "../utils/paypal-api.mjs";

const WEBHOOK_WAIT_MS = 15000; // Esperar más para ver logs

async function main() {
  console.log("\n🔍 INICIANDO DEBUG DE PAYPAL AUTHORIZE FLOW");
  console.log("=".repeat(60));

  const medusa = createMedusaClient();
  const cartMock = await loadCartMock();

  // 1. Crear cart
  const cart = await createCart(medusa, cartMock);
  console.log(`\n✓ Cart creado: ${cart.id}`);

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

  // 2. Crear sesiones de pago
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
  console.log(`✓ Medusa Payment Session ID: ${paypalSession.id}`);

  // 3. Autorizar y capturar todos los datos
  console.log("\n" + "=".repeat(60));
  console.log("▶ AUTORIZANDO ORDEN EN PAYPAL");
  console.log("=".repeat(60));

  const authResponse = await authorizeOrder(paypalOrderId);
  console.log("\n📋 Respuesta completa de authorizeOrder():");
  console.log(JSON.stringify(authResponse, null, 2));

  // Extraer todos los IDs posibles
  const purchaseUnit = authResponse.purchase_units?.[0];
  const authorizationData = purchaseUnit?.payments?.authorizations?.[0];
  const authorizationId = authorizationData?.id;

  console.log("\n🎯 IDs CRÍTICOS:");
  console.log(`  - Authorization ID del respuesta: ${authorizationId}`);
  console.log(`  - PayPal Order ID: ${paypalOrderId}`);
  console.log(`  - Medusa Cart ID: ${cart.id}`);
  console.log(`  - Medusa Payment Session: ${paypalSession.id}`);

  if (authorizationData?.status) {
    console.log(`  - Authorization Status: ${authorizationData.status}`);
  }
  if (authorizationData?.links) {
    console.log(`  - Authorization Links:`);
    authorizationData.links.forEach((link) => {
      console.log(`    * ${link.rel}: ${link.href}`);
    });
  }

  // 4. Verificar que podemos recuperar la autorización
  console.log("\n" + "=".repeat(60));
  console.log("▶ VERIFICANDO QUE LA AUTORIZACIÓN EXISTE EN PAYPAL");
  console.log("=".repeat(60));

  try {
    const currentOrder = await getPayPalOrder(paypalOrderId);
    console.log("\n✓ Orden PayPal recuperada. Estructura actual:");
    console.log(`  Status: ${currentOrder.status}`);
    console.log(`  Purchase Units: ${currentOrder.purchase_units?.length}`);
    const currentAuth = currentOrder.purchase_units?.[0]?.payments?.authorizations?.[0];
    if (currentAuth) {
      console.log(`  Authorization ID: ${currentAuth.id}`);
      console.log(`  Authorization Status: ${currentAuth.status}`);
    }
  } catch (error) {
    console.error("✗ Error recuperando orden:", error.message);
  }

  // 5. Esperar webhook
  console.log("\n" + "=".repeat(60));
  console.log("▶ ESPERANDO WEBHOOK DE PAYPAL");
  console.log("=".repeat(60));
  console.log(`\n⏳ Esperando ${WEBHOOK_WAIT_MS}ms para webhook...`);
  console.log("📌 Revisa los logs del servidor Medusa en otra terminal");
  console.log("   Busca: 'paypal', 'webhook', 'authorization', '404', '409'");

  await sleep(WEBHOOK_WAIT_MS);

  // 6. Verificar estado final
  console.log("\n" + "=".repeat(60));
  console.log("▶ VERIFICANDO ESTADO FINAL");
  console.log("=".repeat(60));

  const finalCart = await medusa.carts.retrieve(cart.id);
  console.log("\n📋 Estado del Cart:");
  logCart(finalCart.cart);

  // Obtener detalles de la sesión de pago
  const finalSession = finalCart.payment_sessions?.find(
    (s) => s.provider_id === "paypal"
  );
  
  console.log("\n📋 Estado de la Payment Session:");
  if (finalSession) {
    console.log(`  ID: ${finalSession.id}`);
    console.log(`  Status: ${finalSession.status}`);
    console.log(`  Data:`);
    console.log(JSON.stringify(finalSession.data, null, 4));
  }

  // Determinar si el webhook funcionó
  if (finalCart.cart?.completed_at) {
    console.log("\n✅ WEBHOOK COMPLETÓ EL CART");
    console.log("El flujo funcionó correctamente.");
  } else {
    console.log("\n❌ WEBHOOK NO COMPLETÓ EL CART");
    console.log("\n📍 DIAGNÓSTICO:");
    console.log(`  - Authorization ID enviado: ${authorizationId}`);
    console.log(`  - El plugin intentaría recuperar: GET /v2/payments/authorizations/${authorizationId}`);
    console.log(`  - Si obtiene 404: La autorización NO existe en PayPal con ese ID`);
    console.log(`  - Si obtiene 200 pero falla después: El problema es otro (permisos, datos, etc.)`);
  }
}

main().catch((error) => {
  console.error("\n❌ ERROR:", error.message);
  console.error(error);
  process.exit(1);
});
