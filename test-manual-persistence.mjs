import { medusa } from "./e2e/auth/index.mjs";

async function testManualPersistence() {
  console.log("=== TEST PERSISTENCIA MANUAL ===");

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

    // Crear carrito
    const cart = await medusa.carts.create({
      region_id: regions[0].id,
    });
    console.log(`✅ Carrito creado: ${cart.id}`);

    // Establecer dirección de Canarias
    await medusa.carts.update(cart.id, {
      email: "test@canarias.com",
      shipping_address: {
        first_name: "Test",
        last_name: "Canarias",
        address_1: "Calle Test 123",
        city: "Santa Cruz de Tenerife",
        province: "Santa Cruz de Tenerife",
        postal_code: "38100",
        country_code: "es",
      },
    });
    console.log(`✅ Dirección Canarias establecida`);

    // Agregar productos
    await medusa.carts.lineItems.create(cart.id, {
      variant_id: variant.id,
      quantity: 1,
    });
    console.log(`✅ Producto agregado`);

    // Verificar conversión in-memory
    let updatedCart = await medusa.carts.retrieve(cart.id);
    const item = updatedCart.items[0];

    console.log(`\n📊 DESPUÉS DE CONVERSIÓN IN-MEMORY:`);
    console.log(
      `   Unit price: ${(item.unit_price / 100).toFixed(2)}€ (${
        item.unit_price
      } céntimos)`
    );
    console.log(
      `   Conversión: ${
        item.unit_price === expectedCanariasPrice
          ? "✅ CORRECTA"
          : "❌ INCORRECTA"
      }`
    );

    // LLAMAR ENDPOINT MANUAL PARA PERSISTIR
    console.log(`\n🔧 PERSISTIENDO MANUALMENTE...`);
    try {
      const persistResponse = await fetch(
        `http://localhost:9000/admin/debug/persist-canarias-prices/${cart.id}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${medusa.client.config.apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      const persistData = await persistResponse.json();
      if (persistResponse.ok) {
        console.log(`✅ Persistencia manual exitosa:`, persistData.message);
      } else {
        console.log(`❌ Error en persistencia:`, persistData.message);
      }
    } catch (persistError) {
      console.log(
        `❌ Error llamando endpoint de persistencia:`,
        persistError.message
      );
    }

    // Verificar que se persistió
    updatedCart = await medusa.carts.retrieve(cart.id);
    const persistedItem = updatedCart.items[0];
    console.log(`\n📊 DESPUÉS DE PERSISTENCIA MANUAL:`);
    console.log(
      `   Unit price: ${(persistedItem.unit_price / 100).toFixed(2)}€`
    );
    console.log(
      `   Metadata persisted: ${updatedCart.metadata?.canarias_prices_persisted}`
    );

    // Continuar con el flujo normal hasta crear la orden
    console.log(`\n🚚 Agregando shipping y payment...`);

    const shippingOptions = await medusa.shippingOptions.listCartOptions(
      cart.id
    );
    if (shippingOptions.shipping_options.length > 0) {
      await medusa.carts.addShippingMethod(cart.id, {
        option_id: shippingOptions.shipping_options[0].id,
      });
    }

    await medusa.carts.createPaymentSessions(cart.id);
    await medusa.carts.setPaymentSession(cart.id, { provider_id: "manual" });

    // COMPLETAR CARRITO
    console.log(`\n🎯 COMPLETANDO CARRITO...`);
    const order = await medusa.carts.complete(cart.id);

    console.log(`\n🏆 ORDEN COMPLETADA: ${order.id}`);

    const orderItem = order.items[0];
    const orderUnitPrice = orderItem.unit_price;
    const taxTotal = order.tax_total;

    console.log(`\n📊 PRECIOS EN ORDEN FINAL:`);
    console.log(
      `   💰 Unit price: ${(orderUnitPrice / 100).toFixed(
        2
      )}€ (${orderUnitPrice} céntimos)`
    );
    console.log(
      `   🏛️  Tax total: ${(taxTotal / 100).toFixed(2)}€ (${taxTotal} céntimos)`
    );

    // VALIDACIÓN FINAL
    const unitPriceCorrect = orderUnitPrice === expectedCanariasPrice;
    const taxCorrect = taxTotal === 0;

    console.log(`\n🎯 RESULTADO FINAL:`);
    if (unitPriceCorrect && taxCorrect) {
      console.log(`   ✅ SUCCESS: Persistencia manual funcionó correctamente`);
      console.log(
        `      - Unit price: ${(orderUnitPrice / 100).toFixed(2)}€ ✓`
      );
      console.log(`      - Tax total: ${(taxTotal / 100).toFixed(2)}€ ✓`);
    } else {
      console.log(`   ❌ FAIL: La persistencia manual no funcionó`);
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
    }

    // Cleanup
    await medusa.admin.orders.cancel(order.id);
    console.log(`🧹 Orden cancelada`);
  } catch (error) {
    console.error(`❌ ERROR:`, error.message);
  }
}

testManualPersistence().catch(console.error);
