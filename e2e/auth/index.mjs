import Medusa from "@medusajs/medusa-js";
import dotenv from "dotenv";

dotenv.config({ path: process.cwd() + "/.env" });
dotenv.config({ path: process.cwd() + "/.env.local", override: false });

const medusa = new Medusa({
  baseUrl: process.env.MEDUSA_BACKEND_URL,
  maxRetries: 3,
});

export { medusa };
