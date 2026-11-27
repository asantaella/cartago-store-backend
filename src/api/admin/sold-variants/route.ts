import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import SoldVariantsService from "../../../services/sold-variants";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const isValidDay = (value: unknown): value is string => {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
};

// GET /admin/sold-variants?date=YYYY-MM-DD
// Lists the line items of completed orders placed on that Europe/Madrid day,
// most recent sale first.
export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> => {
  const date = req.query.date;

  if (!isValidDay(date)) {
    res.status(400).json({
      type: "invalid_data",
      message: "date must be a valid day in YYYY-MM-DD format",
    });
    return;
  }

  const soldVariantsService: SoldVariantsService = req.scope.resolve(
    "soldVariantsService",
  );

  try {
    const sold = await soldVariantsService.listByDate(date);

    res.status(200).json({ sold, count: sold.length, date });
  } catch (error: any) {
    console.error("[SoldVariants Admin] list sold variants error:", error);
    res.status(500).json({
      type: "unknown_error",
      message: "Internal server error",
    });
  }
};
