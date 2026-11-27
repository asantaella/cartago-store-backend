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
  sold_at: Date;
};

// One row per line item of a completed order created on the given Madrid day,
// most recent sale first. A total refund moves the order to "refunded", so it
// drops out of the completed set.
const LIST_BY_DATE_SQL = `
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
         o.created_at AS sold_at
    FROM "order" o
    JOIN line_item li ON li.order_id = o.id AND li.deleted_at IS NULL
    LEFT JOIN product_variant pv ON pv.id = li.variant_id
    LEFT JOIN product p ON p.id = pv.product_id
   WHERE o.status = 'completed'
     AND o.deleted_at IS NULL
     AND (o.created_at AT TIME ZONE '${SOLD_DAY_TIMEZONE}')::date = $1::date
   ORDER BY o.created_at DESC, li.id ASC`;

class SoldVariantsService extends TransactionBaseService {
  protected readonly manager_: EntityManager;

  constructor({ manager }: { manager: EntityManager }) {
    super(arguments[0]);
    this.manager_ = manager;
  }

  async listByDate(date: string): Promise<SoldVariantRow[]> {
    const rows = await this.manager_.query(LIST_BY_DATE_SQL, [date]);

    return rows.map((row: any) => ({
      ...row,
      quantity: Number(row.quantity),
      display_id: Number(row.display_id),
    }));
  }
}

export default SoldVariantsService;
