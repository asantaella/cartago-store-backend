import { medusa } from "./e2e/auth/index.mjs";

async function testPersistenceIssue() {
  console.log("=== DEBUG: PROBLEMA DE PERSISTENCIA ===");

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
    const region = regionsResponse.regions[0];
    const variant = product.variants[0];

    console.log(`📦 Producto: ${product.title}`);
    console.log(
      `💰 Precio original en BD: ${(variant.prices[0].amount / 100).toFixed(
        2
      )}€`
    );

    // Crear carrito
    const cartResponse = await medusa.carts.create({ region_id: region.id });
    const cart = cartResponse.cart;
    console.log(`✅ Carrito creado: ${cart.id}`);

    // Agregar producto
    try {
      const lineItemResponse = await medusa.carts.lineItems.create(cart.id, {
        variant_id: variant.id,
        quantity: 1,
      });
      console.log(`✅ Producto agregado al carrito`);
      console.log(`🔍 Response:`, lineItemResponse ? "OK" : "NULL");
    } catch (lineItemError) {
      console.log(`❌ Error agregando producto:`, lineItemError.message);
      if (lineItemError.response?.data) {
        console.log(`   Data:`, lineItemError.response.data);
      }
      return;
    }

    // PASO 1: Ver precio antes de direccion Canarias
    let updatedCart = await medusa.carts.retrieve(cart.id, {
      expand: "items,items.variant,items.variant.product,shipping_address",
    });
    console.log(`\n📊 ANTES de dirección Canarias:`);
    console.log(
      `🔍 Items length: ${updatedCart.items ? updatedCart.items.length : 0}`
    );
    if (updatedCart.items && updatedCart.items.length > 0) {
      console.log(
        `   Precio line item: ${(updatedCart.items[0].unit_price / 100).toFixed(
          2
        )}€`
      );
    } else {
      console.log(
        `   ❌ Sin items en el carrito - error en línea de productos`
      );
      console.log(`   Cart object:`, JSON.stringify(updatedCart, null, 2));
      return;
    }

    // PASO 2: Establecer dirección Canarias
    await medusa.carts.update(cart.id, {
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

    console.log(`✅ Dirección Canarias establecida`);

    // PASO 3: Ver precio después de dirección Canarias (esto dispara conversión in-memory)
    updatedCart = await medusa.carts.retrieve(cart.id);
    console.log(`\n📊 DESPUÉS de dirección Canarias (retrieve):`);
    console.log(
      `   Precio line item: ${(updatedCart.items[0].unit_price / 100).toFixed(
        2
      )}€`
    );
    console.log(`   Postal code: ${updatedCart.shipping_address?.postal_code}`);
    console.log(`   Cart metadata: ${JSON.stringify(updatedCart.metadata)}`);

    // PASO 4: Esperar para que auto-persistencia termine
    console.log(`\n⏳ Esperando auto-persistencia...`);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // PASO 5: Obtener carrito de nuevo para verificar persistencia
    updatedCart = await medusa.carts.retrieve(cart.id);
    console.log(`\n📊 DESPUÉS de esperar auto-persistencia:`);
    console.log(
      `   Precio line item: ${(updatedCart.items[0].unit_price / 100).toFixed(
        2
      )}€`
    );
    console.log(`   Cart metadata: ${JSON.stringify(updatedCart.metadata)}`);

    // PASO 6: Verificar directamente en BD usando admin API
    console.log(`\n🔍 VERIFICACIÓN DIRECTA EN BD:`);
    try {
      const adminCart = await medusa.admin.carts.retrieve(cart.id);
      console.log(
        `   Admin view - Precio line item: ${(
          adminCart.cart.items[0].unit_price / 100
        ).toFixed(2)}€`
      );
      console.log(
        `   Admin view - Cart metadata: ${JSON.stringify(
          adminCart.cart.metadata
        )}`
      );
    } catch (adminError) {
      console.log(
        `   ❌ No se pudo obtener vista admin: ${adminError.message}`
      );
    }

    // PASO 7: Agregar shipping y completar orden para ver el problema final
    console.log(`\n🚚 Agregando shipping...`);
    const shippingOptions = await medusa.shippingOptions.listCartOptions(
      cart.id
    );
    if (shippingOptions.shipping_options.length > 0) {
      await medusa.carts.addShippingMethod(cart.id, {
        option_id: shippingOptions.shipping_options[0].id,
      });
    }

    // Crear payment session y completar
    await medusa.carts.createPaymentSessions(cart.id);
    const cartWithPayment = await medusa.carts.retrieve(cart.id);

    await medusa.carts.setPaymentSession(cart.id, {
      provider_id: "manual",
    });

    console.log(`\n📊 ANTES de completar orden (último retrieve):`);
    const finalCartCheck = await medusa.carts.retrieve(cart.id);
    console.log(
      `   Precio line item: ${(
        finalCartCheck.items[0].unit_price / 100
      ).toFixed(2)}€`
    );

    // Completar orden
    const order = await medusa.carts.complete(cart.id);
    console.log(`\n🎯 ORDEN COMPLETADA: ${order.id}`);
    console.log(`📊 PRECIOS EN LA ORDEN FINAL:`);
    console.log(
      `   Unit price orden: ${(order.items[0].unit_price / 100).toFixed(2)}€`
    );
    console.log(`   Tax total: ${(order.tax_total / 100).toFixed(2)}€`);
    console.log(`   Total orden: ${(order.total / 100).toFixed(2)}€`);

    // Comparación
    const expectedPrice = 826; // 8.26€
    const actualPrice = order.items[0].unit_price;

    if (actualPrice === expectedPrice) {
      console.log(`\n✅ SUCCESS: Precio correcto en orden final`);
    } else {
      console.log(`\n❌ PROBLEMA: Precio incorrecto en orden final`);
      console.log(`   Esperado: ${(expectedPrice / 100).toFixed(2)}€`);
      console.log(`   Actual: ${(actualPrice / 100).toFixed(2)}€`);
      console.log(`   → La persistencia NO está funcionando`);
    }

    // Cleanup
    await medusa.admin.orders.cancel(order.id);
  } catch (error) {
    console.error(`❌ ERROR:`, error.message);
  }
}

testPersistenceIssue().catch(console.error);
