import Medusa from "@medusajs/medusa-js";
import dotenv from "dotenv";

//dotenv.config({ path: process.cwd() + "/.env" });
dotenv.config({ path: process.cwd() + "/.env.production" });

console.log("Connecting to... ", process.env.MEDUSA_BACKEND_URL);
const medusa = new Medusa({
  baseUrl: process.env.MEDUSA_BACKEND_URL,
  maxRetries: 3,
});

export { medusa };
