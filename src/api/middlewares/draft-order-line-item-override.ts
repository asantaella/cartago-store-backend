import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { NextFunction } from "express";
import {
  DELETE,
  POST,
} from "../admin/cartago/draft-orders/[id]/line-items/[line_id]/route";

/**
 * Routes the standard Medusa admin line-item endpoints through the Cartago
 * transaction that restores shipping methods and applies the surcharge.
 */
export async function handleDraftOrderLineItemMutation(
  req: MedusaRequest,
  res: MedusaResponse,
  next: NextFunction,
): Promise<void> {
  // Express exposes the `*` matcher as a numeric parameter, while the
  // replicated Medusa handler expects `req.params.line_id`.
  if (!req.params.line_id) {
    const pathSegments = req.path.split("/").filter(Boolean);
    req.params.line_id = pathSegments[pathSegments.length - 1];
  }

  if (req.method === "POST") {
    await POST(req, res);
    return;
  }

  if (req.method === "DELETE") {
    await DELETE(req, res);
    return;
  }

  next();
}
