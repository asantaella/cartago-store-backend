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
  completeCart,
  sleep,
} from "../utils/medusa-api.mjs";
import {
  confirmPaymentIntent,
  retrievePaymentIntent,
  TEST_PAYMENT_METHODS,
} from "../utils/stripe-api.mjs";

const WEBHOOK_WAIT_MS = 5000;

async function prepareStripeCart(medusa, cartMock) {
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
    `✓ Total del carrito con envío: ${
      updatedCart.cart.total / 100
    } ${updatedCart.cart.region.currency_code.toUpperCase()}`,
  );

  await createPaymentSessions(medusa, cart.id);
  const cartWithSessions = await setPaymentSession(medusa, cart.id, "stripe");
  const stripeSession = cartWithSessions.payment_sessions?.find(
    (session) => session.provider_id === "stripe",
  );

  if (!stripeSession?.data?.id) {
    throw new Error("No se encontró PaymentIntent en la sesión de Stripe");
  }

  return {
    cart,
    paymentIntentId: stripeSession.data.id,
  };
}

async function validate3DSSetup(medusa, cartMock) {
  console.log("\n▶ Validando configuración 3DS para tarjeta");
  const { paymentIntentId } = await prepareStripeCart(medusa, cartMock);

  const paymentIntent = await retrievePaymentIntent(paymentIntentId);
  const requestThreeDSecure =
    paymentIntent.payment_method_options?.card?.request_three_d_secure;

  if (requestThreeDSecure !== "automatic") {
    throw new Error(
      `Se esperaba request_three_d_secure=automatic, pero se obtuvo ${requestThreeDSecure}`,
    );
  }

  console.log("✓ request_three_d_secure=automatic en el PaymentIntent");

  const threeDSResult = await confirmPaymentIntent(
    paymentIntentId,
    TEST_PAYMENT_METHODS.THREE_D_SECURE_REQUIRED,
  );

  if (
    threeDSResult.status !== "requires_action" &&
    threeDSResult.status !== "requires_source_action"
  ) {
    throw new Error(
      `Se esperaba requires_action para validar 3DS, pero Stripe devolvió ${threeDSResult.status}`,
    );
  }

  console.log(
    `✓ 3DS validado: Stripe devolvió ${threeDSResult.status} y requerirá completarse desde el frontend`,
  );
}

async function validateSuccessfulCardPayment(medusa, cartMock) {
  console.log("\n▶ Validando pago exitoso con tarjeta");
  const { cart, paymentIntentId } = await prepareStripeCart(medusa, cartMock);

  await confirmPaymentIntent(paymentIntentId, TEST_PAYMENT_METHODS.SUCCESS);
  const completionResult = await completeCart(medusa, cart.id);
  let lastOrder = completionResult?.display_id ? completionResult : null;
  let orderFoundAndPaid = lastOrder?.payment_status === "captured";

  console.log(
    `\n⏳ Polling for order creation and payment status "captured"...`,
  );

  const POLLING_ATTEMPTS = 10;
  const POLLING_INTERVAL_MS = 2000;

  for (let i = 1; i <= POLLING_ATTEMPTS; i++) {
    const currentCartResponse = await medusa.carts.retrieve(cart.id);
    const currentCart = currentCartResponse.cart;
    const orderId = currentCart?.order_id ?? lastOrder?.id;

    if (orderId) {
      const order = await getOrder(medusa, orderId);
      lastOrder = order;

      process.stdout.write(
        `Attempt ${i}/${POLLING_ATTEMPTS}: Order ${order.id} found. Payment status: ${order.payment_status}\r`,
      );

      if (order.payment_status === "captured") {
        console.log(
          `\n✅ Order found and payment status is 'captured' (paid) at attempt ${i}!`,
        );
        orderFoundAndPaid = true;
        break;
      }
    } else {
      process.stdout.write(
        `Attempt ${i}/${POLLING_ATTEMPTS}: Order not created yet...\r`,
      );
    }

    if (i < POLLING_ATTEMPTS) {
      await sleep(POLLING_INTERVAL_MS);
    }
  }
  console.log("\n");

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
      ` - Total: ${lastOrder.total / 100} ${lastOrder.currency_code.toUpperCase()}`,
    );
    console.log(` - Subtotal: ${lastOrder.subtotal / 100}`);
    console.log(` - Shipping: ${lastOrder.shipping_total / 100}`);
    console.log(` - Tax: ${lastOrder.tax_total / 100}`);

    if (!orderFoundAndPaid) {
      console.error(
        `❌ FAILED: Order exists but payment status is '${lastOrder.payment_status}', expected 'captured'.`,
      );
    }
  } else {
    throw new Error(
      "No se creó ninguna orden para el flujo exitoso de tarjeta.",
    );
  }
}

async function main() {
  console.log("\n▶ Iniciando test Stripe (Card)");
  const medusa = createMedusaClient();
  const cartMock = await loadCartMock();

  await validate3DSSetup(medusa, cartMock);
  await validateSuccessfulCardPayment(medusa, cartMock);
}

main().catch((error) => {
  console.error("ERROR en test Stripe Card:", error);
  process.exit(1);
});
