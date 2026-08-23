import type { MiddlewaresConfig } from "@medusajs/medusa";
import { raw } from "body-parser";
import cors from "cors";
import {
  adjustCartShippingExtraOnGet,
  adjustCartShippingExtraOnPost,
  adjustCartPricingOnGet,
  adjustCartPricingOnPost,
  persistCartPricingOnComplete,
} from "./middlewares/cart-pricing";
import { applyDraftOrderSurchargeOnCreate } from "./middlewares/draft-order-surcharge-on-create";
import { handleDraftOrderLineItemMutation } from "./middlewares/draft-order-line-item-override";


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
      matcher: "/admin/draft-orders",
      method: "POST",
      middlewares: [applyDraftOrderSurchargeOnCreate],
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
  ],
};
