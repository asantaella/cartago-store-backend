#!/usr/bin/env node

import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import Stripe from "stripe";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "../../.env.local") });

const stripeApiKey = process.env.STRIPE_API_KEY;

if (!stripeApiKey) {
  console.error("STRIPE_API_KEY no esta definido en .env.local");
  process.exit(1);
}

function getCliAccountId() {
  try {
    const output = execFileSync("stripe", ["config", "--list"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const defaultSectionMatch = output.match(/\[default\]([\s\S]*)$/);
    const targetSection = defaultSectionMatch?.[1] ?? output;
    const accountIdMatch = targetSection.match(/account_id = '([^']+)'/);

    return accountIdMatch?.[1] ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`No se pudo leer la configuracion de Stripe CLI: ${message}`);
    process.exit(1);
  }
}

async function main() {
  const stripe = new Stripe(stripeApiKey);
  const backendAccount = await stripe.accounts.retrieve();
  const cliAccountId = getCliAccountId();

  console.log(`Backend account: ${backendAccount.id}`);
  console.log(`CLI account: ${cliAccountId ?? "no detectada"}`);

  if (!cliAccountId) {
    console.error("No se pudo detectar la account_id de Stripe CLI.");
    process.exit(1);
  }

  if (cliAccountId !== backendAccount.id) {
    console.error(
      "DESALINEADO: Stripe CLI y el backend apuntan a cuentas distintas.",
    );
    console.error(
      "Usa: npm run stripe:listen:local para escuchar con la misma STRIPE_API_KEY del backend.",
    );
    process.exit(2);
  }

  console.log("OK: Stripe CLI y el backend apuntan a la misma cuenta.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
