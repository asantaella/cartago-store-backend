import { medusa } from "./e2e/auth/index.mjs";

async function testSubscriberDebug() {
  console.log("=== TEST SUBSCRIBER DEBUG ===");

  try {
    console.log("1. Authenticating...");
    await medusa.admin.auth.getToken({
      email: "cartago4x4@gmail.com",
      password: "suru",
    });
    console.log("✅ Auth successful");

    console.log("2. Getting product and regions...");
    const productId = "prod_01HZZEK1KRVMSSZGRZQQ2W08J0";
    const [productResponse, regionsResponse] = await Promise.all([
      medusa.admin.products.retrieve(productId),
      medusa.admin.regions.list(),
    ]);

    const product = productResponse.product;
    const regions = regionsResponse.regions;
    const variant = product.variants[0];

    console.log("3. Creating cart...");
    const { cart } = await medusa.carts.create({
      region_id: regions[0].id,
      items: [{ variant_id: variant.id, quantity: 1 }],
    });
    console.log(`✅ Cart created: ${cart.id}`);

    console.log(
      "4. Setting CANARIAS address (should trigger cart.customer_updated)..."
    );
    await medusa.carts.update(cart.id, {
      shipping_address: {
        first_name: "Test",
        last_name: "User",
        address_1: "Test Address 123",
        city: "Santa Cruz de Tenerife",
        postal_code: "38100", // ⭐ CÓDIGO POSTAL DE CANARIAS
        country_code: "es",
        phone: "922123456",
      },
      billing_address: {
        first_name: "Test",
        last_name: "User",
        address_1: "Test Address 123",
        city: "Santa Cruz de Tenerife",
        postal_code: "38100",
        country_code: "es",
        phone: "922123456",
      },
      email: "test@canarias.com",
    });
    console.log("✅ Canarias addresses set - subscriber should have fired");

    console.log("5. Waiting a moment for subscriber to process...");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log("6. Checking cart state...");
    const { cart: updatedCart } = await medusa.carts.retrieve(cart.id);
    console.log(`Cart metadata:`, updatedCart.metadata);
    console.log(
      `Canarias prices persisted: ${
        updatedCart.metadata?.canarias_prices_persisted || "NO"
      }`
    );

    console.log("7. Test completed");
  } catch (error) {
    console.log("❌ ERROR:");
    console.log("Message:", error.message);
    console.log("Status:", error.response?.status);
    console.log("Data:", error.response?.data);
  }
}

testSubscriberDebug();
