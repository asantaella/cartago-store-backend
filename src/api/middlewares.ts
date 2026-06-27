import type { MiddlewaresConfig } from "@medusajs/medusa";
import { raw } from "body-parser";
import cors from "cors";
import { parseCorsOrigins } from "medusa-core-utils";
import {
  adjustCartShippingExtraOnGet,
  adjustCartShippingExtraOnPost,
  adjustCartPricingOnGet,
  adjustCartPricingOnPost,
  persistCartPricingOnComplete,
} from "./middlewares/cart-pricing";
import {
  adjustDraftOrderPricingOnGet,
  adjustDraftOrderPricingOnPost,
  persistDraftOrderPricing,
} from "./middlewares/draft-order-pricing";

// CORS origins para admin y store, consistentes con medusa-config.js
const adminCorsOrigin = parseCorsOrigins(
  process.env.ADMIN_CORS || "http://localhost:7001"
);

export const config: MiddlewaresConfig = {
  routes: [
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
      matcher: "/store/carts/:id/complete",
      method: "POST",
      middlewares: [persistCartPricingOnComplete],
    },
    // ─── Draft orders ─────────────────────────────────────────────────
    // Los middlewares custom con method:"POST" crean route layers en Express
    // que interceptan el preflight OPTIONS sin agregar headers CORS.
    // Solución: agregar entradas USE (sin method) con cors() ANTES de las
    // entradas POST/GET, así el preflight OPTIONS recibe headers CORS.
    // ───────────────────────────────────────────────────────────────────
    {
      matcher: "/admin/draft-orders",
      middlewares: [
        cors({ origin: adminCorsOrigin, credentials: true }),
      ],
    },
    {
      matcher: "/admin/draft-orders",
      method: "POST",
      middlewares: [adjustDraftOrderPricingOnPost],
    },
    {
      matcher: "/admin/draft-orders/:id",
      middlewares: [
        cors({ origin: adminCorsOrigin, credentials: true }),
      ],
    },
    {
      matcher: "/admin/draft-orders/:id",
      method: "POST",
      middlewares: [adjustDraftOrderPricingOnPost],
    },
    {
      matcher: "/admin/draft-orders/:id",
      method: "GET",
      middlewares: [adjustCartPricingOnGet],
    },
    {
      matcher: "/admin/draft-orders/:id/line-items",
      middlewares: [
        cors({ origin: adminCorsOrigin, credentials: true }),
      ],
    },
    {
      matcher: "/admin/draft-orders/:id/line-items",
      method: "POST",
      middlewares: [adjustDraftOrderPricingOnPost],
    },
    {
      matcher: "/admin/draft-orders/:id/line-items/:line_id",
      middlewares: [
        cors({ origin: adminCorsOrigin, credentials: true }),
      ],
    },
    {
      matcher: "/admin/draft-orders/:id/line-items/:line_id",
      method: ["POST", "DELETE"],
      middlewares: [adjustDraftOrderPricingOnPost],
    },
    {
      matcher: "/admin/draft-orders/:id/pay",
      middlewares: [
        cors({ origin: adminCorsOrigin, credentials: true }),
      ],
    },
    {
      matcher: "/admin/draft-orders/:id/pay",
      method: "POST",
      middlewares: [persistDraftOrderPricing],
    },
  ],
};