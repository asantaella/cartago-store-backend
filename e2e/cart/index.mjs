import { medusa } from "../auth/index.mjs";
import { createCart } from "./create.mjs";
import { completeCart } from "./complete.mjs";
import { updateCart } from "./update.mjs";
import { addShippingOption } from "./shipping-options.mjs";
import { addDiscount } from "./discounts.mjs";
import {
  selectPaymentSession,
  createPaymentSession,
} from "./payment-session.mjs";

// customer hotmail
const customer_id = "cus_01J1Z8H31J0DBXA7P1KRPXHN26";

//customer gmail
//const customer_id = "cus_01JC1NKNV78B8Z6ZZW7Q6TFAWP";

const provider_id = "manual";

await medusa.admin.auth.getToken({
  email: "cartago4x4@gmail.com",
  password: "suru",
});

console.log("ORDER [COMPLETING]...");

let cart = null;

const { customer } = await medusa.admin.customers.retrieve(customer_id);

// if (!customers) {
//   const customer = await createCustomer();
//   customer = await medusa.admin.customers.retrieve(customer.id);
// } else {
// customer = customers.customers[0];
//}

const products = await medusa.admin.products.list({ limit: 5 });

const items = [
  {
    variant_id: products.products[0].variants[0].id,
    quantity: 2,
  },
  {
    variant_id: products.products[1].variants[0].id,
    quantity: 1,
  },
];

cart = await createCart(medusa, { items });

cart = await createPaymentSession(medusa, { cartId: cart.id });

cart = await selectPaymentSession(medusa, { cartId: cart.id, provider_id });

cart = await addShippingOption(medusa, cart.id);

// First update the cart with customer information
cart = await updateCart(medusa, {
  cartId: cart.id,
  customer_id: customer.id,
});

// Then explicitly add the discount code using the dedicated function
cart = await addDiscount(medusa, {
  cartId: cart.id,
  discountCode: "CARTAGO_10",
});

// Verify the discount was applied
if (!cart.discounts || cart.discounts.length === 0) {
  console.log("Warning: Discount code CARTAGO_10 was not applied");
} else {
  console.log("Discount code applied successfully.");
}

cart = await completeCart(medusa, { cartId: cart.id });

console.log("ORDER [PLACED]");
