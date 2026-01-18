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
  createSepaPaymentIntent,
  confirmSepaPaymentIntent,
  TEST_SEPA_IBANS,
} from "../utils/stripe-api.mjs";

const WEBHOOK_WAIT_MS = 8000;

async function main() {
  console.log("\n▶ Iniciando test Stripe (SEPA)");
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

  await confirmSepaPaymentIntent(
    paymentIntentId,
    TEST_SEPA_IBANS.SUCCESS,
    "Juan Pérez",
    cartMock.email
  );

  console.log(
    `Esperando ${WEBHOOK_WAIT_MS}ms para que se procese la orden SEPA...`
  );
  await sleep(WEBHOOK_WAIT_MS);

  const finalCart = await medusa.carts.retrieve(cart.id);
  logCart(finalCart.cart);

  if (finalCart.cart?.order_id) {
    const order = await getOrder(medusa, finalCart.cart.order_id);
    console.log("\n📦 Orden resultante:");
    console.log(` - ID: ${order.id}`);
    console.log(` - Display ID: ${order.display_id}`);
    console.log(` - Status: ${order.status}`);
    console.log(` - Payment Status: ${order.payment_status}`);
    console.log(
      ` - Total: ${order.total / 100} ${order.currency_code.toUpperCase()}`
    );
    console.log(` - Subtotal: ${order.subtotal / 100}`);
    console.log(` - Shipping: ${order.shipping_total / 100}`);
    console.log(` - Tax: ${order.tax_total / 100}`);
  } else {
    console.warn("⚠️  Aún no hay orden asociada (el webhook puede tardar)");
  }
}

main().catch((error) => {
  console.error("ERROR en test Stripe SEPA:", error);
  process.exit(1);
});
