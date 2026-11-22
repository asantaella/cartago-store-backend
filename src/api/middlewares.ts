import type { MiddlewaresConfig } from "@medusajs/medusa";
import { json, raw } from "body-parser";
import cors from "cors";
import { parseCorsOrigins } from "medusa-core-utils";
import {
  adjustCartShippingExtraOnGet,
  adjustCartShippingExtraOnPost,
  adjustCartPricingOnGet,
  adjustCartPricingOnPost,
  persistCartPricingOnComplete,
} from "./middlewares/cart-pricing";
import { applyDraftOrderSurchargeOnCreate } from "./middlewares/draft-order-surcharge-on-create";
import { handleDraftOrderLineItemCreation } from "./middlewares/draft-order-line-item-create";
import { handleDraftOrderLineItemMutation } from "./middlewares/draft-order-line-item-override";
import { requireNifCifOnPaymentSession } from "./middlewares/nif-cif-on-payment-session";
import {
  extendProductVariantPatchPayload,
  extendProductVariantPostPayload,
} from "./middlewares/product-variant-payload";

// CORS origins para admin y store, consistentes con medusa-config.js
const adminCorsOrigin = parseCorsOrigins(
  process.env.ADMIN_CORS || "http://localhost:7001",
);

export const config: MiddlewaresConfig = {
  routes: [
    {
      // Stripe signs the exact bytes received; do not let the global JSON
      // parser consume this request before the source-owned route verifies it.
      matcher: "/stripe/hooks",
      bodyParser: false,
      middlewares: [raw({ type: "application/json" })],
    },
    {
      matcher: "/store/orders/*/invoice",
      bodyParser: false,
      middlewares: [
        cors({
          origin: "*",
          credentials: true,
        }),
        raw({ type: "application/pdf" }),
      ],
    },
    {
      matcher: "/admin/orders/*/invoice",
      bodyParser: false,
      middlewares: [
        cors({
          origin: "*",
          credentials: true,
        }),
        raw({ type: "application/pdf" }),
      ],
    },
    // Extend the native variant update payload with Cartago fields before
    // Medusa validates the request body.
    {
      matcher: "/admin/products/:id/variants/:variant_id",
      method: "POST",
      middlewares: [extendProductVariantPostPayload],
    },
    // PATCH is a Cartago compatibility route in Medusa v1; keep its payload
    // aligned with the native POST field names.
    {
      matcher: "/admin/products/:id/variants/:variant_id",
      method: "PATCH",
      middlewares: [extendProductVariantPatchPayload],
    },
    // Middleware para ajustar precios en GET /store/carts/*
    {
      matcher: "/store/carts/*",
      method: "GET",
      middlewares: [adjustCartPricingOnGet, adjustCartShippingExtraOnGet],
    },
    // Middleware para ajustar precios en POST/PATCH /store/carts/* (solo en respuesta)
    {
      matcher: "/store/carts/*",
      method: ["POST", "PATCH"],
      middlewares: [adjustCartShippingExtraOnPost, adjustCartPricingOnPost],
    },
    // Middleware para persistir precios antes de completar la orden
    {
      matcher: "/admin/draft-orders",
      method: "POST",
      middlewares: [
        cors({
          origin: process.env.ADMIN_CORS || "http://localhost:7001",
          credentials: true,
        }),
        applyDraftOrderSurchargeOnCreate,
      ],
    },
    {
      matcher: "/admin/draft-orders",
      method: "OPTIONS",
      middlewares: [
        cors({
          origin: process.env.ADMIN_CORS || "http://localhost:7001",
          credentials: true,
        }),
      ],
    },
    {
      matcher: "/admin/draft-orders/:id/line-items",
      method: "POST",
      middlewares: [
        cors({
          origin: process.env.ADMIN_CORS || "http://localhost:7001",
          credentials: true,
        }),
        json(),
        handleDraftOrderLineItemCreation,
      ],
    },
    {
      matcher: "/admin/draft-orders/:id/line-items",
      method: "OPTIONS",
      middlewares: [
        cors({
          origin: process.env.ADMIN_CORS || "http://localhost:7001",
          credentials: true,
        }),
      ],
    },
    {
      matcher: "/admin/draft-orders/:id/line-items/*",
      method: ["POST", "DELETE"],
      middlewares: [
        cors({
          origin: process.env.ADMIN_CORS || "http://localhost:7001",
          credentials: true,
        }),
        handleDraftOrderLineItemMutation,
      ],
    },
    {
      matcher: "/admin/draft-orders/:id/line-items/*",
      method: "OPTIONS",
      middlewares: [
        cors({
          origin: process.env.ADMIN_CORS || "http://localhost:7001",
          credentials: true,
        }),
      ],
    },
    {
      matcher: "/store/carts/:id/complete",
      method: "POST",
      middlewares: [persistCartPricingOnComplete],
    },
    // NIF/CIF is required for EUR carts of €400 or more before a payment
    // session can be selected. Session creation is intentionally not guarded.
    ...[
      "/store/carts/:id/payment-session",
      "/store/carts/:id/payment-session-context",
      "/store/carts/:id/payment-sessions/:provider_id",
      "/store/carts/:id/payment-sessions/:provider_id/refresh",
    ].map((matcher) => ({
      matcher,
      method: "POST" as const,
      middlewares: [requireNifCifOnPaymentSession],
    })),
  ],
};
