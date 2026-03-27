import { MigrationInterface, QueryRunner } from "typeorm";

export class AddShippingOptionPriceExtraToProductVariant1742032800000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variant"
      ADD COLUMN IF NOT EXISTS "shipping_option_price_extra" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variant"
      DROP COLUMN IF EXISTS "shipping_option_price_extra"
    `);
  }
}
