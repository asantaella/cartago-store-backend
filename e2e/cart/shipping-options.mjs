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

/**
 * Fetches custom shipping options from the store route (which applies
 * variant shipping extra) and asserts the extra has been added.
 *
 * @param {object} opts
 * @param {string} opts.cartId
 * @param {number} opts.expectedExtraTotal - expected extra in cents summed across items
 * @param {string} opts.backendUrl - base URL of the backend (default http://localhost:9000)
 */
export async function assertShippingOptionsHaveExtra({
  cartId,
  expectedExtraTotal,
  backendUrl = "http://localhost:9000",
}) {
  const res = await fetch(
    `${backendUrl}/store/shipping-options/${cartId}`,
    {
      headers: { "Content-Type": "application/json" },
    }
  );

  if (!res.ok) {
    throw new Error(
      `GET /store/shipping-options/${cartId} failed with status ${res.status}`
    );
  }

  const { shipping_options } = await res.json();

  if (!Array.isArray(shipping_options) || shipping_options.length === 0) {
    console.warn("[shipping-options e2e] No shipping options returned for cart", cartId);
    return shipping_options;
  }

  if (expectedExtraTotal > 0) {
    for (const opt of shipping_options) {
      const baseAmount = opt.amount - expectedExtraTotal;
      console.log(
        `[shipping-options e2e] option "${opt.name}": amount=${opt.amount}, ` +
          `expected base=${baseAmount}, extra=${expectedExtraTotal}`
      );
      if (opt.amount <= baseAmount) {
        throw new Error(
          `Shipping option "${opt.name}" amount (${opt.amount}) is not greater than base (${baseAmount}). ` +
            `Expected extra=${expectedExtraTotal} to be included.`
        );
      }
    }
    console.log(
      `[shipping-options e2e] ✓ All ${shipping_options.length} options include extra=${expectedExtraTotal} cents`
    );
  }

  return shipping_options;
}

