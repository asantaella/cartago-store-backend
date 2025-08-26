import { medusa } from "./e2e/auth/index.mjs";

const baseUrl = "http://localhost:9000";

async function testCanariasSimple() {
  console.log("=== TEST CANARIAS SIMPLE - SOLO AUTO-PERSISTENCIA ===");

  try {
    await medusa.admin.auth.getToken({
      email: "cartago4x4@gmail.com",
      password: "suru",
    });

    const productId = "prod_01HZZEK1KRVMSSZGRZQQ2W08J0";
    console.log(`📦 Filtro gasolina: 10€ → 8.26€`);

    // Obtener producto y regions disponibles
    const [productResponse, regionsResponse] = await Promise.all([
      medusa.admin.products.retrieve(productId),
      medusa.admin.regions.list(),
    ]);

    const product = productResponse.product;
    const region = regionsResponse.regions[0]; // Usar la primera region disponible
    console.log(`📍 Usando región: ${region.name} (${region.id})`);
    console.log(
      `📦 Producto: ${product.title} - Variants: ${product.variants.length}`
    );

    // Usar el primer variant disponible
    const variant = product.variants[0];
    console.log(
      `🔍 Variant: ${variant.title} (${variant.id}) - ${(
        variant.prices[0].amount / 100
      ).toFixed(2)}€`
    );

    // Crear carrito simple
    const cartResponse = await medusa.carts.create({
      region_id: region.id,
    });

    const cart = cartResponse.cart;
    console.log(`✅ Carrito creado: ${cart.id}`);

    // Agregar producto usando el variant correcto
    await medusa.carts.lineItems.create(cart.id, {
      variant_id: variant.id,
      quantity: 1,
    });

    console.log(`✅ Producto agregado al carrito`);

    // Establecer dirección de Canarias
    await medusa.carts.update(cart.id, {
      shipping_address: {
        first_name: "Test",
        last_name: "User",
        address_1: "123 Test Street",
        city: "Las Palmas de Gran Canaria",
        province: "Las Palmas",
        postal_code: "38100", // Canarias postal code
        country_code: "es",
      },
    });

    console.log(`✅ Dirección de Canarias establecida`);

    // Obtener carrito actualizado (esto debería disparar auto-persistencia)
    let updatedCart = await medusa.carts.retrieve(cart.id);
    console.log(
      `🏝️  Precio después del retrieve: ${(
        updatedCart.items[0].unit_price / 100
      ).toFixed(2)}€`
    );

    // Esperar un poco para que la auto-persistencia termine
    console.log(`⏳ Esperando auto-persistencia...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Obtener el carrito de nuevo para ver si la persistencia funcionó
    updatedCart = await medusa.carts.retrieve(cart.id);
    console.log(
      `🔍 Precio después de esperar: ${(
        updatedCart.items[0].unit_price / 100
      ).toFixed(2)}€`
    );
    console.log(`📝 Metadata del carrito:`, updatedCart.metadata);

    // Agregar shipping method
    const shippingOptions = await medusa.shippingOptions.listCartOptions(
      cart.id
    );
    console.log(
      `📦 Shipping options disponibles: ${shippingOptions.shipping_options.length}`
    );

    if (shippingOptions.shipping_options.length > 0) {
      await medusa.carts.addShippingMethod(cart.id, {
        option_id: shippingOptions.shipping_options[0].id,
      });
      console.log(`✅ Shipping method agregado`);
    }

    // Crear payment session
    await medusa.carts.createPaymentSessions(cart.id);
    console.log(`✅ Payment session creada`);

    // Seleccionar método de pago
    const cartWithPayment = await medusa.carts.retrieve(cart.id);
    const paymentSessionId = cartWithPayment.payment_sessions[0].id;

    await medusa.carts.setPaymentSession(cart.id, {
      provider_id: "manual",
    });
    console.log(`✅ Payment session seleccionada`);

    // Completar carrito
    const order = await medusa.carts.complete(cart.id);
    console.log(`✅ Orden completada: ${order.id}`);

    // Validar precios finales
    const finalPrice = order.items[0].unit_price;
    const taxTotal = order.tax_total;

    console.log("\n🎯 === RESULTADOS FINALES ===");
    console.log(`💰 Precio unit en orden: ${(finalPrice / 100).toFixed(2)}€`);
    console.log(`🏛️  Tax total orden: ${(taxTotal / 100).toFixed(2)}€`);

    const expectedCanariasPrice = 826; // 8.26€
    const priceCorrect = finalPrice === expectedCanariasPrice;
    const taxCorrect = taxTotal === 0;

    if (priceCorrect && taxCorrect) {
      console.log(`✅ SUCCESS: Precios correctos para Canarias`);
      console.log(`   - Unit price: ${(finalPrice / 100).toFixed(2)}€ ✓`);
      console.log(`   - Tax total: ${(taxTotal / 100).toFixed(2)}€ ✓`);
    } else {
      console.log(`❌ FAIL: Precios incorrectos`);
      console.log(
        `   - Unit price: ${(finalPrice / 100).toFixed(2)}€ ${
          priceCorrect ? "✓" : "✗"
        }`
      );
      console.log(
        `   - Tax total: ${(taxTotal / 100).toFixed(2)}€ ${
          taxCorrect ? "✓" : "✗"
        }`
      );
    }

    // Cleanup
    await medusa.admin.orders.cancel(order.id);
    console.log(`🧹 Orden cancelada para cleanup`);
  } catch (error) {
    console.error(`❌ ERROR:`, error.message);
    if (error.response?.data) {
      console.error("Data:", error.response.data);
    }
  }
}

testCanariasSimple().catch(console.error);
