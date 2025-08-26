import { medusa } from "./e2e/auth/index.mjs";

async function testOrderFinalPrices() {
  console.log("=== TEST PRECIOS FINALES EN ORDEN ===");

  try {
    await medusa.admin.auth.getToken({
      email: "cartago4x4@gmail.com",
      password: "suru",
    });

    const productId = "prod_01HZZEK1KRVMSSZGRZQQ2W08J0";

    // Obtener producto y regions
    const [productResponse, regionsResponse] = await Promise.all([
      medusa.admin.products.retrieve(productId),
      medusa.admin.regions.list(),
    ]);

    const product = productResponse.product;
    const regions = regionsResponse.regions;
    const variant = product.variants[0];

    console.log(`📦 Producto: ${product.title}`);
    console.log(
      `💰 Precio original: ${(variant.prices[0].amount / 100).toFixed(2)}€`
    );

    const expectedCanariasPrice = 826; // 8.26€ en céntimos
    console.log(
      `🏝️  Precio esperado Canarias: ${(expectedCanariasPrice / 100).toFixed(
        2
      )}€`
    );

    // USAR PROCESO SIMILAR AL TEST QUE FUNCIONA
    const cart = await medusa.carts.create({
      region_id: regions[0].id,
    });
    console.log(`✅ Carrito creado: ${cart.id}`);

    // Establecer dirección de Canarias PRIMERO
    await medusa.carts.update(cart.id, {
      email: "test@canarias.com",
      shipping_address: {
        first_name: "Test",
        last_name: "Canarias",
        address_1: "Calle Test 123",
        city: "Santa Cruz de Tenerife",
        province: "Santa Cruz de Tenerife",
        postal_code: "38100", // Canarias postal code
        country_code: "es",
      },
    });
    console.log(`✅ Dirección Canarias establecida ANTES de agregar productos`);

    // AHORA agregar productos
    await medusa.carts.lineItems.create(cart.id, {
      variant_id: variant.id,
      quantity: 1,
    });
    console.log(`✅ Producto agregado DESPUÉS de dirección`);

    // Obtener carrito para verificar conversión
    let updatedCart = await medusa.carts.retrieve(cart.id);
    const item = updatedCart.items[0];

    console.log(`\n📊 PRECIOS EN CARRITO:`);
    console.log(
      `   Unit price: ${(item.unit_price / 100).toFixed(2)}€ (${
        item.unit_price
      } céntimos)`
    );
    console.log(
      `   Expected: ${(expectedCanariasPrice / 100).toFixed(
        2
      )}€ (${expectedCanariasPrice} céntimos)`
    );
    console.log(
      `   Conversión: ${
        item.unit_price === expectedCanariasPrice
          ? "✅ CORRECTA"
          : "❌ INCORRECTA"
      }`
    );

    // Esperar persistencia automática
    console.log(`\n⏳ Esperando auto-persistencia...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verificar si se persistió
    updatedCart = await medusa.carts.retrieve(cart.id);
    const persistedItem = updatedCart.items[0];
    console.log(`📊 DESPUÉS DE AUTO-PERSISTENCIA:`);
    console.log(
      `   Unit price: ${(persistedItem.unit_price / 100).toFixed(2)}€`
    );
    console.log(
      `   Metadata: canarias_prices_persisted = ${updatedCart.metadata?.canarias_prices_persisted}`
    );

    // Agregar shipping
    const shippingOptions = await medusa.shippingOptions.listCartOptions(
      cart.id
    );
    if (shippingOptions.shipping_options.length > 0) {
      await medusa.carts.addShippingMethod(cart.id, {
        option_id: shippingOptions.shipping_options[0].id,
      });
      console.log(`✅ Shipping method agregado`);
    }

    // Crear payment sessions
    await medusa.carts.createPaymentSessions(cart.id);
    await medusa.carts.setPaymentSession(cart.id, { provider_id: "manual" });
    console.log(`✅ Payment configurado`);

    // ÚLTIMO RETRIEVE ANTES DE COMPLETAR
    const finalCartCheck = await medusa.carts.retrieve(cart.id);
    const finalItem = finalCartCheck.items[0];
    console.log(`\n📊 ÚLTIMO CHECK ANTES DE COMPLETAR:`);
    console.log(`   Unit price: ${(finalItem.unit_price / 100).toFixed(2)}€`);
    console.log(
      `   Metadata persisted: ${finalCartCheck.metadata?.canarias_prices_persisted}`
    );

    // Completar carrito y crear orden
    console.log(`\n🎯 COMPLETANDO CARRITO...`);
    const order = await medusa.carts.complete(cart.id);

    console.log(`\n🏆 ORDEN COMPLETADA: ${order.id}`);
    console.log(`\n📊 ANÁLISIS PRECIOS EN ORDEN FINAL:`);

    const orderItem = order.items[0];
    const orderUnitPrice = orderItem.unit_price;
    const taxTotal = order.tax_total;
    const orderTotal = order.total;

    console.log(
      `   💰 Unit price en orden: ${(orderUnitPrice / 100).toFixed(
        2
      )}€ (${orderUnitPrice} céntimos)`
    );
    console.log(
      `   🏛️  Tax total: ${(taxTotal / 100).toFixed(2)}€ (${taxTotal} céntimos)`
    );
    console.log(
      `   📊 Total orden: ${(orderTotal / 100).toFixed(
        2
      )}€ (${orderTotal} céntimos)`
    );

    // VALIDACIÓN FINAL
    const unitPriceCorrect = orderUnitPrice === expectedCanariasPrice;
    const taxCorrect = taxTotal === 0;

    console.log(`\n🎯 RESULTADO FINAL:`);
    if (unitPriceCorrect && taxCorrect) {
      console.log(`   ✅ SUCCESS: Precios Canarias correctos en la orden`);
      console.log(
        `      - Unit price: ${(orderUnitPrice / 100).toFixed(2)}€ ✓`
      );
      console.log(`      - Tax total: ${(taxTotal / 100).toFixed(2)}€ ✓`);
    } else {
      console.log(`   ❌ PROBLEMA: Precios incorrectos en la orden final`);
      console.log(
        `      - Unit price: ${(orderUnitPrice / 100).toFixed(2)}€ ${
          unitPriceCorrect
            ? "✓"
            : "✗ (esperado " + (expectedCanariasPrice / 100).toFixed(2) + "€)"
        }`
      );
      console.log(
        `      - Tax total: ${(taxTotal / 100).toFixed(2)}€ ${
          taxCorrect ? "✓" : "✗ (esperado 0.00€)"
        }`
      );
      console.log(`\n🔍 DIAGNÓSTICO:`);
      console.log(`      - La conversión in-memory funciona en el carrito`);
      console.log(`      - Pero los precios NO se persistieron en la BD`);
      console.log(
        `      - Medusa crea la orden con datos de BD, no del carrito en memoria`
      );
    }

    // Cleanup
    await medusa.admin.orders.cancel(order.id);
    console.log(`🧹 Orden cancelada`);
  } catch (error) {
    console.error(`❌ ERROR:`, error.message);
    if (error.response?.data) {
      console.error("Data:", error.response.data);
    }
  }
}

testOrderFinalPrices().catch(console.error);
