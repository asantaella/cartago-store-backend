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
      option.name.toLowerCase().includes("estándar")
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
      `PayPal devolvió una orden distinta a la de la sesión: esperado ${paypalOrderId}, recibido ${capturedOrder.id}`
    );
  }

  console.log("✓ Orden PayPal capturada");

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

  const webhookBase = MEDUSA_BACKEND_URL.replace(/\/$/, "");
  const webhookUrl = `${webhookBase}/webhooks/paypal`;
  const completedOrder = {
    id: capturedOrder.id,
    status: capturedOrder.status,
    purchase_units: purchaseUnits,
  };

  console.log("Simulando webhook CHECKOUT.ORDER.COMPLETED...");
  await simulateWebhook("CHECKOUT.ORDER.COMPLETED", completedOrder, webhookUrl);

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
