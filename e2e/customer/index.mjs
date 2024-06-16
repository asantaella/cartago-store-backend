import { medusa } from "../auth/index.mjs";
import { createCustomer as create } from "../customer/create.mjs";

await medusa.admin.auth.getToken({
  email: "cartago4x4@gmail.com",
  password: "suru",
});

let customer = null;
let customer_data = {
  first_name: "John",
  last_name: "McClain",
  email: "a.santaella.m+3@gmail.com",
  password: "supersecret",
};

export const createCustomer = () =>
  create(medusa, { customer: customer_data }).then((customer) =>
    console.log("[CREATED] Customer: ", customer)
  );
