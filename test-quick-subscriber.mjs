import { medusa } from "./e2e/auth/index.mjs";

async function quickSubscriberTest() {
  try {
    await medusa.admin.auth.getToken({
      email: "cartago4x4@gmail.com",
      password: "suru",
    });

    const [productResponse, regionsResponse] = await Promise.all([
      medusa.admin.products.retrieve("prod_01HZZEK1KRVMSSZGRZQQ2W08J0"),
      medusa.admin.regions.list(),
    ]);

    const { cart } = await medusa.carts.create({
      region_id: regionsResponse.regions[0].id,
      items: [
        { variant_id: productResponse.product.variants[0].id, quantity: 1 },
      ],
    });

    console.log(`Cart created: ${cart.id}`);

    // This should trigger cart.customer_updated event
    await medusa.carts.update(cart.id, {
      shipping_address: {
        first_name: "Test",
        last_name: "User",
        address_1: "Test Address",
        city: "Santa Cruz de Tenerife",
        postal_code: "38100",
        country_code: "es",
      },
      email: "test@test.com",
    });

    console.log("Address set - check server logs for subscriber activity");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

quickSubscriberTest();
