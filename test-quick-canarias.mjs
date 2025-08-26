import { medusa } from "./e2e/auth/index.mjs";

async function quickCanariasTest() {
  console.log("=== QUICK CANARIAS TEST ===");

  try {
    await medusa.admin.auth.getToken({
      email: "cartago4x4@gmail.com",
      password: "suru",
    });

    // Usar un carrito existente si hay logs de que se crearon
    const cartId = "cart_01K2WNT4347A4E7RXFB974CHX7"; // Del log anterior

    try {
      // Intentar obtener el carrito que se creó antes
      let cart = await medusa.carts.retrieve(cartId);
      console.log(`✅ Carrito encontrado: ${cart.id}`);
      console.log(`📦 Items: ${cart.items.length}`);

      if (cart.items.length > 0) {
        const item = cart.items[0];
        console.log(`💰 Precio actual: ${(item.unit_price / 100).toFixed(2)}€`);
        console.log(`🏝️  Postal code: ${cart.shipping_address?.postal_code}`);
        console.log(`📝 Metadata: ${JSON.stringify(cart.metadata)}`);
      }
    } catch (cartError) {
      console.log(
        `❌ No se pudo obtener carrito existente: ${cartError.message}`
      );
      console.log(`🔍 Creando carrito nuevo para test básico...`);

      // Obtener product y region
      const [productResponse, regionsResponse] = await Promise.all([
        medusa.admin.products.retrieve("prod_01HZZEK1KRVMSSZGRZQQ2W08J0"),
        medusa.admin.regions.list(),
      ]);

      const product = productResponse.product;
      const region = regionsResponse.regions[0];
      const variant = product.variants[0];

      console.log(
        `📦 Producto: ${product.title} - ${(
          variant.prices[0].amount / 100
        ).toFixed(2)}€`
      );

      // Crear carrito
      const cartResponse = await medusa.carts.create({
        region_id: region.id,
      });
      const newCart = cartResponse.cart;

      // Agregar producto
      await medusa.carts.lineItems.create(newCart.id, {
        variant_id: variant.id,
        quantity: 1,
      });

      // Establecer dirección Canarias
      await medusa.carts.update(newCart.id, {
        shipping_address: {
          first_name: "Test",
          last_name: "User",
          address_1: "123 Test Street",
          city: "Las Palmas de Gran Canaria",
          province: "Las Palmas",
          postal_code: "38100",
          country_code: "es",
        },
      });

      console.log(`✅ Carrito nuevo creado y configurado: ${newCart.id}`);

      // Obtener carrito para disparar conversión
      cart = await medusa.carts.retrieve(newCart.id);
      const item = cart.items[0];
      console.log(
        `💰 Precio después de retrieve: ${(item.unit_price / 100).toFixed(2)}€`
      );
      console.log(`🏝️  Postal code: ${cart.shipping_address?.postal_code}`);
    }
  } catch (error) {
    console.error(`❌ ERROR:`, error.message);
  }
}

quickCanariasTest().catch(console.error);
