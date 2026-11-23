import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import ProductAlertService from "../../../../../services/product-alert";

// GET /admin/product-alerts/variants/:variant_id
// Lists the pending and notified subscribers of a variant.
export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> => {
  const productAlertService: ProductAlertService =
    req.scope.resolve("productAlertService");

  const subscribers = await productAlertService.listActiveSubscribers(
    req.params.variant_id as string,
  );

  res.status(200).json({ subscribers, count: subscribers.length });
};
