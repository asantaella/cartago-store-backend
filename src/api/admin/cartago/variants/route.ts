import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const ORDER_DIRECTIONS: Record<string, "ASC" | "DESC"> = {
  inventory_quantity: "ASC",
  "-inventory_quantity": "DESC",
};

const firstValue = (value: unknown): unknown =>
  Array.isArray(value) ? value[0] : value;

const parseNonNegativeInt = (value: unknown, fallback: number) => {
  if (value === undefined || value === "") return fallback;

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

/**
 * Custom endpoint to list variants for stock management, sorted by stock.
 * GET /admin/cartago/variants?q=&order=inventory_quantity|-inventory_quantity
 *
 * Every whitespace-separated term of `q` must match (ILIKE) the variant
 * title, product title, sku or barcode. All user input is bound as a
 * query parameter.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const order = String(firstValue(req.query.order) ?? "inventory_quantity");
  const direction = ORDER_DIRECTIONS[order];
  const limit = parseNonNegativeInt(firstValue(req.query.limit), DEFAULT_LIMIT);
  const offset = parseNonNegativeInt(firstValue(req.query.offset), 0);

  if (!direction || limit === null || limit < 1 || offset === null) {
    return res.status(400).json({
      type: "invalid_data",
      message:
        "order must be inventory_quantity or -inventory_quantity; limit must be a positive integer and offset a non-negative integer",
    });
  }

  const pageSize = Math.min(limit, MAX_LIMIT);
  const terms = String(firstValue(req.query.q) ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const params: unknown[] = [];
  const conditions = [
    "v.deleted_at IS NULL",
    "p.deleted_at IS NULL",
    "p.is_giftcard = false",
  ];

  for (const term of terms) {
    params.push(`%${escapeLike(term)}%`);
    const n = params.length;
    conditions.push(
      `(v.title ILIKE $${n} OR p.title ILIKE $${n} OR v.sku ILIKE $${n} OR v.barcode ILIKE $${n})`,
    );
  }

  const from = `FROM product_variant v
    JOIN product p ON p.id = v.product_id
    WHERE ${conditions.join(" AND ")}`;

  const manager = req.scope.resolve("manager");

  const [variants, [countRow]] = await Promise.all([
    manager.query(
      `SELECT v.id, v.title, v.sku, v.barcode, v.inventory_quantity,
        v.stock_location_code,
        json_build_object('id', p.id, 'title', p.title) AS product,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', ma.id,
            'currency_code', ma.currency_code,
            'amount', ma.amount,
            'price_list_id', ma.price_list_id
          ) ORDER BY ma.id)
          FROM money_amount ma
          JOIN product_variant_money_amount pvma ON pvma.money_amount_id = ma.id
          WHERE pvma.variant_id = v.id AND pvma.deleted_at IS NULL
            AND ma.deleted_at IS NULL
        ), '[]'::json) AS prices
      ${from}
      ORDER BY v.inventory_quantity ${direction}, v.id ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    ),
    manager.query(`SELECT COUNT(*) AS count ${from}`, params),
  ]);

  return res.status(200).json({
    variants,
    count: Number(countRow.count),
    offset,
    limit: pageSize,
  });
}
