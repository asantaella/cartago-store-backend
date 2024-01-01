export const completeCart = (medusa, { cartId }) =>
  medusa.carts.complete(cartId).then(({ cart }) => {
    console.log("CART [COMPLETED]");
    return cart;
  });
