const shipping_address = {
  first_name: "Antonio",
  last_name: "Santaella Mesa",
  phone: "6665558877",
  address_1: "C/ Miguel de Unamuno 7",
  address_2: "Portal 4, 5ºB",
  city: "Buitrago de Lozoya",
  province: "Madrid",
  postal_code: "12345",
  country_code: "es",
  metadata: {
    nif_cif: "75150333H",
  },
};

export const updateCart = (medusa, data) => {
  const { cartId, customer_id } = data;
  return medusa.carts
    .update(cartId, { customer_id, shipping_address })
    .then(({ cart }) => {
      console.log("CART [UDPATED]");
      return cart;
    })
    .catch(() => console.log("[ERROR] Updated Cart"));
};
