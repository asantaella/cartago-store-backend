#!/usr/bin/env node

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
import {
  createPaymentIntent,
  confirmPaymentIntent,
  TEST_PAYMENT_METHODS,
} from "../utils/stripe-api.mjs";

const WEBHOOK_WAIT_MS = 5000;

async function main() {
  console.log("\n▶ Iniciando test Stripe (Card)");
  const medusa = createMedusaClient();
  const cartMock = await loadCartMock();

  const cart = await createCart(medusa, cartMock);
  await updateCart(medusa, cart.id, cartMock);

  const shippingOptions = await listShippingOptions(medusa, cart.id);
  if (shippingOptions.length) {
    const shippingOption = shippingOptions.find((option) =>
      option.name.toLowerCase().includes("estándar")
    );
    if (shippingOption) {
      await addShippingMethod(medusa, cart.id, shippingOption.id);
    }
  }

  // Recuperar cart actualizado con shipping method para obtener el total correcto
  const updatedCart = await medusa.carts.retrieve(cart.id);
  console.log(
    `✓ Total del carrito con envío: ${
      updatedCart.cart.total / 100
    } ${updatedCart.cart.region.currency_code.toUpperCase()}`
  );

  await createPaymentSessions(medusa, cart.id);
  const cartWithSessions = await setPaymentSession(medusa, cart.id, "stripe");

  // Obtener el PaymentIntent creado por Medusa
  const stripeSession = cartWithSessions.payment_sessions?.find(
    (session) => session.provider_id === "stripe"
  );

  if (!stripeSession?.data?.id) {
    throw new Error("No se encontró PaymentIntent en la sesión de Stripe");
  }

  const paymentIntentId = stripeSession.data.id;
  console.log(`✓ Usando PaymentIntent de Medusa: ${paymentIntentId}`);

  await confirmPaymentIntent(paymentIntentId, TEST_PAYMENT_METHODS.SUCCESS);

  console.log(`\n⏳ Polling for order creation and payment status "captured"...`);
  
  const POLLING_ATTEMPTS = 10;
  const POLLING_INTERVAL_MS = 2000;
  let orderFoundAndPaid = false;
  let lastOrder = null;

  for (let i = 1; i <= POLLING_ATTEMPTS; i++) {
    const currentCartResponse = await medusa.carts.retrieve(cart.id);
    const currentCart = currentCartResponse.cart;

    if (currentCart?.order_id) {
      const order = await getOrder(medusa, currentCart.order_id);
      lastOrder = order;
      
      process.stdout.write(`Attempt ${i}/${POLLING_ATTEMPTS}: Order ${order.id} found. Payment status: ${order.payment_status}\r`);
      
      if (order.payment_status === "captured") {
        console.log(`\n✅ Order found and payment status is 'captured' (paid) at attempt ${i}!`);
        orderFoundAndPaid = true;
        break;
      }
    } else {
      process.stdout.write(`Attempt ${i}/${POLLING_ATTEMPTS}: Order not created yet...\r`);
    }
    
    if (i < POLLING_ATTEMPTS) {
      await sleep(POLLING_INTERVAL_MS);
    }
  }
  console.log("\n"); // New line after polling

  const finalCartResponse = await medusa.carts.retrieve(cart.id);
  const finalCart = finalCartResponse.cart;
  logCart(finalCart);

  if (finalCart?.completed_at) {
    console.log("✅ El cart se completó correctamente.");
  } else {
    console.warn("⚠️  El cart aún no se completó. Revisa los webhooks.");
  }

  if (lastOrder) {
    console.log("\n📦 Orden resultante:");
    console.log(` - ID: ${lastOrder.id}`);
    console.log(` - Display ID: ${lastOrder.display_id}`);
    console.log(` - Status: ${lastOrder.status}`);
    console.log(` - Payment Status: ${lastOrder.payment_status}`);
    console.log(
      ` - Total: ${lastOrder.total / 100} ${lastOrder.currency_code.toUpperCase()}`
    );
    console.log(` - Subtotal: ${lastOrder.subtotal / 100}`);
    console.log(` - Shipping: ${lastOrder.shipping_total / 100}`);
    console.log(` - Tax: ${lastOrder.tax_total / 100}`);
    
    if (!orderFoundAndPaid) {
      console.error(`❌ FAILED: Order exists but payment status is '${lastOrder.payment_status}', expected 'captured'.`);
    }
  } else {
    console.error("❌ FAILED: No order was created for this cart.");
  }
}

main().catch((error) => {
  console.error("ERROR en test Stripe Card:", error);
  process.exit(1);
});
