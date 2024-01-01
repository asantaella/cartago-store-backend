export const createPaymentSession = (medusa, { cartId }) =>
  medusa.carts
    .createPaymentSessions(cartId)
    .then(({ cart }) => {
      console.log("CART [PAYMENT SESSION CREATED]");
      return cart;
    })
    .catch((err) =>
      console.log("[ERROR] CREATE payment session; CART_ID=%s", cartId)
    );

export const selectPaymentSession = (medusa, { cartId, provider_id }) =>
  medusa.carts
    .setPaymentSession(cartId, {
      provider_id,
    })
    .then(({ cart }) => {
      console.log("CART [PAYMENT SESSION SELECTED]");
      return cart;
    })
    .catch((err) =>
      console.log("[ERROR] SELECT payment session; CART_ID=%s", cartId)
    );
