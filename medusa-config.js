const dotenv = require("dotenv");

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

// CORS when consuming Medusa from admin
const ADMIN_CORS =
  process.env.ADMIN_CORS || "http://localhost:7000,http://localhost:7001";

// CORS to avoid issues when consuming Medusa from a client
const STORE_CORS = process.env.STORE_CORS || "http://localhost:8000";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgres://localhost/medusa-store";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const plugins = [
  `medusa-fulfillment-manual`,
  // {
  //   resolve: `@medusajs/file-local`,
  //   options: {
  //     upload_dir: "uploads",
  //   },
  // },
  {
    resolve: "@medusajs/admin",
    /** @type {import('@medusajs/admin').PluginOptions} */
    options: {
      serve: false,
      backend: process.env.MEDUSA_ADMIN_BACKEND_URL,
      develop: {
        open: process.env.OPEN_BROWSER !== "false",
      },
    },
  },
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
      sandbox: process.env.PAYPAL_SANDBOX,
      clientId: process.env.PAYPAL_CLIENT_ID,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET,
      authWebhookId: process.env.PAYPAL_AUTH_WEBHOOK_ID,
    },
  },
  {
    resolve: `medusa-payment-stripe`,
    options: {
      api_key: process.env.STRIPE_API_KEY,
      webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
    },
  },
  {
    resolve: `medusa-plugin-sendgrid`,
    options: {
      api_key: process.env.SENDGRID_API_KEY,
      from: process.env.SENDGRID_FROM,
      order_placed_template: process.env.SENDGRID_ORDER_PLACED_ID,
      localization: {
        "es-ES": {
          //order_placed_template: process.env.SENDGRID_ORDER_PLACED_ID_LOCALIZED,
          order_placed_template: process.env.SENDGRID_ORDER_PLACED_ID,
        },
      },
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
  store_cors: STORE_CORS,
  admin_cors: ADMIN_CORS,
  database_url: DATABASE_URL,
  redis_url: REDIS_URL,
};

/** @type {import('@medusajs/medusa').ConfigModule} */
module.exports = {
  projectConfig,
  plugins,
  modules,
};
