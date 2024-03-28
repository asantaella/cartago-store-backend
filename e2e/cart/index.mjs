import { medusa } from "../auth/index.mjs";
import { createCart } from "./create.mjs";
import { completeCart } from "./complete.mjs";
import { updateCart } from "./update.mjs";
import {
  selectPaymentSession,
  createPaymentSession,
} from "./payment-session.mjs";

const customer_id = "cus_01HT074PQ9W5PFAJ4ZXCZVN5CH";
const items = [
  {
    variant_id: "variant_01HSM89Y2E3NM9VPZSA1JHF7G2",
    quantity: 1,
  },
  // {
  //   variant_id: "variant_01HS6P594QGDEGABNDCFXW7A6C",
  //   quantity: 1,
  // },
];
const provider_id = "manual";

await medusa.admin.auth.getToken({
  email: "cartago4x4@gmail.com",
  password: "suru",
});

console.log("ORDER [COMPLETING]...");

let cart = null;

cart = await createCart(medusa, { items });

cart = await createPaymentSession(medusa, { cartId: cart.id });

cart = await selectPaymentSession(medusa, { cartId: cart.id, provider_id });

cart = await updateCart(medusa, { cartId: cart.id, customer_id });

cart = await completeCart(medusa, { cartId: cart.id });

console.log("ORDER [PLACED]");
