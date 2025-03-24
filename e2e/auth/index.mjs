import Medusa from "@medusajs/medusa-js";
import dotenv from "dotenv";

//dotenv.config({ path: process.cwd() + "/.env" });
dotenv.config({ path: process.cwd() + "/.env.local" });

console.log("Connecting to... ", process.env.MEDUSA_BACKEND_URL);
const medusa = new Medusa({
  baseUrl: process.env.MEDUSA_BACKEND_URL,
  maxRetries: 3,
});

const { access_token } = await medusa.admin.auth.getToken({
  email: "cartago4x4@gmail.com",
  password: "suru",
});

console.log("Token response:", JSON.stringify(access_token, null, 2));

export { medusa };
