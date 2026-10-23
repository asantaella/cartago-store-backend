import { MigrationInterface, QueryRunner } from "typeorm";

export class BackfillProductVariantStockSnapshot1792796707976
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "product_variant"
      SET "metadata" = COALESCE("metadata", '{}'::jsonb) ||
        jsonb_build_object(
          'stock_zero_alert_last_inventory_quantity', "inventory_quantity"
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "product_variant"
      SET "metadata" = COALESCE("metadata", '{}'::jsonb) -
        'stock_zero_alert_last_inventory_quantity'
      WHERE "metadata" ? 'stock_zero_alert_last_inventory_quantity'
    `);
  }
}
