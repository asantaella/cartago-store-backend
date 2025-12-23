const dotenv = require("dotenv");
const path = require("path");

let ENV_FILE_NAME = "";
switch (process.env.NODE_ENV) {
  case "production":
    ENV_FILE_NAME = ".env.production";
    break;
  case "staging":
    ENV_FILE_NAME = ".env.staging";
    break;
  case "test":
    ENV_FILE_NAME = ".env.test";
    break;
  case "development":
  default:
    ENV_FILE_NAME = ".env.local";
    break;
}

try {
  console.log("current ADMIN_CORS = ", process.env.ADMIN_CORS);
  console.log("current STORE_CORS = ", process.env.STORE_CORS);
  console.log(
    "current MEDUSA_ADMIN_BACKEND = ",
    process.env.MEDUSA_ADMIN_BACKEND_URL
  );
  dotenv.config({ path: process.cwd() + "/.env" });
  dotenv.config({ path: process.cwd() + "/" + ENV_FILE_NAME, override: false });
  console.log("Loaded ENV file: ", process.cwd() + "/" + ENV_FILE_NAME);
  console.log("ADMIN_CORS = ", process.env.ADMIN_CORS);
  console.log("STORE_CORS = ", process.env.STORE_CORS);
  console.log("MEDUSA_ADMIN_BACKEND = ", process.env.MEDUSA_ADMIN_BACKEND_URL);
  console.log("BUCKET URL = ", process.env.R2_PUBLIC_URL);
} catch (e) {}


const DATABASE_URL =
  process.env.DATABASE_URL || "postgres://localhost/medusa-store";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const plugins = [
  `medusa-fulfillment-manual`,

  {
    resolve: "medusa-file-r2",
    options: {
      account_id: process.env.R2_ACCOUNT_ID,
      access_key: process.env.R2_ACCESS_KEY,
      secret_key: process.env.R2_SECRET_KEY,
      bucket: process.env.R2_BUCKET_NAME,
      public_url: process.env.R2_PUBLIC_URL,
    },
  },
  `medusa-payment-manual`,
  {
    resolve: `medusa-payment-paypal`,
    options: {
      client_id: process.env.PAYPAL_CLIENT_ID,
      client_secret: process.env.PAYPAL_CLIENT_SECRET,
      sandbox: process.env.PAYPAL_SANDBOX === "true",
      auth_webhook_id: process.env.PAYPAL_AUTH_WEBHOOK_ID,
      capture: true,
    },
  },
  {
    resolve: `medusa-payment-stripe`,
    options: {
      api_key: process.env.STRIPE_API_KEY,
      webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
      capture: true,
      automatic_payment_methods: true,
    },
  },

];

const modules = {
  eventBus: {
    resolve: "@medusajs/event-bus-redis",
    options: {
      redisUrl: REDIS_URL,
    },
  },
  cacheService: {
    resolve: "@medusajs/cache-redis",
    options: {
      redisUrl: REDIS_URL,
    },
  },
};

/** @type {import('@medusajs/medusa').ConfigModule["projectConfig"]} */
const projectConfig = {
  jwtSecret: process.env.JWT_SECRET,
  cookieSecret: process.env.COOKIE_SECRET,
  store_cors: process.env.STORE_CORS,
  admin_cors: process.env.ADMIN_CORS,
  auth_cors: process.env.AUTH_CORS,
  database_url: DATABASE_URL,
  redis_url: REDIS_URL,
};

/** @type {import('@medusajs/medusa').ConfigModule} */
module.exports = {
  projectConfig,
  plugins,
  modules,
  featureFlags: {
    tax_inclusive_pricing: true,
    product_categories: true,
  },
};
