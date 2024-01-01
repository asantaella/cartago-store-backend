import Medusa from "@medusajs/medusa-js";
const medusa = new Medusa({
  baseUrl: "http://localhost:9000",
  maxRetries: 3,
});
await medusa.admin.auth.getToken({
  email: "admin@medusa-test.com",
  password: "supersecret",
});
