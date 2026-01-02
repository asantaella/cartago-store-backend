import type { MiddlewaresConfig } from "@medusajs/medusa";
import { raw } from "body-parser";
import cors from "cors";
import {
  adjustCartPricingOnGet,
  adjustCartPricingOnPost,
  persistCartPricingOnComplete,
} from "./middlewares/cart-pricing";
import {
  adjustDraftOrderPricingOnGet,
  adjustDraftOrderPricingOnPost,
} from "./middlewares/draft-order-pricing";

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
      middlewares: [adjustCartPricingOnGet],
    },
    // Middleware para ajustar precios en POST/PATCH /store/carts/* (solo en respuesta)
    {
      matcher: "/store/carts/*",
      method: ["POST", "PATCH"],
      middlewares: [adjustCartPricingOnPost],
    },
    // Middleware para persistir precios antes de completar la orden
    {
      matcher: "/store/carts/:id/complete",
      method: "POST",
      middlewares: [persistCartPricingOnComplete],
    },
    // Middleware para ajustar precios en GET /admin/draft-orders/:id (solo lectura)
    {
      matcher: "/admin/draft-orders/:id",
      method: "GET",
      middlewares: [adjustCartPricingOnGet],
    },
  ],
};
