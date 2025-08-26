import { medusa } from "./e2e/auth/index.mjs";

async function testCanariasComplete() {
  console.log("=== TEST COMPLETE CON DIRECCIÓN CANARIAS ===");

  try {
    console.log("1. Authenticating...");
    await medusa.admin.auth.getToken({
      email: "cartago4x4@gmail.com",
      password: "suru",
    });
    console.log("✅ Auth successful");

    console.log("2. Getting specific product and regions...");
    const productId = "prod_01HZZEK1KRVMSSZGRZQQ2W08J0";

    const [productResponse, regionsResponse] = await Promise.all([
      medusa.admin.products.retrieve(productId),
      medusa.admin.regions.list(),
    ]);

    const product = productResponse.product;
    const regions = regionsResponse.regions;
    console.log(
      `✅ Product: ${product.title} - Variants: ${product.variants.length}`
    );
    console.log(`✅ Regions: ${regions.length}`);

    // Mostrar precio original del producto
    const variant = product.variants[0];
    const originalPrice =
      variant.prices.find((p) => p.currency_code === "eur")?.amount || 0;
    console.log(
      `📦 Original price: ${originalPrice} céntimos (${originalPrice / 100}€)`
    );

    // Calcular precio esperado para Canarias (sin IVA)
    const expectedCanariasPrice = Math.round(originalPrice / 1.21);
    console.log(
      `🏝️  Expected Canarias price: ${expectedCanariasPrice} céntimos (${
        expectedCanariasPrice / 100
      }€)`
    );

    console.log("3. Creating cart...");
    const { cart } = await medusa.carts.create({
      region_id: regions[0].id,
      items: [{ variant_id: variant.id, quantity: 1 }],
    });
    console.log(`✅ Cart created: ${cart.id}`);

    console.log(
      "4. Setting CANARIAS address (38100 - Santa Cruz de Tenerife)..."
    );
    await medusa.carts.update(cart.id, {
      shipping_address: {
        first_name: "María",
        last_name: "González",
        address_1: "Calle Real 123",
        city: "Santa Cruz de Tenerife",
        postal_code: "38100", // ⭐ CÓDIGO POSTAL DE CANARIAS
        country_code: "es",
        phone: "922123456",
      },
      billing_address: {
        first_name: "María",
        last_name: "González",
        address_1: "Calle Real 123",
        city: "Santa Cruz de Tenerife",
        postal_code: "38100",
        country_code: "es",
        phone: "922123456",
      },
      email: "maria@canarias.com",
    });
    console.log("✅ Canarias addresses set");

    console.log("5. Retrieving cart to check price conversion...");
    const { cart: cartWithCanarias } = await medusa.carts.retrieve(cart.id);
    const item = cartWithCanarias.items[0];

    console.log("\n📊 ANÁLISIS DE PRECIOS DESPUÉS DE CONVERSIÓN:");
    console.log(
      `   Original unit_price: ${originalPrice} céntimos (${
        originalPrice / 100
      }€)`
    );
    console.log(
      `   Converted unit_price: ${item.unit_price} céntimos (${
        item.unit_price / 100
      }€)`
    );
    console.log(
      `   Expected: ${expectedCanariasPrice} céntimos (${
        expectedCanariasPrice / 100
      }€)`
    );
    console.log(
      `   ✅ Price conversion: ${
        item.unit_price === expectedCanariasPrice ? "CORRECTO" : "INCORRECTO"
      }`
    );
    console.log(
      `   🏝️  Canarias flag: ${
        item.metadata?._canarias_converted_in_memory ? "SÍ" : "NO"
      }`
    );

    console.log("6. Adding shipping...");
    const { shipping_options } = await medusa.shippingOptions.listCartOptions(
      cart.id
    );

    // Detectar precio original de la shipping option y calcular esperado Canarias
    const origShippingPrice =
      (shipping_options &&
        shipping_options[0] &&
        (shipping_options[0].amount || shipping_options[0].price)) ||
      0;
    const expectedCanariasShipping = Math.round(origShippingPrice / 1.21);
    console.log(
      `   Original shipping option price: ${origShippingPrice} céntimos (${
        origShippingPrice / 100
      }€)`
    );
    console.log(
      `   Expected Canarias shipping price: ${expectedCanariasShipping} céntimos (${
        expectedCanariasShipping / 100
      }€)`
    );

    await medusa.carts.addShippingMethod(cart.id, {
      option_id: shipping_options[0].id,
    });
    console.log("✅ Shipping added");

    console.log("7. Creating payment sessions...");
    const { cart: cartWithPayment } = await medusa.carts.createPaymentSessions(
      cart.id
    );
    console.log("✅ Payment sessions created");

    console.log("8. Selecting manual payment...");
    await medusa.carts.setPaymentSession(cartWithPayment.id, {
      provider_id: "manual",
    });
    console.log("✅ Payment method selected");

    console.log("8.5. Authorizing payment session...");
    await medusa.carts.authorizePayment(cartWithPayment.id);
    console.log("✅ Payment authorized");

    console.log("9. Final cart state before complete...");
    const { cart: finalCart } = await medusa.carts.retrieve(cartWithPayment.id);
    const finalItem = finalCart.items[0];
    const shippingMethod = finalCart.shipping_methods[0];

    console.log("\n📋 ESTADO FINAL DEL CARRITO:");
    console.log(
      `   Item unit_price: ${finalItem.unit_price} céntimos (${
        finalItem.unit_price / 100
      }€)`
    );
    console.log(`   Item quantity: ${finalItem.quantity}`);
    console.log(
      `   Item total: ${finalItem.total} céntimos (${finalItem.total / 100}€)`
    );
    console.log(
      `   Shipping price: ${shippingMethod.price} céntimos (${
        shippingMethod.price / 100
      }€)`
    );
    console.log(
      `   ✅ Shipping conversion in cart: ${
        shippingMethod.price === expectedCanariasShipping
          ? "CORRECTO"
          : "INCORRECTO"
      } (esperado: ${expectedCanariasShipping}, actual: ${
        shippingMethod.price
      })`
    );
    console.log(
      `   Cart subtotal: ${finalCart.subtotal} céntimos (${
        finalCart.subtotal / 100
      }€)`
    );
    console.log(
      `   Cart tax_total: ${finalCart.tax_total} céntimos (${
        finalCart.tax_total / 100
      }€)`
    );
    console.log(
      `   Cart total: ${finalCart.total} céntimos (${finalCart.total / 100}€)`
    );

    console.log("10. Attempting complete...");
    const startTime = Date.now();

    const result = await medusa.carts.complete(finalCart.id);
    const elapsed = Date.now() - startTime;

    console.log(`🎉 SUCCESS in ${elapsed}ms!`);
    console.log("Result type:", result.type);

    if (result.type === "order") {
      const order = result.data;
      console.log("\n🧾 ANÁLISIS DE LA ORDEN CREADA:");
      console.log(`   Order ID: ${order.id}`);
      console.log(`   Order status: ${order.status}`);
      console.log(`   Payment status: ${order.payment_status}`);

      // Analizar items de la orden
      const orderItem = order.items[0];
      console.log(
        `   Order item unit_price: ${orderItem.unit_price} céntimos (${
          orderItem.unit_price / 100
        }€)`
      );
      console.log(
        `   Order item total: ${orderItem.total} céntimos (${
          orderItem.total / 100
        }€)`
      );

      // Analizar totales de la orden
      console.log(
        `   Order subtotal: ${order.subtotal} céntimos (${
          order.subtotal / 100
        }€)`
      );
      console.log(
        `   Order tax_total: ${order.tax_total} céntimos (${
          order.tax_total / 100
        }€)`
      );
      console.log(
        `   Order shipping_total: ${order.shipping_total} céntimos (${
          order.shipping_total / 100
        }€)`
      );
      console.log(
        `   Order total: ${order.total} céntimos (${order.total / 100}€)`
      );

      // Validaciones
      console.log("\n🔍 VALIDACIONES:");
      console.log(
        `   ✅ Item price correcto: ${
          orderItem.unit_price === expectedCanariasPrice ? "SÍ" : "NO"
        } (esperado: ${expectedCanariasPrice}, actual: ${orderItem.unit_price})`
      );
      console.log(
        `   ✅ Tax total = 0€: ${
          order.tax_total === 0 ? "SÍ" : "NO"
        } (actual: ${order.tax_total} céntimos)`
      );
      console.log(
        `   ✅ Shipping address Canarias: ${
          order.shipping_address.postal_code === "38100" ? "SÍ" : "NO"
        }`
      );

      // Validar precio de envío en la orden
      console.log(
        ` ✅ Order shipping_total: ${order.shipping_total} céntimos (${
          order.shipping_total / 100
        }€)`
      );
      console.log(
        `   ✅ Shipping price en orden correcto: ${
          order.shipping_total === expectedCanariasShipping ? "SÍ" : "NO"
        } (esperado: ${expectedCanariasShipping}, actual: ${
          order.shipping_total
        })`
      );

      // Verificar que el precio final es correcto
      // Total original basado en precio final en la orden
      const originalTotal = originalPrice + (shippingMethod.price || 0);
      // Total esperado: item convertido + precio original de la shipping option (según especificación)
      const expectedTotal = expectedCanariasPrice + expectedCanariasShipping;

      console.log(
        `   Total original: ${originalTotal} céntimos (${originalTotal / 100}€)`
      );
      console.log(
        `   Total esperado: ${expectedTotal} céntimos (${expectedTotal / 100}€)`
      );

      console.log(
        `   ✅ Total correcto: ${
          order.total === expectedTotal ? "SÍ" : "NO"
        } (esperado: ${expectedTotal}, actual: ${order.total})`
      );

      if (
        orderItem.unit_price === expectedCanariasPrice &&
        order.tax_total === 0
      ) {
        console.log(
          "\n🏆 ¡ÉXITO! La conversión de precios para Canarias funciona correctamente"
        );
      } else {
        console.log(
          "\n⚠️  ADVERTENCIA: Los precios no coinciden con lo esperado"
        );
      }
    }
  } catch (error) {
    console.log("❌ ERROR:");
    console.log("Message:", error.message);
    console.log("Status:", error.response?.status);
    console.log("Data:", error.response?.data);
  }
}

testCanariasComplete();
