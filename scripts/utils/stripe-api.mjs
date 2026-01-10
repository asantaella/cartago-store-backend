/**
 * Helpers para interactuar con la API de Stripe desde scripts de testing.
 */

import Stripe from "stripe";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "../../.env.local") });

const STRIPE_API_KEY = process.env.STRIPE_API_KEY;

if (!STRIPE_API_KEY) {
  throw new Error("STRIPE_API_KEY no está definido en el entorno");
}

const stripe = new Stripe(STRIPE_API_KEY, {
  apiVersion: "2022-11-15",
});

export async function createPaymentIntent(
  cartId,
  amount,
  currency,
  metadata = {}
) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount),
    currency: currency.toLowerCase(),
    metadata: {
      cart_id: cartId,
      resource_id: cartId,
      ...metadata,
    },
    capture_method: "automatic",
  });

  console.log(`✓ PaymentIntent creado: ${paymentIntent.id}`);
  return paymentIntent;
}

export async function createSepaPaymentIntent(
  cartId,
  amount,
  currency,
  customerEmail,
  metadata = {}
) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount),
    currency: currency.toLowerCase(),
    payment_method_types: ["sepa_debit"],
    metadata: {
      cart_id: cartId,
      resource_id: cartId,
      ...metadata,
    },
    receipt_email: customerEmail,
    setup_future_usage: "off_session",
  });

  console.log(`✓ SEPA PaymentIntent creado: ${paymentIntent.id}`);
  return paymentIntent;
}

export async function confirmPaymentIntent(
  paymentIntentId,
  paymentMethodId = "pm_card_visa"
) {
  console.log(
    `✓ Confirmando PaymentIntent ${paymentIntentId} con PaymentMethod ${paymentMethodId}`
  );

  const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
    payment_method: paymentMethodId,
    return_url: "http://localhost:9000/store/orders/confirm",
  });

  console.log(`✓ PaymentIntent confirmado: ${paymentIntent.id}`);
  return paymentIntent;
}

export async function confirmSepaPaymentIntent(
  paymentIntentId,
  iban = "DE89370400440532013000",
  name = "Juan Pérez",
  email = "test@example.com",
  paymentMethodId = null,
  mandateData = null
) {
  let paymentMethod = paymentMethodId;

  if (!paymentMethod) {
    const createdPaymentMethod = await stripe.paymentMethods.create({
      type: "sepa_debit",
      sepa_debit: {
        iban,
      },
      billing_details: {
        name,
        email,
      },
    });

    console.log(`✓ PaymentMethod SEPA creado: ${createdPaymentMethod.id}`);
    paymentMethod = createdPaymentMethod.id;
  } else {
    console.log(`✓ Usando PaymentMethod SEPA existente: ${paymentMethod}`);
  }

  const confirmPayload = {
    payment_method: paymentMethod,
    return_url: "http://localhost:9000/store/orders/confirm",
  };

  const defaultMandateData = {
    customer_acceptance: {
      type: "online",
      online: {
        ip_address: "127.0.0.1",
        user_agent: "Stripe-Test-Script/1.0",
      },
    },
  };

  const mandateDetails =
    mandateData ?? (!paymentMethodId ? defaultMandateData : undefined);

  if (mandateDetails) {
    confirmPayload.mandate_data = mandateDetails;
  }

  const paymentIntent = await stripe.paymentIntents.confirm(
    paymentIntentId,
    confirmPayload
  );

  console.log(`✓ SEPA PaymentIntent confirmado: ${paymentIntent.id}`);
  return paymentIntent;
}

export const TEST_PAYMENT_METHODS = {
  SUCCESS: "pm_card_visa",
  DECLINE: "pm_card_chargeDeclined",
};

export const TEST_SEPA_IBANS = {
  SUCCESS: "ES2300120345030000067893",
  FAILURE: "ES1700120345000000343434",
};

export default stripe;
