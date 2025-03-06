import { medusa } from "../auth/index.mjs";

await medusa.admin.auth.getToken({
  email: "cartago4x4@gmail.com",
  password: "suru",
});

let customer_data = {
  first_name: "John",
  last_name: "McClain",
  email: "a.santaella.m@gmail.com",
  password: "supersecret",
};

const _createCustomer = (medusa, { customer }) =>
   medusa.customers.create({ ...customer }).then(({ customer }) => {
    return customer;
  });

const _generatePasswordToken = (medusa, { email }) =>
  medusa.customers.generatePasswordToken({
    email,
  });

export const createCustomer = () =>
  _createCustomer(medusa, { customer: customer_data })
    .then(() => {
      console.log("[CUSTOMER] Customer created successfully");
    })
    .catch((e) => {
      console.error("[CUSTOMER] Failed customer create", e);
    });

export const generatePasswordToken = async () =>
  _generatePasswordToken(medusa, { email: customer_data.email })
    .then(() => {
      console.log("[CUSTOMER] Password token generated successfully");
    })
    .catch((e) => {
      console.error("[CUSTOMER] Failed password token generate", e);
    });

await generatePasswordToken();
