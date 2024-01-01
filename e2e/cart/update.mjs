export const updateCart = (medusa, data) => {
  const { cartId, customer_id } = data;
  return medusa.carts
    .update(cartId, { customer_id })
    .then(({ cart }) => {
      console.log("CART [UDPATED]");
      return cart;
    })
    .catch(() => console.log("[ERROR] Updated Cart"));
};
