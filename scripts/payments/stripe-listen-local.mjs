#!/usr/bin/env node

import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "../../.env.local") });

const stripeApiKey = process.env.STRIPE_API_KEY;
const forwardTo =
  process.env.STRIPE_WEBHOOK_FORWARD_TO || "http://localhost:9000/stripe/hooks";

if (!stripeApiKey) {
  console.error("STRIPE_API_KEY no esta definido en .env.local");
  process.exit(1);
}

const args = [
  "listen",
  "--api-key",
  stripeApiKey,
  "--events",
  "*",
  "--forward-to",
  forwardTo,
];

console.log(`Reenviando webhooks de Stripe a ${forwardTo}`);

const child = spawn("stripe", args, {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(`No se pudo ejecutar Stripe CLI: ${error.message}`);
  process.exit(1);
});
