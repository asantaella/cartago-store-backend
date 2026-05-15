import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import OrdersSummaryService from "../../../../services/orders-summary";

/**
 * POST /admin/orders/summary
 *
 * Sends the orders summary email on demand for the given date range.
 * Body (all optional):
 *   { start_date?: string, end_date?: string }
 *   Both dates must be in YYYY-MM-DD format and are interpreted as Spain time.
 *   If omitted, defaults to today in Spain time.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const ordersSummaryService: OrdersSummaryService = req.scope.resolve(
    "ordersSummaryService",
  );

  const todaySpain = ordersSummaryService.getSpainDateString(new Date());

  const rawStart = (req.body as Record<string, unknown>)?.start_date;
  const rawEnd = (req.body as Record<string, unknown>)?.end_date;

  const startDate =
    typeof rawStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawStart)
      ? rawStart
      : todaySpain;

  const endDate =
    typeof rawEnd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawEnd)
      ? rawEnd
      : startDate;

  if (endDate < startDate) {
    return res.status(400).json({ message: "end_date must be >= start_date" });
  }

  await ordersSummaryService.generateOrdersSummary(startDate, endDate);

  res
    .status(200)
    .json({ start_date: startDate, end_date: endDate, sent: true });
}
