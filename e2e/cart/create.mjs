export const createCart = (medusa, { items }) =>
  medusa.carts.create({ items }).then(({ cart }) => {
    console.log("CART [CREATED]");
    return cart;
  });
