import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStockLocationCodeToProductVariant1742032800001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variant"
      ADD COLUMN IF NOT EXISTS "stock_location_code" varchar(4) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variant"
      DROP COLUMN IF EXISTS "stock_location_code"
    `);
  }
}
