import { TransactionBaseService } from "@medusajs/medusa";
import { EntityManager } from "typeorm";

export const SOLD_DAY_TIMEZONE = "Europe/Madrid";

export type SoldVariantRow = {
  line_item_id: string;
  quantity: number;
  variant_id: string | null;
  variant_title: string | null;
  barcode: string | null;
  product_id: string | null;
  product_title: string | null;
  thumbnail: string | null;
  order_id: string;
  display_id: number;
  fulfillment_status: string | null;
  sold_at: Date;
};

export type SoldDaySummary = {
  // Line items of the day, across all pages.
  count: number;
  // Units sold: sum of quantity.
  units: number;
  // Minor units, summed per currency: unit_price * quantity. Excludes discounts and shipping.
  amounts: { currency_code: string; amount: number }[];
};

// The list and the summary share the same lines: captured or shipped orders
// created on the given Madrid day.
const SOLD_LINES_FROM = `
  FROM "order" o
  JOIN line_item li ON li.order_id = o.id`;

const SOLD_DAY_WHERE = `
 WHERE (o.payment_status = 'captured' OR o.fulfillment_status = 'shipped')
   AND (o.created_at AT TIME ZONE '${SOLD_DAY_TIMEZONE}')::date = $1::date`;

// One row per line item, most recent sale first.
const LIST_SQL = `
  SELECT li.id AS line_item_id,
         li.quantity,
         li.variant_id,
         pv.title AS variant_title,
         pv.barcode,
         p.id AS product_id,
         p.title AS product_title,
         p.thumbnail,
         o.id AS order_id,
         o.display_id,
         o.fulfillment_status,
         o.created_at AS sold_at
  ${SOLD_LINES_FROM}
    LEFT JOIN product_variant pv ON pv.id = li.variant_id
    LEFT JOIN product p ON p.id = pv.product_id
  ${SOLD_DAY_WHERE}
   ORDER BY o.created_at DESC, li.id ASC
   LIMIT $2 OFFSET $3`;

const SUMMARY_SQL = `
  SELECT o.currency_code,
         COUNT(li.id) AS lines,
         COALESCE(SUM(li.quantity), 0) AS units,
         COALESCE(SUM(li.unit_price * li.quantity), 0) AS amount
  ${SOLD_LINES_FROM}
  ${SOLD_DAY_WHERE}
  GROUP BY o.currency_code`;

const buildSummary = (rows: any[]): SoldDaySummary => ({
  count: rows.reduce((sum, row) => sum + Number(row.lines), 0),
  units: rows.reduce((sum, row) => sum + Number(row.units), 0),
  amounts: rows.map((row) => ({
    currency_code: row.currency_code,
    amount: Number(row.amount),
  })),
});

class SoldVariantsService extends TransactionBaseService {
  protected readonly manager_: EntityManager;

  constructor({ manager }: { manager: EntityManager }) {
    super(arguments[0]);
    this.manager_ = manager;
  }

  async listByDate(
    date: string,
    { limit, offset }: { limit: number; offset: number },
  ): Promise<{ sold: SoldVariantRow[]; summary: SoldDaySummary }> {
    const [rows, summaryRows] = await Promise.all([
      this.manager_.query(LIST_SQL, [date, limit, offset]),
      this.manager_.query(SUMMARY_SQL, [date]),
    ]);

    return {
      sold: rows.map((row: any) => ({
        ...row,
        quantity: Number(row.quantity),
        display_id: Number(row.display_id),
      })),
      summary: buildSummary(summaryRows),
    };
  }
}

export default SoldVariantsService;
