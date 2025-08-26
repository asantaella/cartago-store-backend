import { medusa } from "./e2e/auth/index.mjs";
import util from "util";
import axios from "axios";

// test-complete.mjs — Flujo E2E limpio y único

// Helper: espera hasta que el carrito tenga payment_session o payment_methods
async function waitForPaymentSession(cartId, attempts = 6, delayMs = 500) {
  for (let i = 0; i < attempts; i++) {
    let resp = null;
    try {
      resp = await medusa.carts.retrieve(cartId);
    } catch (e) {
      console.warn(
        "waitForPaymentSession: retrieve failed, retrying...",
        e && e.message ? e.message : e
      );
      resp = null;
    }
    const cart = resp && (resp.cart ? resp.cart : resp);
    if (
      cart &&
      (cart.payment_session ||
        (cart.payment_methods && cart.payment_methods.length))
    ) {
      return cart;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

async function testComplete() {
  try {
    await medusa.admin.auth.getToken({
      email: "cartago4x4@gmail.com",
      password: "suru",
    });
    console.log("✓ Authenticated (admin)");

    const { products } = await medusa.admin.products.list({ limit: 10 });
    if (!products || products.length === 0) {
      console.error("No products available to create cart.");
      return;
    }
    const product = products[0];

    const { cart: newCart } = await medusa.carts.create({
      items: [{ variant_id: product.variants[0].id, quantity: 1 }],
    });
    console.log("✓ Cart created:", newCart.id);

    // Attach known Canarias customer if present
    const customerId = "cus_01J1Z8H31J0DBXA7P1KRPXHN26";
    try {
      const { customer } = await medusa.admin.customers.retrieve(customerId);
      if (customer?.id)
        await medusa.carts.update(newCart.id, { customer_id: customer.id });
    } catch (e) {
      // ignore
    }

    let { cart: updatedCart } = await medusa.carts.update(newCart.id, {
      shipping_address: {
        first_name: "Test",
        last_name: "User",
        address_1: "Test Address",
        city: "Las Palmas",
        postal_code: "35001",
        country_code: "es",
        phone: "123456789",
      },
    });
    console.log(
      "✓ Shipping set to Canarias:",
      updatedCart.shipping_address.postal_code
    );

    const { shipping_options } = await medusa.shippingOptions.listCartOptions(
      updatedCart.id
    );
    const selectedOption =
      (shipping_options &&
        shipping_options.length &&
        (shipping_options.find(
          (o) => !o.requirements || o.requirements.length === 0
        ) ||
          shipping_options[0])) ||
      null;
    if (selectedOption) {
      await medusa.carts.addShippingMethod(updatedCart.id, {
        option_id: selectedOption.id,
      });
      console.log("✓ Shipping option added:", selectedOption.id);

      const { cart: cartAfterShip } = await medusa.carts.createPaymentSessions(
        updatedCart.id
      );
      let providerId =
        cartAfterShip.payment_methods && cartAfterShip.payment_methods.length
          ? cartAfterShip.payment_methods[0].provider_id
          : undefined;
      if (!providerId) {
        try {
          const { payment_methods } = await medusa.admin.paymentMethods.list({
            limit: 50,
          });
          providerId =
            payment_methods && payment_methods.length
              ? payment_methods[0].provider_id
              : undefined;
        } catch (e) {
          // ignore
        }
      }
      if (!providerId) providerId = "manual";

      const setResp = await medusa.carts.setPaymentSession(cartAfterShip.id, {
        provider_id: providerId,
      });
      console.log(
        "setPaymentSession response:",
        util.inspect(setResp, { depth: 3 })
      );
      updatedCart = setResp && setResp.cart ? setResp.cart : setResp;
      console.log("✓ Payment session set to", providerId);

      // Esperar hasta que el carrito tenga payment_session/payment_methods
      const waited = await waitForPaymentSession(updatedCart.id, 8, 700);
      console.log(
        "waitForPaymentSession result:",
        waited ? `found (id=${waited.id})` : "not found"
      );
    } else {
      console.warn("No shipping option available for the cart");
    }
    const createPayResp = await medusa.carts.createPaymentSessions(
      updatedCart.id
    );
    console.log(
      "createPaymentSessions response:",
      util.inspect(createPayResp, { depth: 3 })
    );
    const cartWithPayment =
      createPayResp && createPayResp.cart ? createPayResp.cart : createPayResp;
    const finalCartResp = await medusa.carts.retrieve(cartWithPayment.id);
    console.log(
      "retrieve(final) response:",
      util.inspect(finalCartResp, { depth: 3 })
    );
    const finalCart =
      finalCartResp && finalCartResp.cart ? finalCartResp.cart : finalCartResp;
    if (
      !finalCart.payment_session &&
      (!finalCart.payment_methods || finalCart.payment_methods.length === 0)
    ) {
      console.error(
        "FATAL: no payment session before complete. Cart:",
        finalCart.id
      );
      return;
    }

    console.log("⚡ Completing cart:", finalCart.id);
    const res = await medusa.carts.complete(finalCart.id);

    if (res.order) {
      console.log(`✓ Order created: ${res.order.id}`);
      res.order.items.forEach((it) =>
        console.log(` - ${it.title}: ${it.unit_price / 100}€ x ${it.quantity}`)
      );
    } else {
      console.log("No order created (response):", res);
    }
  } catch (err) {
    console.error("Script error:", err);
  }
}

// Ejecutar el script
testComplete();
