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
  getOrder,
  completeCart,
} from "../utils/medusa-api.mjs";
import {
  confirmSepaPaymentIntent,
  TEST_SEPA_IBANS,
} from "../utils/stripe-api.mjs";

const WEBHOOK_WAIT_MS = 65000; // 65 segundos para cubrir el procesamiento asíncrono SEPA

async function prepareSepaCart(medusa, cartMock) {
  const cart = await createCart(medusa, cartMock);

  // 2. Actualizar cart con items
  console.log("\n2️⃣  Adding items to cart...");
  await updateCart(medusa, cart.id, cartMock);
  console.log("✓ Items added");

  // 3. Añadir shipping method
  console.log("\n3️⃣  Adding shipping method...");
  const shippingOptions = await listShippingOptions(medusa, cart.id);
  if (shippingOptions.length) {
    const shippingOption = shippingOptions.find((option) =>
      option.name.toLowerCase().includes("estándar"),
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
  const cartWithSessions = await setPaymentSession(medusa, cart.id, "stripe");
  console.log("✓ Stripe selected");

  const stripeSession = cartWithSessions.payment_sessions?.find(
    (session) => session.provider_id === "stripe",
  );

  if (!stripeSession?.data?.id) {
    throw new Error("No se encontró PaymentIntent en la sesión de Stripe");
  }

  const updatedCart = await medusa.carts.retrieve(cart.id);
  console.log(
    `✓ Total: ${updatedCart.cart.total / 100} ${updatedCart.cart.region.currency_code.toUpperCase()}`,
  );

  return {
    cart,
    paymentIntentId: stripeSession.data.id,
  };
}

async function main() {
  console.log("\n▶ Testing SEPA Direct Debit with payment_intent.processing");
  console.log("=".repeat(70));

  const medusa = createMedusaClient();
  const cartMock = await loadCartMock();

  // 1. Crear cart y seleccionar Stripe
  console.log("\n1️⃣  Creating cart...");
  const { cart, paymentIntentId } = await prepareSepaCart(medusa, cartMock);
  console.log(`✓ Cart created: ${cart.id}`);

  console.log("\n6️⃣  Confirming SEPA PaymentIntent...");
  const confirmedPaymentIntent = await confirmSepaPaymentIntent(
    paymentIntentId,
    TEST_SEPA_IBANS.SUCCESS,
  );

  if (confirmedPaymentIntent.status !== "processing") {
    throw new Error(
      `Se esperaba status=processing para SEPA, pero Stripe devolvió ${confirmedPaymentIntent.status}`,
    );
  }

  console.log("✓ SEPA PaymentIntent confirmado en estado 'processing'");
  console.log(`4. Waiting ${WEBHOOK_WAIT_MS / 1000} seconds for webhook...`);

  await sleep(WEBHOOK_WAIT_MS);

  const completionResult = await completeCart(medusa, cart.id);
  const completedOrder = completionResult?.display_id ? completionResult : null;

  // Verificar si se creó la orden
  console.log("\n6️⃣  Checking if order was created...");
  try {
    const finalCart = await medusa.carts.retrieve(cart.id);
    if (completedOrder || finalCart.cart?.completed_at) {
      console.log("\n✅ SUCCESS - Cart was completed!");
      const orderId = completedOrder?.id ?? finalCart.cart.order_id;
      console.log(`Order ID: ${orderId}`);

      const order = completedOrder
        ? { order: completedOrder }
        : await medusa.orders.retrieve(orderId);
      console.log(`Order Display ID: #${order.order.display_id}`);
      console.log(`Order Status: ${order.order.status}`);
      console.log(`Payment Status: ${order.order.payment_status}`);
    } else {
      console.log("\n❌ FAIL - Cart was NOT completed");
      console.log("The order was not created automatically.");
      console.log("\nPossible issues:");
      console.log(
        "  1. The subscriber didn't execute (check logs for [SEPA-PROCESSING])",
      );
      console.log("  2. The payment method type is not 'sepa_debit'");
      console.log("  3. The cart_id is not in the payment intent metadata");
      console.log(
        "  4. There was an error during order creation (check error logs)",
      );
    }
  } catch (error) {
    console.error("\n❌ ERROR checking cart:", error.message);
  }
}

main().catch((error) => {
  console.error("\n❌ ERROR:", error.message);
  process.exit(1);
});
