//import { medusa } from "../auth/index.mjs";
// Function to add shipping option to cart
export async function addShippingOption(medusa, cartId) {
  // Get available shipping options for the cart
  const { regions } = await medusa.admin.regions.list();
  console.log("Regions: ", regions.map((region) => region.name).join(", "));
  const { shipping_options } = await medusa.admin.shippingOptions.list({
    region_id: regions[0].id,
  });

  console.log(
    "Shipping options: ",
    shipping_options.map((option) => option.name).join(", ")
  );
  //Select the first available shipping option
  if (shipping_options && shipping_options.length > 0) {
    const shippingOption = shipping_options.find((option) => option.amount > 0);
    const { cart } = await medusa.carts.addShippingMethod(cartId, {
      option_id: shippingOption.id,
    });
    console.log(`Selected shipping option: ${shippingOption.name}`);
    return cart;
  } else {
    console.log("No shipping options available");
    // Fetch and return the current cart state
    const { cart } = await medusa.carts.retrieve(cartId);
    return cart;
  }
}
// await medusa.admin.auth.getToken({
//   email: "cartago4x4@gmail.com",
//   password: "suru",
// });

// addShippingOption(medusa, "cart_id");
