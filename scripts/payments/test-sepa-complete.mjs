#!/usr/bin/env node

/**
 * Script de prueba completo para SEPA Direct Debit
 * Crea un cart, añade items, crea payment session con Stripe/SEPA
 * y monitorea si la orden se crea cuando llega payment_intent.processing
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

const WEBHOOK_WAIT_MS = 20000; // 20 segundos para esperar webhooks

async function main() {
  console.log("\n▶ Testing SEPA Direct Debit with payment_intent.processing");
  console.log("=".repeat(70));

  const medusa = createMedusaClient();
  const cartMock = await loadCartMock();

  // 1. Crear cart
  console.log("\n1️⃣  Creating cart...");
  const cart = await createCart(medusa, cartMock);
  console.log(`✓ Cart created: ${cart.id}`);

  // 2. Actualizar cart con items
  console.log("\n2️⃣  Adding items to cart...");
  await updateCart(medusa, cart.id, cartMock);
  console.log("✓ Items added");

  // 3. Añadir shipping method
  console.log("\n3️⃣  Adding shipping method...");
  const shippingOptions = await listShippingOptions(medusa, cart.id);
  if (shippingOptions.length) {
    const shippingOption = shippingOptions.find((option) =>
      option.name.toLowerCase().includes("estándar")
    );
    if (shippingOption) {
      await addShippingMethod(medusa, cart.id, shippingOption.id);
      console.log("✓ Shipping method added");
    }
  }

  // 4. Crear payment sessions
  console.log("\n4️⃣  Creating payment sessions...");
  await createPaymentSessions(medusa, cart.id);
  console.log("✓ Payment sessions created");

  // 5. Seleccionar Stripe como provider
  console.log("\n5️⃣  Selecting Stripe payment provider...");
  await setPaymentSession(medusa, cart.id, "stripe");
  console.log("✓ Stripe selected");

  const updatedCart = await medusa.carts.retrieve(cart.id);
  console.log(
    `✓ Total: ${updatedCart.cart.total / 100} ${updatedCart.cart.region.currency_code.toUpperCase()}`
  );

  console.log("\n📋 NEXT STEPS:");
  console.log("=".repeat(70));
  console.log("1. Use the Stripe Dashboard or CLI to create a SEPA payment:");
  console.log(`   Cart ID: ${cart.id}`);
  console.log(`   Total: ${updatedCart.cart.total / 100} EUR`);
  console.log("");
  console.log("2. Complete the payment in Stripe (it will enter 'processing' state)");
  console.log("");
  console.log("3. Monitor your backend logs for:");
  console.log("   ✓ [SEPA-PROCESSING] ===== SUBSCRIBER INVOKED =====");
  console.log("   ✓ [SEPA-PROCESSING] Received event type: payment_intent.processing");
  console.log("   ✓ [SEPA-PROCESSING] Processing SEPA Direct Debit payment");
  console.log("   ✓ [SEPA-PROCESSING] Successfully created order");
  console.log("");
  console.log(`4. Waiting ${WEBHOOK_WAIT_MS / 1000} seconds for webhook...`);

  await sleep(WEBHOOK_WAIT_MS);

  // Verificar si se creó la orden
  console.log("\n6️⃣  Checking if order was created...");
  try {
    const finalCart = await medusa.carts.retrieve(cart.id);
    if (finalCart.cart?.completed_at) {
      console.log("\n✅ SUCCESS - Cart was completed!");
      console.log(`Order ID: ${finalCart.cart.order_id}`);
      
      const order = await medusa.orders.retrieve(finalCart.cart.order_id);
      console.log(`Order Display ID: #${order.order.display_id}`);
      console.log(`Order Status: ${order.order.status}`);
      console.log(`Payment Status: ${order.order.payment_status}`);
    } else {
      console.log("\n❌ FAIL - Cart was NOT completed");
      console.log("The order was not created automatically.");
      console.log("\nPossible issues:");
      console.log("  1. The subscriber didn't execute (check logs for [SEPA-PROCESSING])");
      console.log("  2. The payment method type is not 'sepa_debit'");
      console.log("  3. The cart_id is not in the payment intent metadata");
      console.log("  4. There was an error during order creation (check error logs)");
    }
  } catch (error) {
    console.error("\n❌ ERROR checking cart:", error.message);
  }
}

main().catch((error) => {
  console.error("\n❌ ERROR:", error.message);
  process.exit(1);
});
