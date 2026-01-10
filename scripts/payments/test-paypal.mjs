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
import { createOrder, captureOrder } from "../utils/paypal-api.mjs";

const WEBHOOK_WAIT_MS = 5000;

async function main() {
  console.log("\n▶ Iniciando test PayPal Checkout");
  const medusa = createMedusaClient();
  const cartMock = await loadCartMock();

  const cart = await createCart(medusa, cartMock);
  await updateCart(medusa, cart.id, cartMock);

  const shippingOptions = await listShippingOptions(medusa, cart.id);
  if (shippingOptions.length) {
    await addShippingMethod(medusa, cart.id, shippingOptions[0].id);
  }

  await createPaymentSessions(medusa, cart.id);
  await setPaymentSession(medusa, cart.id, "paypal");

  logCart(cart);

  const paypalOrder = await createOrder(
    cart.id,
    cart.total,
    cart.region?.currency_code || "eur"
  );
  await captureOrder(paypalOrder.id);

  console.log(
    `Esperando ${WEBHOOK_WAIT_MS}ms para que el webhook de PayPal se procese...`
  );
  await sleep(WEBHOOK_WAIT_MS);

  const finalCart = await medusa.carts.retrieve(cart.id);
  logCart(finalCart.cart);

  if (finalCart.cart?.order_id) {
    const order = await getOrder(medusa, finalCart.cart.order_id);
    console.log("Orden PayPal resultante:");
    console.log(` - ID: ${order.id}`);
    console.log(` - Status: ${order.status}`);
  }
}

main().catch((error) => {
  console.error("ERROR en test PayPal:", error);
  process.exit(1);
});
