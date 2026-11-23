import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import ProductAlertService from "../../../services/product-alert";

// GET /admin/product-alerts
// Lists variants with pending or notified back-in-stock subscriptions,
// with the count of each status.
export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> => {
  const productAlertService: ProductAlertService =
    req.scope.resolve("productAlertService");

  const variants = await productAlertService.listVariantsWithActiveSubscriptions();

  res.status(200).json({ variants, count: variants.length });
};
