import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import SoldVariantsService from "../../../services/sold-variants";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const isValidDay = (value: unknown): value is string => {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
};

const toInt = (value: unknown, fallback: number): number => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

// GET /admin/sold-variants?date=YYYY-MM-DD&limit=20&offset=0
// Lists one page of the line items sold on that Europe/Madrid day, most recent
// sale first, with a summary of the whole day (not only the page).
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

  const limit = Math.min(
    Math.max(toInt(req.query.limit, DEFAULT_LIMIT), 1),
    MAX_LIMIT,
  );
  const offset = Math.max(toInt(req.query.offset, 0), 0);

  const soldVariantsService: SoldVariantsService = req.scope.resolve(
    "soldVariantsService",
  );

  try {
    const { sold, summary } = await soldVariantsService.listByDate(date, {
      limit,
      offset,
    });

    res.status(200).json({ sold, count: summary.count, summary, limit, offset, date });
  } catch (error: any) {
    console.error("[SoldVariants Admin] list sold variants error:", error);
    res.status(500).json({
      type: "unknown_error",
      message: "Internal server error",
    });
  }
};
