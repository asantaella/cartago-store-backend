import type { MiddlewaresConfig } from "@medusajs/medusa";
import { raw } from "body-parser";
import cors from "cors";

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
  ],
};
