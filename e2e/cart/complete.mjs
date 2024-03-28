export const completeCart = (medusa, { cartId }) =>
  medusa.carts.complete(cartId).then(({ cart }) => {
    console.log("CART [COMPLETED]");
    return cart;
  }).catch(e => {
    console.log("[ERROR] ON CART COMPLETED", e)
  })
